package com.victuscloud.ecosystem;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.Locale;

/**
 * Request building and response parsing for the real Victus Cloud control panel.
 *
 * <p>{@code control.victuscloud.com} runs a Pterodactyl-family panel with Victus
 * extensions. Its contract was verified against the live server and against the
 * panel's own client bundle, not guessed:</p>
 *
 * <ul>
 *   <li>{@code GET /auth/login} → the login page, whose
 *       {@code <meta name="csrf-token">} carries the token the POST needs.</li>
 *   <li>{@code POST /auth/login} with {@code {"user":…,"password":…}} and the
 *       {@code X-CSRF-TOKEN} header → {@code {"data":{"complete":true,…}}} or
 *       {@code {"data":{"complete":false,"confirmation_token":"…"}}} when the
 *       account has two-factor enabled.</li>
 *   <li>{@code POST /auth/login/checkpoint} with
 *       {@code {"confirmation_token":…,"authentication_code":"123456"}} completes
 *       two-factor.</li>
 *   <li>Every client endpoint lives under {@code /api/client} and takes
 *       {@code Authorization: Bearer <identifier><secret>}. An API key is minted
 *       with {@code POST /api/client/account/api-keys}, whose secret is returned
 *       exactly once in {@code meta.secret_token}.</li>
 *   <li>Failures use the panel's error envelope,
 *       {@code {"errors":[{"code":"DisplayException","status":"400","detail":"…"}]}}.</li>
 * </ul>
 *
 * <p>Deliberately free of Android imports so the URL policy, body building and
 * every response shape stay covered by plain JVM unit tests ({@code app/src/test}),
 * exactly like {@link UpdateManifest} and {@link InAppLinks}.</p>
 */
final class VictusApi {

    /** The only origin this class will ever build a URL for. */
    static final String HOST = "control.victuscloud.com";
    static final String BASE_URL = "https://" + HOST;

    static final String PATH_LOGIN = "/auth/login";
    static final String PATH_LOGIN_CHECKPOINT = "/auth/login/checkpoint";
    /** Password-reset link request. Registration is disabled on this panel (its
     *  {@code POST /auth/register} answers 405), so reset is the only
     *  self-service account route that exists. */
    static final String PATH_PASSWORD_RESET = "/auth/password";
    static final String PATH_ACCOUNT = "/api/client/account";
    static final String PATH_API_KEYS = "/api/client/account/api-keys";
    /** The signed-in account's server list ({@code GET /api/client}). */
    static final String PATH_CLIENT = "/api/client";

    /** Prefix every client-API path must have. The bridge uses this as an allowlist. */
    static final String API_PATH_PREFIX = "/api/client";

    static final String CSRF_HEADER = "X-CSRF-TOKEN";
    static final String API_KEY_PREFIX = "ptlc_";

    /** Label the app uses when it mints its own API key, so it is identifiable
     *  (and revocable) in the panel's Account → API Credentials list. */
    static final String APP_KEY_DESCRIPTION = "Victus Cloud Android";

    /** Two-factor codes are six digits; recovery codes are longer and alphanumeric. */
    private static final int TOTP_LENGTH = 6;

    /** What kind of second factor the user pasted. */
    enum TwoFactorKind {
        /** A six-digit TOTP code from an authenticator app. */
        TOTP,
        /** One of the panel's recovery codes (longer, may contain a dash). */
        RECOVERY,
        /** Neither: whitespace only, or something no authenticator could produce. */
        UNKNOWN,
    }

    private VictusApi() {
    }

    // ------------------------------------------------------------------- URLs

    static String url(String path) {
        return BASE_URL + path;
    }

    /**
     * https on {@code control.victuscloud.com} only. Kept separate from
     * {@link InAppLinks} because this one gates <em>credentials</em>: a token must
     * never be attached to a request the app did not build for this host.
     */
    static boolean isAcceptableUrl(String url) {
        if (url == null) return false;
        String trimmed = url.trim().toLowerCase(Locale.US);
        if (!trimmed.startsWith("https://")) return false;
        String rest = trimmed.substring("https://".length());
        if (rest.isEmpty()) return false;
        // Strip any userinfo before comparing the host.
        int at = rest.indexOf('@');
        if (at >= 0) rest = rest.substring(at + 1);
        // Cut the authority off at the first /, ? or #.
        int cut = rest.length();
        for (int i = 0; i < rest.length(); i++) {
            char c = rest.charAt(i);
            if (c == '/' || c == '?' || c == '#') {
                cut = i;
                break;
            }
        }
        String authority = rest.substring(0, cut);
        if (authority.indexOf(':') >= 0) authority = authority.substring(0, authority.indexOf(':'));
        return authority.equals(HOST) || authority.endsWith("." + HOST);
    }

    /**
     * A relative client-API path the bridge may forward: single slash start, the
     * {@code /api/client} prefix, no traversal, no scheme, no host.
     */
    static boolean isAcceptableApiPath(String path) {
        if (path == null) return false;
        String trimmed = path.trim();
        if (!trimmed.startsWith(API_PATH_PREFIX)) return false;
        // The prefix must be the whole first segment: /api/clientX is a different
        // route family and must not ride along on a startsWith check.
        if (trimmed.length() > API_PATH_PREFIX.length()) {
            char next = trimmed.charAt(API_PATH_PREFIX.length());
            if (next != '/' && next != '?') return false;
        }
        if (trimmed.contains("..")) return false;
        if (trimmed.contains("://")) return false;
        // Only unreserved URI characters, '/', '?' and '&' — no CR/LF injection.
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            boolean ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                    || c == '/' || c == '-' || c == '_' || c == '.' || c == '~'
                    || c == '?' || c == '&' || c == '=' || c == '%';
            if (!ok) return false;
        }
        return true;
    }

    // ---------------------------------------------------------------- bodies

    static String loginBody(String user, String password) {
        JSONObject body = new JSONObject();
        try {
            body.put("user", user == null ? "" : user.trim());
            body.put("password", password == null ? "" : password);
        } catch (Exception impossible) {
            return "{}";
        }
        return body.toString();
    }

    static String checkpointBody(String confirmationToken, String authenticationCode) {
        return checkpointBody(confirmationToken, authenticationCode, classifyTwoFactor(authenticationCode));
    }

    /**
     * Builds the checkpoint POST body.
     *
     * <p>The panel reads <em>two different fields</em> and validates them
     * separately: {@code authentication_code} is checked as a TOTP code, and
     * {@code recovery_token} is checked against the account's recovery-code hash.
     * Sending a recovery code in {@code authentication_code} — which is exactly what
     * an app that treats "any string" as a code does — can therefore only ever come
     * back as "invalid code", no matter how correct the code was. Routing by shape
     * is what makes a valid recovery code work.</p>
     *
     * <p>The TOTP path is unchanged: same field, same value, same one-step check on
     * the panel. Nothing here widens what the panel accepts.</p>
     */
    static String checkpointBody(String confirmationToken, String code, TwoFactorKind kind) {
        JSONObject body = new JSONObject();
        try {
            body.put("confirmation_token", confirmationToken == null ? "" : confirmationToken);
            String value = normaliseTwoFactorCode(code);
            if (kind == TwoFactorKind.RECOVERY) {
                body.put("recovery_token", value);
            } else {
                body.put("authentication_code", value);
            }
        } catch (Exception impossible) {
            return "{}";
        }
        return body.toString();
    }

    static String passwordResetBody(String email) {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email == null ? "" : email.trim());
        } catch (Exception impossible) {
            return "{}";
        }
        return body.toString();
    }

    static String apiKeyBody(String description) {
        JSONObject body = new JSONObject();
        try {
            body.put("description", description == null || description.trim().isEmpty()
                    ? APP_KEY_DESCRIPTION : description.trim());
            body.put("allowed_ips", new JSONArray());
        } catch (Exception impossible) {
            return "{}";
        }
        return body.toString();
    }

    // ------------------------------------------------------------------- CSRF

    /**
     * Pulls the CSRF token out of the login page's meta tag. Attribute order is not
     * guaranteed, so the {@code content} is looked up inside the tag that carries
     * the name rather than with a single fixed pattern.
     */
    static String csrfTokenFromHtml(String html) {
        if (html == null) return null;
        int nameIndex = html.indexOf("csrf-token");
        while (nameIndex >= 0) {
            int tagStart = html.lastIndexOf('<', nameIndex);
            int tagEnd = html.indexOf('>', nameIndex);
            if (tagStart >= 0 && tagEnd > tagStart) {
                String tag = html.substring(tagStart, tagEnd);
                String token = attributeValue(tag, "content");
                if (token != null && !token.trim().isEmpty()) return token.trim();
            }
            nameIndex = html.indexOf("csrf-token", nameIndex + 1);
        }
        return null;
    }

    private static String attributeValue(String tag, String attribute) {
        int at = tag.indexOf(attribute + "=\"");
        if (at < 0) return null;
        int start = at + attribute.length() + 2;
        int end = tag.indexOf('"', start);
        if (end < 0) return null;
        return tag.substring(start, end);
    }

    // --------------------------------------------------------------- headers

    /**
     * The panel's client bundle sends {@code identifier + secret} in the bearer
     * header, so a key minted as {@code identifier=abc12345} with
     * {@code secret_token=ptlc_x} is used as {@code Bearer abc12345ptlc_x}.
     */
    static String apiKeyHeader(String identifier, String secretToken) {
        if (secretToken == null || secretToken.trim().isEmpty()) return null;
        String id = identifier == null ? "" : identifier.trim();
        return "Bearer " + id + secretToken.trim();
    }

    /** Never log or display a whole key: keeps the last four characters only. */
    static String maskToken(String token) {
        if (token == null) return "";
        String trimmed = token.trim();
        if (trimmed.length() <= 4) return "…";
        return "…" + trimmed.substring(trimmed.length() - 4);
    }

    // --------------------------------------------------------------- parsing

    /**
     * Human-readable failure text. Prefers the panel's own {@code detail} (so the
     * user sees "No account matching those credentials could be found." rather
     * than a made-up message), then falls back to a status-specific sentence.
     */
    static String errorDetail(int status, String body) {
        String detail = firstErrorMessage(body);
        if (detail != null && !detail.trim().isEmpty()) return detail.trim();

        if (status == 401) return "Your session has expired. Please sign in again.";
        if (status == 403) return "This account is not allowed to do that.";
        if (status == 404) return "The panel could not find that.";
        if (status == 419) return "The secure token expired. Please try again.";
        if (status == 429) return "Too many attempts. Wait a minute and try again.";
        if (status >= 500) return "Victus Cloud is having trouble (HTTP " + status + "). Try again shortly.";
        if (status >= 400) return "The panel rejected the request (HTTP " + status + ").";
        return "The panel returned an unexpected response.";
    }

    /** {@code errors[]} (API envelope) first, then Laravel's {@code errors{field:[…]}}. */
    private static String firstErrorMessage(String body) {
        if (body == null || body.trim().isEmpty()) return null;
        try {
            JSONObject root = new JSONObject(body);

            JSONArray errors = root.optJSONArray("errors");
            if (errors != null && errors.length() > 0) {
                Object first = errors.opt(0);
                if (first instanceof JSONObject) {
                    JSONObject error = (JSONObject) first;
                    String detail = emptyToNull(error.optString("detail", null));
                    if (detail != null) return detail;
                    String code = emptyToNull(error.optString("code", null));
                    if (code != null) return code;
                } else if (first instanceof String) {
                    return emptyToNull((String) first);
                }
            }

            JSONObject fieldErrors = root.optJSONObject("errors");
            if (fieldErrors != null) {
                Iterator<String> keys = fieldErrors.keys();
                while (keys.hasNext()) {
                    JSONArray messages = fieldErrors.optJSONArray(keys.next());
                    if (messages != null && messages.length() > 0) {
                        String message = emptyToNull(messages.optString(0, null));
                        if (message != null) return message;
                    }
                }
            }

            String message = emptyToNull(root.optString("message", null));
            if (message != null) return message;
        } catch (Exception notJson) {
            // Falls through to null: the caller uses the status-based sentence.
        }
        return null;
    }

    /** Result of a login POST (either the password step or the two-factor step). */
    static final class LoginResult {
        enum State {
            /** Signed in: the session cookie is valid. */
            SESSION_READY,
            /** Password accepted, a two-factor code is required to finish. */
            TWO_FACTOR_REQUIRED,
            /** Rejected. {@link #detail} holds the panel's own message. */
            FAILED
        }

        final State state;
        final String confirmationToken;
        final String detail;

        private LoginResult(State state, String confirmationToken, String detail) {
            this.state = state;
            this.confirmationToken = confirmationToken;
            this.detail = detail;
        }

        static LoginResult sessionReady() {
            return new LoginResult(State.SESSION_READY, null, null);
        }

        static LoginResult twoFactorRequired(String confirmationToken) {
            return new LoginResult(State.TWO_FACTOR_REQUIRED, confirmationToken, null);
        }

        static LoginResult failed(String detail) {
            return new LoginResult(State.FAILED, null, detail);
        }
    }

    /**
     * The panel's own confirmation sentence, which password reset answers with
     * (for example "We have emailed your password reset link!"). Null when the
     * payload carries no {@code status}.
     */
    static String statusMessage(String body) {
        if (body == null || body.trim().isEmpty()) return null;
        try {
            return emptyToNull(new JSONObject(body).optString("status", null));
        } catch (Exception malformed) {
            return null;
        }
    }

    /**
     * Interprets a login/checkpoint response.
     *
     * <p>The panel answers 200 with {@code data.complete=true} when the session is
     * established, and 200 with {@code data.complete=false} plus a
     * {@code confirmation_token} when a two-factor code is still needed. Anything
     * else is a failure carrying the panel's own explanation.</p>
     */
    static LoginResult parseLogin(int status, String body) {
        String detail = errorDetail(status, body);

        // A 419 is recoverable: the caller re-fetches the token and retries once.
        if (status == 419) return LoginResult.failed(detail);

        try {
            JSONObject root = new JSONObject(body == null ? "" : body);
            JSONObject data = root.optJSONObject("data");
            if (data != null) {
                boolean complete = data.optBoolean("complete", false);
                if (complete) return LoginResult.sessionReady();
                String confirmationToken = emptyToNull(data.optString("confirmation_token", null));
                if (confirmationToken != null) return LoginResult.twoFactorRequired(confirmationToken);
            }
        } catch (Exception notJson) {
            // Not JSON: fall through to the status-based failure.
        }

        if (status >= 200 && status < 300) {
            // 2xx that we cannot read as a completed login must not be treated as one.
            return LoginResult.failed(detail);
        }
        return LoginResult.failed(detail);
    }

    /** True when the response means "the panel is asking for a fresh CSRF token". */
    static boolean isCsrfFailure(int status, String body) {
        if (status == 419) return true;
        String detail = firstErrorMessage(body);
        return detail != null && detail.toLowerCase(Locale.US).contains("csrf");
    }

    /**
     * True when the app's stored credential is no longer good, which is the signal
     * to drop the session instead of retrying.
     *
     * <p>A 401 is always that (the panel answers {@code AuthenticationException}
     * "Unauthenticated." for a revoked or expired key), while a 400/422 only counts
     * when the panel's own text says the credentials were wrong — a 400 with a
     * validation message is not a reason to sign the user out.</p>
     */
    static boolean isCredentialRejection(int status, String body) {
        if (status == 401) return true;
        if (status != 400 && status != 422) return false;
        String detail = firstErrorMessage(body);
        return detail != null && detail.toLowerCase(Locale.US).contains("credential");
    }

    /** A signed-in panel account, mapped to what the app's profile UI needs. */
    static final class Account {
        final String id;
        final String username;
        final String email;
        final String name;
        final boolean rootAdmin;
        final boolean twoFactorEnabled;

        Account(String id, String username, String email, String name,
                boolean rootAdmin, boolean twoFactorEnabled) {
            this.id = id;
            this.username = username;
            this.email = email;
            this.name = name;
            this.rootAdmin = rootAdmin;
            this.twoFactorEnabled = twoFactorEnabled;
        }

        /** Email when the panel exposes one, otherwise the username. */
        String displayEmail() {
            return email != null && !email.isEmpty() ? email : (username == null ? "" : username);
        }
    }

    /**
     * Reads {@code GET /api/client/account}. Returns null when the payload carries
     * no usable account, which the caller treats as "the key is not valid".
     */
    static Account parseAccount(String body) {
        if (body == null || body.trim().isEmpty()) return null;
        try {
            JSONObject root = new JSONObject(body);
            JSONObject attributes = root.optJSONObject("attributes");
            if (attributes == null) attributes = root;

            String username = emptyToNull(attributes.optString("username", null));
            String email = emptyToNull(attributes.optString("email", null));
            if (username == null && email == null) return null;

            String firstName = emptyToNull(attributes.optString("first_name", null));
            String lastName = emptyToNull(attributes.optString("last_name", null));
            String explicitName = emptyToNull(attributes.optString("name", null));

            String name;
            if (explicitName != null) {
                name = explicitName;
            } else {
                StringBuilder builder = new StringBuilder();
                if (firstName != null) builder.append(firstName);
                if (lastName != null) {
                    if (builder.length() > 0) builder.append(' ');
                    builder.append(lastName);
                }
                name = builder.length() > 0 ? builder.toString() : null;
            }
            if (name == null) name = username != null ? username : email;

            String id = emptyToNull(attributes.optString("id", null));
            boolean rootAdmin = attributes.optBoolean("root_admin", attributes.optBoolean("admin", false));
            boolean totp = attributes.optBoolean("use_totp", false);

            return new Account(id == null ? "" : id, username, email, name, rootAdmin, totp);
        } catch (Exception malformed) {
            return null;
        }
    }

    /** The one-time secret from {@code meta.secret_token}, falling back to {@code attributes.token}. */
    static String secretTokenFromApiKey(String body) {
        return nestedString(body, "meta", "secret_token") != null
                ? nestedString(body, "meta", "secret_token")
                : nestedString(body, "attributes", "token");
    }

    /** The key's identifier, needed to revoke it again on sign-out. */
    static String identifierFromApiKey(String body) {
        return nestedString(body, "attributes", "identifier");
    }

    private static String nestedString(String body, String object, String key) {
        if (body == null || body.trim().isEmpty()) return null;
        try {
            JSONObject parent = new JSONObject(body).optJSONObject(object);
            if (parent == null) return null;
            return emptyToNull(parent.optString(key, null));
        } catch (Exception malformed) {
            return null;
        }
    }

    // -------------------------------------------------------------- helpers

    /** {@code GET /api/client} returns {@code {"data":[{"attributes":…}]}}. */
    static JSONArray dataArray(String body) {
        try {
            JSONArray array = new JSONObject(body == null ? "" : body).optJSONArray("data");
            return array == null ? new JSONArray() : array;
        } catch (Exception malformed) {
            return new JSONArray();
        }
    }

    /**
     * Whether signing out may delete the credential.
     *
     * <p>Only a key this app minted for itself may be revoked. A key the user pasted
     * in by hand belongs to them — they may use it elsewhere and may have created it
     * in the panel on purpose — so signing out of the app must not delete it.</p>
     */
    static boolean mayRevokeOnSignOut(boolean isApiKey, boolean appManaged) {
        return isApiKey && appManaged;
    }

    static boolean looksLikeApiKey(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        return trimmed.contains(API_KEY_PREFIX) && trimmed.length() > API_KEY_PREFIX.length();
    }

    private static String emptyToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Exposed for the unit tests that pin the six-digit two-factor rule. */
    static boolean looksLikeTotpOrRecoveryCode(String code) {
        return classifyTwoFactor(code) != TwoFactorKind.UNKNOWN;
    }/**
     * Normalises what the user pasted: strips the spaces, dashes, tabs and newlines
     * an authenticator or a copy-paste leaves behind.
     *
     * <p>Without this, "123 456" — which is what most authenticator apps display,
     * and what Android's OTP autofill inserts — arrives at the panel with a space in
     * the middle and is rejected as an invalid code even though it is correct.</p>
     *
     * <p>Letter case is deliberately preserved: the panel compares a recovery code
     * case-sensitively, so uppercasing one here would turn a valid code into an
     * invalid one.</p>
     */
    static String normaliseTwoFactorCode(String code) {
        if (code == null) return "";
        StringBuilder cleaned = new StringBuilder(code.length());
        for (int i = 0; i < code.length(); i++) {
            char c = code.charAt(i);
            if (c == ' ' || c == '-' || c == '\t' || c == '\n' || c == '\r' || c == ' ') {
                continue;
            }
            cleaned.append(c);
        }
        return cleaned.toString().trim();
    }

    /**
     * Decides which panel field a pasted second factor belongs in.
     *
     * <p>Six digits (once spacing is removed) is a TOTP code. Anything else of a
     * plausible length is treated as a recovery code and routed to
     * {@code recovery_token}.</p>
     */
    static TwoFactorKind classifyTwoFactor(String code) {
        String cleaned = normaliseTwoFactorCode(code);
        if (cleaned.isEmpty()) return TwoFactorKind.UNKNOWN;
        if (cleaned.length() == TOTP_LENGTH) {
            boolean allDigits = true;
            for (int i = 0; i < cleaned.length(); i++) {
                if (!Character.isDigit(cleaned.charAt(i))) {
                    allDigits = false;
                    break;
                }
            }
            if (allDigits) return TwoFactorKind.TOTP;
            // Six characters that are not all digits is not a TOTP code, and it is
            // too short to be a recovery code either — fall through so the length
            // rule below decides, rather than guessing.
        }
        if (cleaned.length() <= 64 && allRecoveryCharacters(cleaned)) {
            return TwoFactorKind.RECOVERY;
        }
        return TwoFactorKind.UNKNOWN;
    }

    /** Recovery codes are hex/alphanumeric; anything else was never a code. */
    private static boolean allRecoveryCharacters(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean allowed = (c >= '0' && c <= '9')
                    || (c >= 'A' && c <= 'Z')
                    || (c >= 'a' && c <= 'z');
            if (!allowed) return false;
        }
        return value.length() >= 8;
    }
}
