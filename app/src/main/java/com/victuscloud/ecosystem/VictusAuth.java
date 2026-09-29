package com.victuscloud.ecosystem;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

/**
 * Real authentication against {@code control.victuscloud.com}, replacing the
 * fabricated client-side session the app shipped with.
 *
 * <h2>Sign-in flow</h2>
 * <ol>
 *   <li>{@code GET /auth/login} — the panel's CSRF token and a fresh session cookie.
 *       The token is not optional: without it the panel answers 419 instead of
 *       checking the password.</li>
 *   <li>{@code POST /auth/login} {@code {"user","password"}} — the same JSON call
 *       the panel's own frontend makes. A 419 is retried once with a refreshed
 *       token (that is all the status means).</li>
 *   <li>If the account has two-factor enabled the panel answers
 *       {@code data.complete=false} plus a {@code confirmation_token}, and
 *       {@link #submitTwoFactor} finishes with
 *       {@code POST /auth/login/checkpoint}.</li>
 *   <li>The app then <em>mints its own API key</em>
 *       ({@code POST /api/client/account/api-keys}), so the durable credential is
 *       a revocable key rather than the user's password or a 12-hour cookie. Any
 *       key this app created previously is revoked first, so reinstalling does not
 *       creep towards the panel's per-account key limit.</li>
 *   <li>The key is validated with {@code GET /api/client/account} and sealed into
 *       {@link SecureStore}.</li>
 * </ol>
 *
 * <p>The password is used for exactly one request and never stored. The API key
 * never reaches the WebView either — JavaScript talks to {@link #apiGet} and the
 * key is attached natively, so a compromised page cannot read it.</p>
 *
 * <p>If minting a key fails (a panel that forbids client key creation, or an
 * account at its key limit) the app stays signed in on the encrypted 12-hour
 * session cookie instead, and says so, rather than failing sign-in.</p>
 *
 * <p>All network entry points block; call them from a background thread.</p>
 */
final class VictusAuth {

    private static final String TAG = "VictusAuth";

    /** Cookie-backed sessions last 12 hours, so refresh a little before that. */
    private static final long COOKIE_SESSION_TTL_MS = 11L * 60L * 60L * 1000L;

    private static final String KIND_API_KEY = "api_key";
    private static final String KIND_SESSION = "session";

    private final VictusHttp http = new VictusHttp();
    private final SecureStore store;

    private Session session;

    VictusAuth(Context context) {
        this.store = new SecureStore(context);
    }

    // ------------------------------------------------------------- session

    /** What the app knows about the signed-in account. Never carries the secret. */
    static final class Session {
        final String kind;
        final String identifier;
        final String secret;
        final String userId;
        final String username;
        final String email;
        final String name;
        final boolean rootAdmin;
        final boolean twoFactorEnabled;
        /**
         * True only for a key this app created for itself. A key the user pasted in
         * belongs to them, so signing out must not delete it.
         */
        final boolean appManaged;
        final long createdAt;
        final long expiresAt;

        Session(String kind, String identifier, String secret,
                String userId, String username, String email, String name,
                boolean rootAdmin, boolean twoFactorEnabled, boolean appManaged,
                long createdAt, long expiresAt) {
            this.kind = kind;
            this.identifier = identifier;
            this.secret = secret;
            this.userId = userId;
            this.username = username;
            this.email = email;
            this.name = name;
            this.rootAdmin = rootAdmin;
            this.twoFactorEnabled = twoFactorEnabled;
            this.appManaged = appManaged;
            this.createdAt = createdAt;
            this.expiresAt = expiresAt;
        }

        boolean isApiKey() {
            return KIND_API_KEY.equals(kind);
        }

        boolean isExpired(long now) {
            return expiresAt > 0 && now >= expiresAt;
        }

        String bearerHeader() {
            if (!isApiKey()) return null;
            return VictusApi.apiKeyHeader(identifier, secret);
        }

        /**
         * The shape handed to JavaScript. Deliberately excludes {@link #secret}:
         * the credential stays inside the app's native layer.
         */
        JSONObject toBridgeJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("kind", kind);
                json.put("userId", userId == null ? "" : userId);
                json.put("username", username == null ? "" : username);
                json.put("email", email == null ? "" : email);
                json.put("name", name == null ? "" : name);
                json.put("rootAdmin", rootAdmin);
                json.put("twoFactorEnabled", twoFactorEnabled);
                json.put("appManaged", appManaged);
                json.put("createdAt", createdAt);
                json.put("expiresAt", expiresAt);
                json.put("keyMasked", isApiKey() ? VictusApi.maskToken(identifier + secret) : "");
            } catch (Exception impossible) {
                // JSONObject.put only fails on null keys, which cannot happen here.
            }
            return json;
        }

        String toStorageJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("v", 1);
                json.put("kind", kind);
                json.put("identifier", identifier == null ? "" : identifier);
                json.put("secret", secret == null ? "" : secret);
                json.put("userId", userId == null ? "" : userId);
                json.put("username", username == null ? "" : username);
                json.put("email", email == null ? "" : email);
                json.put("name", name == null ? "" : name);
                json.put("rootAdmin", rootAdmin);
                json.put("twoFactorEnabled", twoFactorEnabled);
                json.put("appManaged", appManaged);
                json.put("createdAt", createdAt);
                json.put("expiresAt", expiresAt);
            } catch (Exception impossible) {
                // Same as above.
            }
            return json.toString();
        }

        static Session fromStorageJson(String raw) {
            try {
                JSONObject json = new JSONObject(raw);
                String kind = json.optString("kind", "");
                if (!KIND_API_KEY.equals(kind) && !KIND_SESSION.equals(kind)) return null;
                return new Session(
                        kind,
                        json.optString("identifier", ""),
                        json.optString("secret", ""),
                        json.optString("userId", ""),
                        json.optString("username", ""),
                        json.optString("email", ""),
                        json.optString("name", ""),
                        json.optBoolean("rootAdmin", false),
                        json.optBoolean("twoFactorEnabled", false),
                        json.optBoolean("appManaged", false),
                        json.optLong("createdAt", 0L),
                        json.optLong("expiresAt", 0L));
            } catch (Exception malformed) {
                return null;
            }
        }

        static Session of(String kind, String identifier, String secret,
                          VictusApi.Account account, boolean appManaged, long expiresAt) {
            return new Session(kind, identifier, secret,
                    account.id, account.username, account.displayEmail(), account.name,
                    account.rootAdmin, account.twoFactorEnabled, appManaged,
                    System.currentTimeMillis(), expiresAt);
        }
    }

    /** Outcome of any auth call, serialised straight to the bridge. */
    static final class Outcome {
        final String state;
        final String message;
        final int status;
        final Session session;
        final String confirmationToken;

        private Outcome(String state, String message, int status, Session session,
                        String confirmationToken) {
            this.state = state;
            this.message = message;
            this.status = status;
            this.session = session;
            this.confirmationToken = confirmationToken;
        }

        static Outcome signedIn(Session session) {
            return new Outcome("signed_in", null, 200, session, null);
        }

        static Outcome twoFactorRequired(String confirmationToken) {
            return new Outcome("two_factor_required", null, 200, null, confirmationToken);
        }

        /** A neutral, panel-authored note (a reset link was sent, for example). */
        static Outcome info(String message) {
            return new Outcome("info", message, 200, null, null);
        }

        static Outcome failed(String message, int status) {
            return new Outcome("error", message, status, null, null);
        }

        static Outcome signedOut() {
            return new Outcome("signed_out", null, 200, null, null);
        }

        String toJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("ok", "signed_in".equals(state));
                json.put("state", state);
                if (message != null) json.put("message", message);
                if (status > 0) json.put("status", status);
                if (confirmationToken != null) json.put("confirmationToken", confirmationToken);
                if (session != null) json.put("session", session.toBridgeJson());
            } catch (Exception impossible) {
                // See Session#toBridgeJson.
            }
            return json.toString();
        }
    }

    boolean isSignedIn() {
        Session current = session;
        return current != null && !current.isExpired(System.currentTimeMillis());
    }

    Session currentSession() {
        return isSignedIn() ? session : null;
    }

    // --------------------------------------------------------------- sign in

    /** The password step. See the class docs for the full sequence. */
    Outcome signIn(String user, String password) {
        if (user == null || user.trim().isEmpty() || password == null || password.isEmpty()) {
            return Outcome.failed("Enter your Victus Cloud email or username and password.", 400);
        }

        VictusHttp.Response response = postWithCsrf(VictusApi.PATH_LOGIN,
                VictusApi.loginBody(user, password));
        if (response == null) return Outcome.failed(CSRF_HANDSHAKE_FAILED, 0);
        if (response.isNetworkFailure()) return Outcome.failed(networkMessage(response), 0);

        VictusApi.LoginResult result = VictusApi.parseLogin(response.status, response.body);
        if (result.state == VictusApi.LoginResult.State.TWO_FACTOR_REQUIRED) {
            return Outcome.twoFactorRequired(result.confirmationToken);
        }
        if (result.state == VictusApi.LoginResult.State.FAILED) {
            return Outcome.failed(result.detail, response.status);
        }
        return finishSignIn();
    }

    /** The second factor: a six-digit authenticator code, or a recovery code. */
    Outcome submitTwoFactor(String confirmationToken, String authenticationCode) {
        if (confirmationToken == null || confirmationToken.trim().isEmpty()) {
            return Outcome.failed("The sign-in attempt expired. Please sign in again.", 400);
        }
        if (!VictusApi.looksLikeTotpOrRecoveryCode(authenticationCode)) {
            return Outcome.failed("Enter the 6-digit code from your authenticator app.", 400);
        }

        VictusHttp.Response response = postWithCsrf(VictusApi.PATH_LOGIN_CHECKPOINT,
                VictusApi.checkpointBody(confirmationToken, authenticationCode));
        if (response == null) return Outcome.failed(CSRF_HANDSHAKE_FAILED, 0);
        if (response.isNetworkFailure()) return Outcome.failed(networkMessage(response), 0);

        VictusApi.LoginResult result = VictusApi.parseLogin(response.status, response.body);
        if (result.state == VictusApi.LoginResult.State.SESSION_READY) return finishSignIn();
        if (result.state == VictusApi.LoginResult.State.FAILED) {
            return Outcome.failed(result.detail, response.status);
        }
        return Outcome.failed("That code wasn't accepted. Try the next one from your app.", 401);
    }

    /**
     * Sends a password-reset email. The panel has no self-service registration
     * (its {@code POST /auth/register} answers 405), but reset is enabled, and
     * this is the panel's own response text — not a message invented here.
     */
    Outcome requestPasswordReset(String email) {
        if (email == null || !email.trim().contains("@") || email.trim().contains(" ")) {
            return Outcome.failed("Enter the email address on your Victus Cloud account.", 400);
        }

        VictusHttp.Response response = postWithCsrf(VictusApi.PATH_PASSWORD_RESET,
                VictusApi.passwordResetBody(email.trim()));
        if (response == null) return Outcome.failed(CSRF_HANDSHAKE_FAILED, 0);
        if (response.isNetworkFailure()) return Outcome.failed(networkMessage(response), 0);

        String confirmation = VictusApi.statusMessage(response.body);
        if (confirmation != null && response.isSuccess()) return Outcome.info(confirmation);
        return Outcome.failed(VictusApi.errorDetail(response.status, response.body), response.status);
    }

    /**
     * Sign in with an API key created in the panel (Account → API Credentials).
     * The value to paste is the whole key: the 8-character identifier immediately
     * followed by the {@code ptlc_…} secret, which is exactly how the panel shows
     * it and exactly what its bearer header expects.
     */
    Outcome signInWithApiKey(String apiKey) {
        if (!VictusApi.looksLikeApiKey(apiKey)) {
            return Outcome.failed("Paste the whole key from Account → API Credentials "
                    + "(it ends in a long ptlc_… value).", 400);
        }
        String cleaned = apiKey.replaceAll("\\s+", "");
        if (cleaned.length() < 12) {
            return Outcome.failed("That API key looks incomplete. Copy it again from the panel.", 400);
        }

        String identifier = cleaned.substring(0, cleaned.indexOf(VictusApi.API_KEY_PREFIX));
        String secret = cleaned.substring(identifier.length());

        VictusHttp.Response accountResponse = getWithBearer(VictusApi.PATH_ACCOUNT, identifier, secret);
        if (accountResponse.isNetworkFailure()) {
            return Outcome.failed(networkMessage(accountResponse), 0);
        }
        VictusApi.Account account = VictusApi.parseAccount(accountResponse.body);
        if (account == null) {
            int status = accountResponse.status == 0 ? 401 : accountResponse.status;
            return Outcome.failed(VictusApi.errorDetail(status, accountResponse.body), status);
        }

        // Not app-managed: the user owns this key, so sign-out must not delete it.
        return adopt(Session.of(KIND_API_KEY, identifier, secret, account, false, 0L));
    }

    /**
     * Completes a successful password (and optional two-factor) sign-in.
     *
     * <p>No CSRF token is passed on from here: the successful login set a fresh
     * {@code XSRF-TOKEN} cookie, and {@link VictusHttp} derives the header from
     * that cookie — the meta token read before signing in is stale by now because
     * Laravel regenerates it when a login succeeds.</p>
     *
     * <p>Prefers minting a revocable API key; if the panel will not hand one over,
     * the encrypted session cookie is kept instead so the user is not stuck at the
     * sign-in screen after typing a correct password.</p>
     */
    private Outcome finishSignIn() {
        VictusHttp.Response accountResponse = http.get(VictusApi.PATH_ACCOUNT);
        VictusApi.Account account = VictusApi.parseAccount(accountResponse.body);
        if (account == null) {
            http.clearCookies();
            // A 401/403 here means the panel accepted the password but will not let
            // this client read the account over that session — which is the one case
            // the user can act on, so say what to do instead of echoing
            // "Unauthenticated."
            if (accountResponse.status == 401 || accountResponse.status == 403) {
                return Outcome.failed("The panel accepted your password but would not let this app "
                        + "read your account. Create and paste an API key instead "
                        + "(Account \u2192 API Credentials).", accountResponse.status);
            }
            return Outcome.failed(VictusApi.errorDetail(accountResponse.status, accountResponse.body),
                    accountResponse.status);
        }

        String[] minted = mintApiKey();
        if (minted != null) {
            return adopt(Session.of(KIND_API_KEY, minted[0], minted[1], account, true, 0L));
        }

        // Session-cookie fallback: still a real, server-issued session, and the
        // cookie jar is what keeps it alive until the panel expires it.
        Log.i(TAG, "Signed in with the panel session; no API key was issued");
        return adopt(Session.of(KIND_SESSION, "", "", account, false,
                System.currentTimeMillis() + COOKIE_SESSION_TTL_MS));
    }

    /**
     * Creates a dedicated API key, revoking any key this app created before it so
     * repeat installs cannot exhaust the account's key allowance.
     *
     * @return {@code {identifier, secret}}, or null when the panel refuses.
     */
    private String[] mintApiKey() {
        String existing = findExistingAppKey();
        if (existing != null) {
            VictusHttp.Response deleted = http.send("DELETE",
                    VictusApi.PATH_API_KEYS + "/" + existing, null, null);
            if (deleted.isNetworkFailure() || deleted.status >= 400) {
                // Keeping a stale key would be worse than a failed create: it stays valid.
                Log.w(TAG, "Could not revoke the previous Android key (HTTP " + deleted.status + ")");
            }
        }

        VictusHttp.Response created = http.send("POST", VictusApi.PATH_API_KEYS,
                VictusApi.apiKeyBody(VictusApi.APP_KEY_DESCRIPTION), null);
        if (created.isNetworkFailure() || created.status >= 400) {
            Log.w(TAG, "Panel did not issue an API key (HTTP " + created.status + "): "
                    + VictusApi.errorDetail(created.status, created.body));
            return null;
        }

        String identifier = VictusApi.identifierFromApiKey(created.body);
        String secret = VictusApi.secretTokenFromApiKey(created.body);
        if (identifier == null || secret == null || secret.trim().isEmpty()) {
            Log.w(TAG, "API key response carried no secret token");
            return null;
        }

        // Prove the key works before discarding the session it was minted from.
        VictusHttp.Response check = getWithBearer(VictusApi.PATH_ACCOUNT, identifier, secret);
        if (!check.isSuccess()) {
            Log.w(TAG, "Newly minted API key did not authenticate (HTTP " + check.status + ")");
            return null;
        }
        return new String[]{identifier, secret};
    }

    /** Identifier of the key this app created previously, if the panel still lists it. */
    private String findExistingAppKey() {
        VictusHttp.Response listed = http.get(VictusApi.PATH_API_KEYS);
        if (!listed.isSuccess()) return null;
        for (int i = 0; i < VictusApi.dataArray(listed.body).length(); i++) {
            JSONObject entry = VictusApi.dataArray(listed.body).optJSONObject(i);
            if (entry == null) continue;
            JSONObject attributes = entry.optJSONObject("attributes");
            if (attributes == null) continue;
            if (VictusApi.APP_KEY_DESCRIPTION.equals(attributes.optString("description", "").trim())) {
                String identifier = attributes.optString("identifier", "").trim();
                if (!identifier.isEmpty()) return identifier;
            }
        }
        return null;
    }

    private Outcome adopt(Session newSession) {
        this.session = newSession;
        if (!store.save(newSession.toStorageJson())) {
            // The session still works for this run; it just will not survive a restart.
            Log.w(TAG, "Could not persist the session");
        }
        return Outcome.signedIn(newSession);
    }

    // -------------------------------------------------------------- restore

    /**
     * Restores a stored session and re-verifies it with the panel, so a key that
     * was revoked or expired in the panel signs the app out instead of failing
     * later with confusing errors.
     */
    Outcome restore() {
        // Already signed in during this process: answer from memory, so calling
        // restore twice can never disturb a live session.
        if (isSignedIn()) return Outcome.signedIn(session);

        String raw = store.load();
        if (raw == null) return Outcome.signedOut();

        Session stored = Session.fromStorageJson(raw);
        if (stored == null || stored.isExpired(System.currentTimeMillis())) {
            signOut(false);
            return Outcome.signedOut();
        }
        if (!stored.isApiKey()) {
            // A cookie-backed session lives in this process's jar; after a restart
            // there is nothing to restore, so ask for a fresh sign-in instead of
            // pretending the session is still good.
            signOut(false);
            return Outcome.signedOut();
        }

        VictusHttp.Response response =
                getWithBearer(VictusApi.PATH_ACCOUNT, stored.identifier, stored.secret);
        if (response.isNetworkFailure()) {
            // Offline: trust the (unexpired) stored session rather than signing out.
            this.session = stored;
            return Outcome.signedIn(stored);
        }

        VictusApi.Account account = VictusApi.parseAccount(response.body);
        if (account == null) {
            signOut(false);
            return Outcome.signedOut();
        }

        Session refreshed = Session.of(KIND_API_KEY, stored.identifier, stored.secret,
                account, stored.appManaged, stored.expiresAt);
        this.session = refreshed;
        store.save(refreshed.toStorageJson());
        return Outcome.signedIn(refreshed);
    }

    /**
     * Signs out. An API key outlives the session, so the app revokes the key it
     * minted itself — otherwise pressing "Sign out" would leave a live credential
     * on the panel. A key the user pasted in is left alone: it is theirs.
     */
    Outcome signOut(boolean revokeKey) {
        Session current = session;
        if (revokeKey && current != null
                && VictusApi.mayRevokeOnSignOut(current.isApiKey(), current.appManaged)) {
            VictusHttp.Response revoked = VictusHttp.bearerRequest("DELETE",
                    VictusApi.PATH_API_KEYS + "/" + current.identifier, null,
                    VictusApi.apiKeyHeader(current.identifier, current.secret));
            if (revoked != null && (revoked.isNetworkFailure() || revoked.status >= 400)) {
                Log.w(TAG, "Could not revoke the API key on sign-out (HTTP " + revoked.status + ")");
            }
        }
        this.session = null;
        http.clearCookies();
        store.clear();
        return Outcome.signedOut();
    }

    // ---------------------------------------------------------- client API

    /**
     * Forwards a {@code /api/client…} GET with the stored credential attached.
     * This is the seam the real data screens use; it stays allowlisted to the
     * client API so a page cannot ask it to call arbitrary panel routes.
     */
    VictusHttp.Response apiGet(String path) {
        if (!VictusApi.isAcceptableApiPath(path)) {
            return new VictusHttp.Response(0, "", null, "Refused a non-client-API path");
        }
        Session current = currentSession();
        if (current == null) {
            return new VictusHttp.Response(401, "{\"errors\":[{\"code\":\"AuthenticationException\","
                    + "\"status\":\"401\",\"detail\":\"Not signed in.\"}]}", null, null);
        }
        VictusHttp.Response response = current.isApiKey()
                ? getWithBearer(path, current.identifier, current.secret)
                : http.get(path);

        // A rejected credential is a real sign-out, not a transient error.
        if (VictusApi.isCredentialRejection(response.status, response.body)) {
            signOut(false);
        }
        return response;
    }

    /**
     * Forwards a {@code /api/client…} POST with the stored credential attached —
     * this is what a power action is ({@code {"signal":"start"}} to
     * {@code /api/client/servers/{uuid}/power}). Accepts no command line, only an
     * allowlisted client-API path and a small JSON body, so a page cannot use it as
     * a general-purpose proxy.
     */
    VictusHttp.Response apiPost(String path, String jsonBody) {
        if (!VictusApi.isAcceptableApiPath(path)) {
            return new VictusHttp.Response(0, "", null, "Refused a non-client-API path");
        }
        if (jsonBody != null && jsonBody.length() > MAX_REQUEST_BODY_CHARS) {
            return new VictusHttp.Response(0, "", null, "Refused an oversized request");
        }
        Session current = currentSession();
        if (current == null) {
            return new VictusHttp.Response(401, "{\"errors\":[{\"code\":\"AuthenticationException\","
                    + "\"status\":\"401\",\"detail\":\"Not signed in.\"}]}", null, null);
        }

        VictusHttp.Response response;
        if (current.isApiKey()) {
            // Writes with a key still need the panel's CSRF token (see
            // bearerWrite), unlike pure reads.
            response = VictusHttp.bearerWrite("POST", path, jsonBody,
                    VictusApi.apiKeyHeader(current.identifier, current.secret));
        } else {
            // Session-cookie auth: the CSRF header comes from the XSRF-TOKEN cookie.
            response = http.post(path, jsonBody, null);
        }

        if (VictusApi.isCredentialRejection(response.status, response.body)) {
            signOut(false);
        }
        return response;
    }

    /** A body larger than this is a bug or an attempt to abuse the bridge. */
    private static final int MAX_REQUEST_BODY_CHARS = 8 * 1024;

    // ------------------------------------------------------------- plumbing

    private static final String CSRF_HANDSHAKE_FAILED =
            "Couldn't reach the Victus Cloud sign-in page. Check your connection and try again.";

    /**
     * POSTs JSON to the panel, refreshing the CSRF token once if the panel says the
     * one it received was stale (419). Returns null when the CSRF handshake itself
     * could not be completed, which the callers report as "can't reach the panel".
     */
    private VictusHttp.Response postWithCsrf(String path, String jsonBody) {
        String csrfToken = fetchCsrfToken();
        if (csrfToken == null) return null;

        VictusHttp.Response response = http.post(path, jsonBody, csrfToken);
        if (VictusApi.isCsrfFailure(response.status, response.body)) {
            String refreshed = fetchCsrfToken();
            if (refreshed != null) response = http.post(path, jsonBody, refreshed);
        }
        return response;
    }

    private VictusHttp.Response getWithBearer(String path, String identifier, String secret) {
        String bearer = VictusApi.apiKeyHeader(identifier, secret);
        if (bearer == null) {
            return new VictusHttp.Response(401, "", null, "Missing API key");
        }
        return VictusHttp.bearerRequest("GET", path, null, bearer);
    }

    /**
     * The panel's CSRF token. Usually comes from the login page; if that page ever
     * stops exposing it, {@code GET /sanctum/csrf-cookie} sets the cookie the
     * header is derived from, so both routes are tried.
     */
    private String fetchCsrfToken() {
        VictusHttp.Response loginPage = http.get(VictusApi.PATH_LOGIN);
        if (!loginPage.isNetworkFailure()) {
            String token = VictusApi.csrfTokenFromHtml(loginPage.body);
            if (token != null) return token;
        }
        VictusHttp.Response csrfCookie = http.get("/sanctum/csrf-cookie");
        if (csrfCookie.isNetworkFailure()) return null;
        VictusHttp.Response retry = http.get(VictusApi.PATH_LOGIN);
        return retry.isNetworkFailure() ? null : VictusApi.csrfTokenFromHtml(retry.body);
    }

    private static String networkMessage(VictusHttp.Response response) {
        String reason = response.failure == null ? "unknown error" : response.failure;
        return "Couldn't reach control.victuscloud.com (" + reason + "). Check your connection.";
    }
}
