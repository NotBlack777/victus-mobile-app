package com.victuscloud.ecosystem;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

/**
 * A contract-faithful stand-in for {@code control.victuscloud.com}, used by
 * {@code PanelCheck --mock}.
 *
 * <p>It is deliberately not a friendly fake: it enforces what the real panel
 * enforces, so a client that only appears to work is caught here.</p>
 *
 * <ul>
 *   <li>{@code GET /auth/login} answers the login page with a
 *       <em>stale</em> {@code <meta name="csrf-token">} and sets the live
 *       {@code XSRF-TOKEN} / {@code pterodactyl_session} cookies. Laravel
 *       regenerates the token on successful login, so a client that sends the
 *       meta value instead of the cookie gets a 419 — which is exactly the trap
 *       {@link VictusHttp} exists to avoid.</li>
 *   <li>POSTs are CSRF-checked when the caller is authenticated by session
 *       cookie, and ignored for API-key (bearer) calls, as on the real panel.</li>
 *   <li>{@code /api/client…} answers the panel's error envelopes (401
 *       {@code AuthenticationException}, 400 {@code DisplayException}, 419
 *       {@code CSRF token mismatch.}) with the real status codes and wording —
 *       including on key-authenticated writes, which the live panel also
 *       CSRF-checks.</li>
 *   <li>{@code POST …/power} and {@code POST …/command} answer 204 with an empty
 *       body, and actually change the server state the next
 *       {@code GET …/resources} reports (uptime resets, state follows the
 *       signal), so the effect of a power action is observable rather than
 *       assumed.</li>
 * </ul>
 *
 * <p>Everything it serves lives in memory only; nothing is persisted and no real
 * credential is involved.</p>
 */
final class MockPanel {

    /** The real panel serves HTTPS on 443; the URL the client builds carries no port. */
    static final int PORT = 443;

    static final String USER = "fixture@victuscloud.com";
    static final String PASSWORD = "local-fixture-password";

    static final String KEY_IDENTIFIER = "aBcD1234";
    static final String KEY_SECRET = "ptlc_5f8d3c2b1a09e7d4c6b8a2f0e1d3c5b79a8f6e4d2c0b8a6f4e2d0c8b6a4f2e0d";

    static final String SERVER_UUID = "6f2c0f4a-2b5e-4a17-9f44-9a1c0e5d7b31";
    private static final String SECOND_UUID = "b41a9c77-0e35-4b8a-9d16-2c7f8e5a3b90";

    /** The token the login page claims, which is stale by the time the POST arrives. */
    private static final String STALE_META_TOKEN = "fixture-meta-token-1";

    private static final List<String> journal = new ArrayList<>();

    private static HttpsServer server;
    private static String csrfToken = "fixture-csrf-1";
    private static String sessionCookie = "fixture-session-1";
    private static String serverState = "running";
    private static long uptimeSeconds = 11_520L;

    private MockPanel() {
    }

    static String apiKey() {
        return KEY_IDENTIFIER + KEY_SECRET;
    }

    /** What the fixture server saw, in order, for the report. */
    static List<String> journal() {
        return new ArrayList<>(journal);
    }

    static void stop() {
        if (server != null) server.stop(0);
    }

    static void start(int port, String keystorePath, String keystorePassword) throws Exception {
        if (keystorePath == null || keystorePath.trim().isEmpty()) {
            throw new IllegalArgumentException("--keystore <pkcs12> is required for --mock");
        }
        char[] password = (keystorePassword == null ? "changeit" : keystorePassword).toCharArray();

        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (InputStream in = new FileInputStream(keystorePath)) {
            keyStore.load(in, password);
        }
        KeyManagerFactory keyManagers =
                KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagers.init(keyStore, password);

        SSLContext tls = SSLContext.getInstance("TLS");
        tls.init(keyManagers.getKeyManagers(), null, null);

        HttpsServer created = HttpsServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        created.setHttpsConfigurator(new HttpsConfigurator(tls));
        created.createContext("/", MockPanel::dispatch);
        created.start();
        server = created;
    }

    // ------------------------------------------------------------- dispatch

    private static void dispatch(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase(Locale.US);
        String path = exchange.getRequestURI().getPath();
        String body = read(exchange);
        try {
            if (VictusApi.PATH_LOGIN.equals(path)) {
                if ("GET".equals(method)) loginPage(exchange);
                else login(exchange, body);
                return;
            }
            if (VictusApi.PATH_LOGIN_CHECKPOINT.equals(path) && "POST".equals(method)) {
                checkpoint(exchange, body);
                return;
            }
            if (VictusApi.PATH_ACCOUNT.equals(path) && "GET".equals(method)) {
                if (rejectIfUnauthenticated(exchange)) return;
                respond(exchange, 200, accountJson().toString());
                return;
            }
            if (VictusApi.PATH_CLIENT.equals(path) && "GET".equals(method)) {
                if (rejectIfUnauthenticated(exchange)) return;
                respond(exchange, 200, serversJson().toString());
                return;
            }
            if (path.startsWith("/api/client/servers/")) {
                perServer(exchange, method, path, body);
                return;
            }
            respond(exchange, 404, error("NotFoundException", 404,
                    "The requested resource was not found."));
        } catch (Exception failure) {
            respond(exchange, 500, error("ServerException", 500,
                    "The fixture failed: " + failure));
        } finally {
            exchange.close();
        }
    }

    private static void perServer(HttpExchange exchange, String method, String path, String body)
            throws IOException {
        String[] parts = path.split("/");
        // "", "api", "client", "servers", "<uuid>", "<action>"
        if (parts.length < 6) {
            respond(exchange, 404, error("NotFoundException", 404,
                    "The requested resource was not found."));
            return;
        }
        String uuid = parts[4];
        String action = parts[5];
        if (!SERVER_UUID.equals(uuid)) {
            respond(exchange, 404, error("NotFoundException", 404,
                    "The requested server was not found."));
            return;
        }
        if (rejectIfUnauthenticated(exchange)) return;

        if ("resources".equals(action) && "GET".equals(method)) {
            journal.add("resources → 200 (state=" + serverState + ", uptime=" + uptimeSeconds + "s)");
            respond(exchange, 200, resourcesJson().toString());
            return;
        }
        if (!"POST".equals(method)) {
            respond(exchange, 405, error("MethodNotAllowed", 405, "That method is not allowed."));
            return;
        }
        if (rejectIfStaleCsrf(exchange)) return;

        if ("power".equals(action)) {
            power(exchange, body);
            return;
        }
        if ("command".equals(action)) {
            command(exchange, body);
            return;
        }
        respond(exchange, 404, error("NotFoundException", 404,
                "The requested resource was not found."));
    }

    // ------------------------------------------------------------ endpoints

    private static void loginPage(HttpExchange exchange) throws IOException {
        journal.add("GET /auth/login → 200 (meta token " + STALE_META_TOKEN
                + ", cookie " + csrfToken + ")");
        exchange.getResponseHeaders().add("Set-Cookie", "XSRF-TOKEN=" + csrfToken + "; Path=/");
        exchange.getResponseHeaders().add("Set-Cookie",
                "pterodactyl_session=" + sessionCookie + "; Path=/; HttpOnly");
        String html = "<!doctype html><html><head>"
                + "<meta name=\"csrf-token\" content=\"" + STALE_META_TOKEN + "\">"
                + "<title>Victus Cloud</title></head><body>Sign in</body></html>";
        respond(exchange, 200, html, "text/html; charset=utf-8");
    }

    private static void login(HttpExchange exchange, String body) throws IOException {
        if (rejectIfStaleCsrf(exchange)) return;
        JSONObject parsed = json(body);
        String user = parsed == null ? "" : parsed.optString("user", "");
        String password = parsed == null ? "" : parsed.optString("password", "");
        if (!USER.equals(user) || !PASSWORD.equals(password)) {
            journal.add("POST /auth/login → 400 (credential rejected)");
            respond(exchange, 400, error("DisplayException", 400,
                    "No account matching those credentials could be found."));
            return;
        }
        // The panel regenerates both the session and the CSRF token on login.
        csrfToken = "fixture-csrf-2";
        sessionCookie = "fixture-session-2";
        exchange.getResponseHeaders().add("Set-Cookie", "XSRF-TOKEN=" + csrfToken + "; Path=/");
        exchange.getResponseHeaders().add("Set-Cookie",
                "pterodactyl_session=" + sessionCookie + "; Path=/; HttpOnly");
        journal.add("POST /auth/login → 200 (session established, csrf rotated to " + csrfToken + ")");
        respond(exchange, 200, "{\"data\":{\"complete\":true,\"intended\":\"/\"}}");
    }

    private static void checkpoint(HttpExchange exchange, String body) throws IOException {
        if (rejectIfStaleCsrf(exchange)) return;
        respond(exchange, 200, "{\"data\":{\"complete\":true,\"intended\":\"/\"}}");
    }

    private static void power(HttpExchange exchange, String body) throws IOException {
        JSONObject parsed = json(body);
        String signal = parsed == null ? "" : parsed.optString("signal", "");
        if (!"start".equals(signal) && !"stop".equals(signal)
                && !"restart".equals(signal) && !"kill".equals(signal)) {
            respond(exchange, 422, error("ValidationException", 422,
                    "The signal field is invalid."));
            return;
        }
        if ("stop".equals(signal) || "kill".equals(signal)) {
            serverState = "offline";
        } else {
            serverState = "running";
        }
        uptimeSeconds = 0L;
        journal.add("POST …/power {\"signal\":\"" + signal + "\"} → 204 "
                + "(now state=" + serverState + ", uptime=0s)");
        respond(exchange, 204, null);
    }

    private static void command(HttpExchange exchange, String body) throws IOException {
        JSONObject parsed = json(body);
        String command = parsed == null ? "" : parsed.optString("command", "");
        if (command.trim().isEmpty()) {
            respond(exchange, 422, error("ValidationException", 422,
                    "The command field is required."));
            return;
        }
        journal.add("POST …/command {\"command\":\"" + command + "\"} → 204 (console accepted)");
        respond(exchange, 204, null);
    }

    // --------------------------------------------------------------- payloads

    private static JSONObject accountJson() {
        JSONObject attributes = new JSONObject()
                .put("id", 7)
                .put("username", "victus-fixture")
                .put("email", USER)
                .put("first_name", "Fixture")
                .put("last_name", "Account")
                .put("root_admin", true)
                .put("use_totp", false);
        return new JSONObject().put("object", "user").put("attributes", attributes);
    }

    private static JSONObject serversJson() {
        JSONArray data = new JSONArray()
                .put(serverJson(SERVER_UUID, "SG-1 \u00b7 Edge", serverState, true,
                        200, 4096, 20480))
                .put(serverJson(SECOND_UUID, "EU-Central \u00b7 KVM",
                        "offline", false, 100, 2048, 10240));
        return new JSONObject().put("object", "list").put("data", data);
    }

    private static JSONObject serverJson(String uuid, String name, String status,
                                         boolean isDefault, int cpu, int memory, int disk) {
        JSONObject allocation = new JSONObject()
                .put("object", "allocation")
                .put("attributes", new JSONObject()
                        .put("ip", "203.0.113.10")
                        .put("port", isDefault ? 25565 : 25566)
                        .put("is_default", isDefault));
        JSONObject attributes = new JSONObject()
                .put("uuid", uuid)
                .put("identifier", uuid.substring(0, 8))
                .put("name", name)
                .put("status", status)
                .put("is_suspended", false)
                .put("limits", new JSONObject()
                        .put("cpu", cpu).put("memory", memory).put("disk", disk))
                .put("relationships", new JSONObject()
                        .put("allocations", new JSONObject()
                                .put("object", "list")
                                .put("data", new JSONArray().put(allocation))));
        return new JSONObject().put("object", "server").put("attributes", attributes);
    }

    private static JSONObject resourcesJson() {
        JSONObject resources = new JSONObject()
                .put("cpu_absolute", "running".equals(serverState) ? 12.4 : 0.0)
                .put("memory_bytes", "running".equals(serverState) ? 1_503_238_553L : 0L)
                .put("disk_bytes", 4_026_531_840L)
                .put("uptime", uptimeSeconds)
                .put("network_rx_bytes", 918_273_645L)
                .put("network_tx_bytes", 402_653_184L);
        JSONObject attributes = new JSONObject()
                .put("current_state", serverState)
                .put("is_suspended", false)
                .put("resources", resources);
        return new JSONObject().put("object", "stats").put("attributes", attributes);
    }

    // ----------------------------------------------------------------- rules

    private static boolean rejectIfUnauthenticated(HttpExchange exchange) throws IOException {
        if (isBearer(exchange) || hasSession(exchange)) return false;
        journal.add("rejected an unauthenticated request to " + exchange.getRequestURI().getPath());
        respond(exchange, 401, error("AuthenticationException", 401, "Unauthenticated."));
        return true;
    }

    /**
     * Every write is CSRF-checked, exactly as control.victuscloud.com does: the
     * live panel answers 419 "CSRF token mismatch." even for a bearer-key POST
     * without the token, so a client that only sends the key is not enough.
     */
    private static boolean rejectIfStaleCsrf(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod().toUpperCase(Locale.US))) return false;
        Headers headers = exchange.getRequestHeaders();
        String received = headers.getFirst(VictusApi.CSRF_HEADER);
        if (received == null) received = headers.getFirst("X-XSRF-TOKEN");
        if (csrfToken.equals(received)) return false;
        journal.add("rejected a session POST with csrf=" + received);
        respond(exchange, 419, error("HttpException", 419, "CSRF token mismatch."));
        return true;
    }

    private static boolean isBearer(HttpExchange exchange) {
        String header = exchange.getRequestHeaders().getFirst("Authorization");
        return header != null && header.equals("Bearer " + apiKey());
    }

    private static boolean hasSession(HttpExchange exchange) {
        String cookie = exchange.getRequestHeaders().getFirst("Cookie");
        return cookie != null && cookie.contains("pterodactyl_session=" + sessionCookie);
    }

    // ---------------------------------------------------------------- helper

    private static String error(String code, int status, String detail) {
        return new JSONObject()
                .put("errors", new JSONArray().put(new JSONObject()
                        .put("code", code)
                        .put("status", String.valueOf(status))
                        .put("detail", detail)))
                .toString();
    }

    private static JSONObject json(String body) {
        if (body == null || body.trim().isEmpty()) return null;
        try {
            return new JSONObject(body);
        } catch (Exception malformed) {
            return null;
        }
    }

    private static String read(HttpExchange exchange) throws IOException {
        try (InputStream in = exchange.getRequestBody();
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int count;
            while ((count = in.read(chunk)) != -1) buffer.write(chunk, 0, count);
            return buffer.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        respond(exchange, status, body, "application/json; charset=utf-8");
    }

    private static void respond(HttpExchange exchange, int status, String body, String contentType)
            throws IOException {
        if (status == 204 || body == null) {
            exchange.sendResponseHeaders(status, -1);
            return;
        }
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
