package com.victuscloud.ecosystem;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The network executor for every call this app makes to the Victus Cloud control
 * panel: {@link HttpURLConnection} with a small in-memory cookie jar.
 *
 * <p>It exists because the panel's authentication is cookie-based (the login POST
 * sets {@code pterodactyl_session}, and {@code GET /auth/login} sets
 * {@code XSRF-TOKEN}), and because the bundle runs on
 * {@code appassets.androidplatform.net} — a request from JavaScript would be
 * cross-origin and blocked. Native HTTP has no such restriction, and the
 * credentials never enter the WebView's JavaScript context.</p>
 *
 * <p>Cookies live in memory only. The durable credential is the API key minted
 * after sign-in, which is what {@link SecureStore} persists.</p>
 *
 * <p>Blocking calls — always invoke from a background thread.</p>
 */
final class VictusHttp {

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 25_000;
    private static final int MAX_BODY_BYTES = 2 * 1024 * 1024;

    /** A browser-shaped UA: the panel sits behind Cloudflare, which treats the
     *  default JVM/Dalvik user agent as a bot far more often. */
    private static final String USER_AGENT = "VictusCloudAndroid/2.3";

    /** Result of one request. Never null — network failures come back with status 0. */
    static final class Response {
        final int status;
        final String body;
        final Map<String, String> cookies;
        final String failure;
        /**
         * The panel's own clock, from the response's {@code Date} header, as epoch
         * millis; -1 when the header was absent or unparseable. Every ordinary HTTP
         * response carries it, so this is a free, exact sample of server time — the
         * only trustworthy clock an authenticator code can be aligned to.
         */
        final long serverDateMillis;

        Response(int status, String body, Map<String, String> cookies, String failure) {
            this(status, body, cookies, failure, -1L);
        }

        Response(int status, String body, Map<String, String> cookies, String failure,
                 long serverDateMillis) {
            this.status = status;
            this.body = body == null ? "" : body;
            this.cookies = cookies == null ? new LinkedHashMap<>() : cookies;
            this.failure = failure;
            this.serverDateMillis = serverDateMillis;
        }

        boolean isNetworkFailure() {
            return status == 0;
        }

        boolean isSuccess() {
            return status >= 200 && status < 300;
        }
    }

    private final Map<String, String> cookies = new LinkedHashMap<>();

    /** Drops every cookie. Used when the session is no longer wanted. */
    void clearCookies() {
        cookies.clear();
    }

    boolean hasCookies() {
        return !cookies.isEmpty();
    }

    /**
     * One cookie's value, or null. Used to read the {@code XSRF-TOKEN} the way the
     * panel's own frontend does — after the password POST the session has been
     * regenerated, so this cookie is the only CSRF source that is still current.
     */
    String cookie(String name) {
        return name == null ? null : cookies.get(name);
    }

    Response get(String path) {
        return request("GET", path, null, null, null, true);
    }

    Response post(String path, String jsonBody, String csrfToken) {
        return request("POST", path, jsonBody, csrfToken, null, true);
    }

    /** Any method, authenticated by this instance's session cookies. */
    Response send(String method, String path, String jsonBody, String csrfToken) {
        return request(method, path, jsonBody, csrfToken, null, true);
    }

    /**
     * A stateless request authenticated by an API key instead of the session
     * cookies: a throwaway jar is used deliberately, so a key-authenticated call
     * can never carry (or leave behind) the browser session's cookies.
     */
    static Response bearerRequest(String method, String path, String jsonBody, String bearer) {
        return new VictusHttp().request(method, path, jsonBody, null, bearer, false);
    }

    /**
     * A state-changing call (POST/PUT/DELETE) authenticated by an API key.
     *
     * <p>This panel applies its CSRF check to client-API writes even when they
     * carry a bearer key — a key-authenticated POST without the token is answered
     * 419 "CSRF token mismatch." (verified against control.victuscloud.com). The
     * panel's own SPA always sends one, and so does the session path here
     * ({@link #post}). So the write first collects the panel's CSRF cookies in a
     * throwaway jar — {@code GET /sanctum/csrf-cookie} issues them without needing
     * a session, and the login page sets the same ones — and {@link #request} then
     * echoes the cookie's token back as {@code X-XSRF-TOKEN}. The anonymous
     * cookies carry no credential, so the key call still never carries the
     * user's session.</p>
     */
    static Response bearerWrite(String method, String path, String jsonBody, String bearer) {
        VictusHttp jar = new VictusHttp();
        VictusHttp.Response seed = jar.get("/sanctum/csrf-cookie");
        if (seed.isNetworkFailure() || jar.cookies.get("XSRF-TOKEN") == null) {
            // Either route may be missing on a panel build; the login page sets
            // the same pair of cookies.
            jar.get(VictusApi.PATH_LOGIN);
        }
        return jar.request(method, path, jsonBody, null, bearer, true);
    }

    /**
     * @param csrfToken fallback CSRF token, sent as {@code X-CSRF-TOKEN} only when
     *                  the jar holds no {@code XSRF-TOKEN} cookie.
     * @param bearer    {@code Authorization} header value, or null.
     * @param useCookies whether this instance's cookie jar participates.
     *
     * <p>CSRF is taken from the {@code XSRF-TOKEN} cookie the way the panel's own
     * frontend (axios) does, and the cookie is deliberately preferred over the
     * page's meta token: Laravel regenerates the token when a login succeeds, so
     * the meta value read before signing in is already stale for the very next
     * request (minting the API key). Only one of the two headers may be sent —
     * Laravel checks {@code X-CSRF-TOKEN} first and fails the request if that one
     * is stale — so this picks the fresh source rather than sending both.</p>
     */
    private Response request(String method, String path, String jsonBody, String csrfToken,
                             String bearer, boolean useCookies) {
        String url = path.startsWith("http") ? path : VictusApi.url(path);
        if (!VictusApi.isAcceptableUrl(url)) {
            return new Response(0, "", null, "Refused a non-Victus URL");
        }

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod(method);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setRequestProperty("Accept-Language", "en");
            conn.setRequestProperty("X-Requested-With", "XMLHttpRequest");
            conn.setRequestProperty("Origin", VictusApi.BASE_URL);
            conn.setRequestProperty("Referer", VictusApi.BASE_URL + path);
            if (useCookies && !cookies.isEmpty()) {
                conn.setRequestProperty("Cookie", cookieHeader());
            }
            String xsrfCookie = useCookies ? cookies.get("XSRF-TOKEN") : null;
            if (xsrfCookie != null && !xsrfCookie.trim().isEmpty()) {
                conn.setRequestProperty("X-XSRF-TOKEN", urlDecode(xsrfCookie));
            } else if (csrfToken != null && !csrfToken.trim().isEmpty()) {
                conn.setRequestProperty(VictusApi.CSRF_HEADER, csrfToken.trim());
            }
            if (bearer != null && !bearer.trim().isEmpty()) {
                conn.setRequestProperty("Authorization", bearer.trim());
            }
            if (jsonBody != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                byte[] payload = jsonBody.getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(payload.length);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(payload);
                }
            }

            int status = conn.getResponseCode();
            if (useCookies) storeCookies(conn.getHeaderFields());
            long serverDate = TotpWindow.parseHttpDate(conn.getHeaderField("Date"));

            // 4xx/5xx bodies carry the panel's explanation, so read both streams.
            InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String body = stream == null ? "" : readAll(stream);
            return new Response(status, body, new LinkedHashMap<>(cookies), null, serverDate);
        } catch (Exception failure) {
            String reason = failure.getMessage() == null
                    ? failure.getClass().getSimpleName()
                    : failure.getMessage();
            return new Response(0, "", new LinkedHashMap<>(cookies), reason, -1L);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String urlDecode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8.name());
        } catch (Exception malformed) {
            return value;
        }
    }

    private String cookieHeader() {
        StringBuilder header = new StringBuilder();
        for (Map.Entry<String, String> cookie : cookies.entrySet()) {
            if (header.length() > 0) header.append("; ");
            header.append(cookie.getKey()).append('=').append(cookie.getValue());
        }
        return header.toString();
    }

    /** Only {@code name=value} is kept; attributes such as Path/HttpOnly are ignored. */
    private void storeCookies(Map<String, List<String>> headers) {
        if (headers == null) return;
        for (Map.Entry<String, List<String>> header : headers.entrySet()) {
            String name = header.getKey();
            if (name == null || !name.equalsIgnoreCase("Set-Cookie")) continue;
            for (String value : header.getValue()) {
                if (value == null) continue;
                int equals = value.indexOf('=');
                if (equals <= 0) continue;
                String cookieName = value.substring(0, equals).trim();
                int end = value.indexOf(';', equals);
                String cookieValue = (end < 0 ? value.substring(equals + 1)
                        : value.substring(equals + 1, end)).trim();
                if (cookieName.isEmpty()) continue;
                if (cookieValue.isEmpty()) cookies.remove(cookieName);
                else cookies.put(cookieName, cookieValue);
            }
        }
    }

    private static String readAll(InputStream stream) throws Exception {
        try (InputStream in = stream; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8 * 1024];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
                if (buffer.size() > MAX_BODY_BYTES) break;
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        }
    }
}
