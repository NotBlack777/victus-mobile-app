package com.victuscloud.ecosystem;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.net.BindException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Signs in to the Victus Cloud control panel with the app's own network code
 * ({@link VictusHttp} + {@link VictusApi}), lists the account's servers, performs
 * a power action and sends a console command — printing the real HTTP status and
 * response body of every step.
 *
 * <p>It exists so the shipped client contract can be proven against
 * {@code control.victuscloud.com} in a couple of seconds, without a phone and
 * without reimplementing a single request: the URLs, bodies, headers, cookie jar
 * and error parsing are the same classes the APK runs.</p>
 *
 * <pre>
 * # Live panel — paste the key from Account → API Credentials (identifier + ptlc_…)
 * java -cp tools/panel-check/build:&lt;org.json.jar&gt; com.victuscloud.ecosystem.PanelCheck \
 *     --api-key 8fKq2ZP1ptlc_…
 *
 * # Live panel — account password instead
 * java … PanelCheck --user you@example.com --password '…'
 *
 * # Local contract fixture over real sockets (see README for the JVM flags)
 * java -Djdk.net.hosts.file=… -Djavax.net.ssl.trustStore=… … PanelCheck \
 *     --mock --keystore … --keystore-password …
 * </pre>
 *
 * <p>Options may also come from the environment, so a key set in
 * Settings → Environment never has to appear on a command line:
 * {@code VICTUS_API_KEY}, {@code VICTUS_PANEL_USER}, {@code VICTUS_PANEL_PASSWORD},
 * {@code VICTUS_PANEL_TOTP}.</p>
 *
 * <p>No credential is ever printed — API keys are shown masked
 * ({@link VictusApi#maskToken}).</p>
 */
public final class PanelCheck {

    private static final String SERVERS_PREFIX = "/api/client/servers/";

    /**
     * The console is written as UTF-8 explicitly: a server named with an emoji or a
     * non-Latin alphabet must survive the report, and the JVM's default charset is
     * whatever the host locale happens to be (usually US-ASCII in a container).
     */
    private static final PrintStream OUT = new PrintStream(
            new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);

    private static final List<String> passed = new ArrayList<>();
    private static final List<String> failed = new ArrayList<>();

    /** Where the run is pointed, for the report: the live panel, or the fixture. */
    private static String target = VictusApi.BASE_URL;

    private PanelCheck() {
    }

    public static void main(String[] args) {
        int code;
        try {
            code = run(args);
        } finally {
            System.out.flush();
        }
        System.exit(code);
    }

    // ------------------------------------------------------------------ run

    private static int run(String[] args) {
        Map<String, String> opts;
        try {
            opts = parseArgs(args);
        } catch (IllegalArgumentException bad) {
            say("error: " + bad.getMessage());
            usage();
            return 2;
        }
        if (opts.containsKey("help")) {
            usage();
            return 0;
        }

        // The key may arrive under any of the names documented in the README or the
        // user's own choice (VICTUS_USER_API) — first one set wins.
        String apiKey = pick(opts, "api-key", "VICTUS_API_KEY", "VICTUS_USER_API",
                "VICTUS_PANEL_API_KEY");
        String user = pick(opts, "user", "VICTUS_PANEL_USER");
        String password = pick(opts, "password", "VICTUS_PANEL_PASSWORD");
        String totp = pick(opts, "totp", "VICTUS_PANEL_TOTP");
        String signal = opts.getOrDefault("power", "restart").trim().toLowerCase(Locale.US);
        String command = opts.getOrDefault("command", "say hello from the Victus Cloud app");
        String wanted = opts.get("server");
        String inspect = opts.get("inspect");
        boolean mock = opts.containsKey("mock");

        if (mock) {
            try {
                MockPanel.start(MockPanel.PORT, opts.get("keystore"), opts.get("keystore-password"));
            } catch (BindException unbindable) {
                // The client only ever builds https://control.victuscloud.com URLs, and
                // that hostname has no port, so the fixture has to own 443 — which an
                // unprivileged CI runner may not be allowed to bind. Report that as a
                // skip (exit 3) instead of a failure of the client.
                say("SKIP: cannot bind 127.0.0.1:" + MockPanel.PORT + " (" + unbindable.getMessage() + ")");
                say("      the fixture needs port 443; run this as root or as a user");
                say("      allowed to bind privileged ports");
                return 3;
            } catch (Exception refused) {
                say("error: the local contract fixture did not start: " + refused);
                return 2;
            }
            target = VictusApi.BASE_URL + " (local contract fixture on 127.0.0.1:"
                    + MockPanel.PORT + ")";
            say("contract fixture listening on 127.0.0.1:" + MockPanel.PORT + " as " + VictusApi.HOST);
            // The fixture only knows its own synthetic credential. A key found in
            // the environment is meant for the live panel and must not leak into a
            // fixture run (the fixture would rightly 401 it): an explicit
            // --user/--password selects the session path, anything else uses the
            // fixture's key.
            if (user != null || password != null) {
                apiKey = null;
            } else {
                apiKey = MockPanel.apiKey();
            }
        }

        if (apiKey == null && (user == null || password == null)) {
            say("error: nothing to sign in with.");
            say("       Pass --api-key <identifier><ptlc_…>, or --user and --password,");
            say("       or set VICTUS_API_KEY / VICTUS_PANEL_USER / VICTUS_PANEL_PASSWORD.");
            return 2;
        }

        if (!"start".equals(signal) && !"stop".equals(signal)
                && !"restart".equals(signal) && !"kill".equals(signal)) {
            say("error: --power must be start, stop, restart or kill");
            return 2;
        }

        say("target: " + target);
        say("mode:   " + (apiKey != null ? "API key" : "account password")
                + " · power signal \"" + signal + "\"");

        Auth auth = apiKey != null
                ? Auth.withApiKey(apiKey)
                : Auth.withPassword(user, password, totp);
        if (auth == null) {
            summary();
            return 1;
        }

        // 1. The account the credential belongs to.
        section("Account");
        VictusApi.Account account = readAccount(auth);
        if (account == null) {
            summary();
            return 1;
        }
        check("signed in as " + account.displayEmail(), true,
                "username " + account.username
                        + (account.rootAdmin ? " · root admin" : "")
                        + " · 2FA " + (account.twoFactorEnabled ? "on" : "off"));

        // --inspect <uuid> reads one server's live state and stops there — the
        // read-only way to watch a power action land without acting again.
        if (inspect != null) {
            section("Resources (read-only inspect)");
            resources(auth, inspect.trim());
            return summary();
        }

        // 2. The fleet.
        section("Servers");
        JSONArray servers = listServers(auth);
        if (servers == null) {
            summary();
            return 1;
        }
        String uuid = chooseServer(servers, wanted);
        if (uuid == null) {
            summary();
            return 1;
        }

        // 3. Power.
        section("Power action");
        power(auth, uuid, signal);

        // 4. Console.
        section("Console");
        console(auth, uuid, command);

        // 5. Read the state back, so the power action's effect is observed rather
        //    than assumed.
        section("Resources (after the action)");
        resources(auth, uuid);

        if (mock) {
            section("What the fixture server saw");
            for (String line : MockPanel.journal()) say("      " + line);
            MockPanel.stop();
        }

        return summary();
    }

    // ------------------------------------------------------------- the steps

    private static VictusApi.Account readAccount(Auth auth) {
        long started = System.currentTimeMillis();
        VictusHttp.Response response = auth.get(VictusApi.PATH_ACCOUNT);
        step("GET  " + VictusApi.PATH_ACCOUNT, response, started);
        VictusApi.Account account = VictusApi.parseAccount(response.body);
        if (account == null) {
            check("the panel accepted the credential", false,
                    "HTTP " + response.status + " · "
                            + VictusApi.errorDetail(response.status, response.body));
            return null;
        }
        check("the panel accepted the credential", true, auth.describe());
        return account;
    }

    private static JSONArray listServers(Auth auth) {
        long started = System.currentTimeMillis();
        VictusHttp.Response response = auth.get(VictusApi.PATH_CLIENT);
        step("GET  " + VictusApi.PATH_CLIENT, response, started);
        if (!response.isSuccess()) {
            check("GET /api/client returned the fleet", false,
                    "HTTP " + response.status + " · "
                            + VictusApi.errorDetail(response.status, response.body));
            return null;
        }
        JSONArray servers = VictusApi.dataArray(response.body);
        if (servers.length() == 0) {
            check("GET /api/client returned the fleet", false, "the account has no servers");
            return null;
        }
        check("GET /api/client returned the fleet", true, servers.length() + " server(s)");
        for (int i = 0; i < servers.length(); i++) {
            JSONObject attributes = attributesOf(servers.optJSONObject(i));
            if (attributes == null) continue;
            JSONObject limits = attributes.optJSONObject("limits");
            say("      · " + attributes.optString("uuid", "?")
                    + "  \"" + attributes.optString("name", "?") + "\""
                    + "  status=" + attributes.optString("status", "?")
                    + (limits == null ? ""
                    : "  limits " + limits.optInt("cpu", 0) + "% / "
                    + limits.optInt("memory", 0) + " MiB / "
                    + limits.optInt("disk", 0) + " MiB")
                    + allocationSuffix(attributes));
        }
        return servers;
    }

    private static String chooseServer(JSONArray servers, String wanted) {
        JSONObject chosen = null;
        for (int i = 0; i < servers.length(); i++) {
            JSONObject attributes = attributesOf(servers.optJSONObject(i));
            if (attributes == null) continue;
            String uuid = attributes.optString("uuid", "").trim();
            if (wanted != null) {
                if (wanted.equalsIgnoreCase(uuid)) {
                    chosen = attributes;
                    break;
                }
                continue;
            }
            // Prefer the *running* server, so a restart is a meaningful action.
            if (chosen == null) chosen = attributes;
            else if ("running".equals(attributes.optString("status", ""))) chosen = attributes;
        }
        if (chosen == null) {
            check("a target server was found", false,
                    wanted == null ? "the list was empty" : "--server " + wanted + " is not in the list");
            return null;
        }
        String uuid = chosen.optString("uuid", "").trim();
        check("target server selected", true,
                "\"" + chosen.optString("name", "?") + "\" (" + uuid + ")");
        return uuid;
    }

    /** The server's default allocation, as ip:port — public connect info. */
    private static String allocationSuffix(JSONObject attributes) {
        try {
            JSONObject relationships = attributes.optJSONObject("relationships");
            if (relationships == null) return "";
            JSONObject allocations = relationships.optJSONObject("allocations");
            if (allocations == null) return "";
            JSONArray data = allocations.optJSONArray("data");
            if (data == null || data.length() == 0) return "";
            for (int i = 0; i < data.length(); i++) {
                JSONObject entry = data.optJSONObject(i);
                JSONObject allocation = entry == null ? null : entry.optJSONObject("attributes");
                if (allocation == null) continue;
                if (!allocation.optBoolean("is_default", i == 0)) continue;
                return "  @ " + allocation.optString("ip", "?") + ":" + allocation.optInt("port", 0);
            }
        } catch (Exception ignored) {
            // Cosmetic only.
        }
        return "";
    }

    private static void power(Auth auth, String uuid, String signal) {
        String body = new JSONObject().put("signal", signal).toString();
        long started = System.currentTimeMillis();
        VictusHttp.Response response = auth.post(SERVERS_PREFIX + uuid + "/power", body);
        step("POST " + SERVERS_PREFIX + uuid + "/power  " + body, response, started);
        // The panel answers 204 with an empty body; anything 2xx is acceptance.
        check("power signal \"" + signal + "\" accepted", response.isSuccess(),
                response.isSuccess() ? "HTTP " + response.status
                        : "HTTP " + response.status + " · "
                        + VictusApi.errorDetail(response.status, response.body));
    }

    private static void console(Auth auth, String uuid, String command) {
        String body = new JSONObject().put("command", command).toString();
        long started = System.currentTimeMillis();
        VictusHttp.Response response = auth.post(SERVERS_PREFIX + uuid + "/command", body);
        step("POST " + SERVERS_PREFIX + uuid + "/command  " + body, response, started);
        check("console command accepted", response.isSuccess(),
                response.isSuccess() ? "HTTP " + response.status
                        : "HTTP " + response.status + " · "
                        + VictusApi.errorDetail(response.status, response.body));
    }

    private static void resources(Auth auth, String uuid) {
        long started = System.currentTimeMillis();
        VictusHttp.Response response = auth.get(SERVERS_PREFIX + uuid + "/resources");
        step("GET  " + SERVERS_PREFIX + uuid + "/resources", response, started);
        if (!response.isSuccess()) {
            check("the server's state was read back", false,
                    "HTTP " + response.status + " · "
                            + VictusApi.errorDetail(response.status, response.body));
            return;
        }
        JSONObject attributes = null;
        try {
            attributes = new JSONObject(response.body).optJSONObject("attributes");
        } catch (Exception ignored) {
            // Reported as a failure below.
        }
        if (attributes == null) {
            check("the server's state was read back", false, "unreadable resources payload");
            return;
        }
        String state = attributes.optString("current_state", "?");
        JSONObject usage = attributes.optJSONObject("resources");
        if (usage == null) {
            check("the server's state was read back", true, "state " + state);
            return;
        }
        long uptime = usage.optLong("uptime", 0L);
        check("the server's state was read back", true,
                "state " + state
                        + " · cpu " + usage.optDouble("cpu_absolute", 0) + "%"
                        + " · mem " + gib(usage.optLong("memory_bytes", 0L))
                        + " · disk " + gib(usage.optLong("disk_bytes", 0L))
                        + " · uptime " + duration(uptime));
    }

    // ---------------------------------------------------------------- output

    private static void section(String title) {
        say("");
        say("── " + title);
    }

    private static void step(String label, VictusHttp.Response response, long startedAt) {
        long ms = Math.max(0L, System.currentTimeMillis() - startedAt);
        String status = response.isNetworkFailure() ? "network failure" : "HTTP " + response.status;
        say(String.format(Locale.US, "      %-96s %-15s %d ms", label, status, ms));
        if (response.isNetworkFailure()) {
            say("      reason: " + response.failure);
            return;
        }
        String body = response.body == null ? "" : response.body.trim();
        if (body.isEmpty()) return;
        if (body.length() > 500) body = body.substring(0, 500) + " …";
        say("      ← " + body.replaceAll("\\s+", " "));
    }

    private static void check(String name, boolean ok, String detail) {
        (ok ? passed : failed).add(name);
        say((ok ? "PASS  " : "FAIL  ") + name + (detail == null || detail.isEmpty()
                ? "" : "   [" + detail + "]"));
    }

    private static int summary() {
        say("");
        if (failed.isEmpty()) {
            say("RESULT: PASS — " + passed.size() + " checks passed against " + target
                    + " through the app's own network code");
            return 0;
        }
        say("RESULT: FAIL — " + failed.size() + " of " + (passed.size() + failed.size())
                + " checks failed: " + String.join("; ", failed));
        return 1;
    }

    private static void say(String line) {
        OUT.println(line);
        OUT.flush();
    }

    private static void usage() {
        say("");
        say("Usage: PanelCheck [options]");
        say("");
        say("  --api-key <key>        panel API key: 8-char identifier + ptlc_… secret");
        say("  --user <email|user>    panel account (or VICTUS_PANEL_USER)");
        say("  --password <password>  panel password (or VICTUS_PANEL_PASSWORD)");
        say("  --totp <code>          two-factor code, when the account has it enabled");
        say("  --server <uuid>        act on this server instead of the first running one");
        say("  --power <signal>       start | stop | restart | kill   (default restart)");
        say("  --command <text>       console command to send");
        say("  --inspect <uuid>       read-only: report one server's live state and exit");
        say("  --mock                 start the local contract fixture and run against it");
        say("  --keystore <pkcs12>    TLS material for --mock");
        say("  --keystore-password <p>");
        say("  --help");
        say("");
        say("Exit codes: 0 every step succeeded · 1 a step failed · 2 bad usage or no");
        say("credential · 3 the fixture could not bind port 443 in this environment.");
    }

    // ---------------------------------------------------------------- args

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> options = new LinkedHashMap<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (!arg.startsWith("--")) {
                throw new IllegalArgumentException("unexpected argument \"" + arg + "\"");
            }
            String name = arg.substring(2);
            int equals = name.indexOf('=');
            if (equals >= 0) {
                options.put(name.substring(0, equals), name.substring(equals + 1));
                continue;
            }
            if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                options.put(name, args[++i]);
            } else {
                options.put(name, "");
            }
        }
        return options;
    }

    private static String pick(Map<String, String> options, String name, String... environmentKeys) {
        String value = options.get(name);
        if (value != null && !value.trim().isEmpty()) return value.trim();
        for (String key : environmentKeys) {
            String fromEnv = System.getenv(key);
            if (fromEnv != null && !fromEnv.trim().isEmpty()) return fromEnv.trim();
        }
        return null;
    }

    private static JSONObject attributesOf(JSONObject entry) {
        if (entry == null) return null;
        JSONObject attributes = entry.optJSONObject("attributes");
        return attributes != null ? attributes : entry;
    }

    private static String gib(long bytes) {
        if (bytes <= 0L) return "0 B";
        double gib = bytes / (1024.0 * 1024.0 * 1024.0);
        if (gib >= 1.0) return String.format(Locale.US, "%.2f GiB", gib);
        return String.format(Locale.US, "%.0f MiB", bytes / (1024.0 * 1024.0));
    }

    private static String duration(long seconds) {
        if (seconds <= 0L) return "0s";
        long minutes = seconds / 60L;
        long hours = minutes / 60L;
        long days = hours / 24L;
        if (days > 0L) return days + "d " + (hours % 24L) + "h";
        if (hours > 0L) return hours + "h " + (minutes % 60L) + "m";
        if (minutes > 0L) return minutes + "m " + (seconds % 60L) + "s";
        return seconds + "s";
    }

    // --------------------------------------------------------------- session

    /**
     * The credential the check runs with: a bearer header for an API key, or the
     * cookie jar a password sign-in filled. Both go through {@link VictusHttp}, so
     * neither is invented here.
     */
    private static final class Auth {

        private final VictusHttp http;
        private final String bearer;
        private final String label;

        private Auth(VictusHttp http, String bearer, String label) {
            this.http = http;
            this.bearer = bearer;
            this.label = label;
        }

        static Auth withApiKey(String apiKey) {
            section("Sign in with an API key");
            if (!VictusApi.looksLikeApiKey(apiKey)) {
                check("the value looks like a panel API key", false,
                        "expected the whole key: identifier + ptlc_…");
                return null;
            }
            String cleaned = apiKey.replaceAll("\\s+", "");
            int marker = cleaned.indexOf(VictusApi.API_KEY_PREFIX);
            String identifier = cleaned.substring(0, marker);
            String secret = cleaned.substring(marker);
            String bearer = VictusApi.apiKeyHeader(identifier, secret);
            if (bearer == null) {
                check("the value looks like a panel API key", false, "no secret part");
                return null;
            }
            check("the value looks like a panel API key", true,
                    identifier + VictusApi.maskToken(secret));
            return new Auth(new VictusHttp(), bearer, "API key " + identifier
                    + VictusApi.maskToken(secret));
        }

        static Auth withPassword(String user, String password, String totp) {
            section("Sign in with the account password");
            VictusHttp http = new VictusHttp();

            long started = System.currentTimeMillis();
            VictusHttp.Response page = http.get(VictusApi.PATH_LOGIN);
            step("GET  " + VictusApi.PATH_LOGIN, page, started);
            if (page.isNetworkFailure()) {
                check("the login page answered", false, page.failure);
                return null;
            }
            String token = VictusApi.csrfTokenFromHtml(page.body);
            check("the login page carries a CSRF token", token != null,
                    token == null ? "no <meta name=\"csrf-token\">" : "found");

            String body = VictusApi.loginBody(user, password);
            started = System.currentTimeMillis();
            VictusHttp.Response login = http.post(VictusApi.PATH_LOGIN, body, token);
            step("POST " + VictusApi.PATH_LOGIN + "  {\"user\":\"" + user + "\",\"password\":\"…\"}",
                    login, started);
            if (VictusApi.isCsrfFailure(login.status, login.body)) {
                // A 419 only means the token was stale: fetch a fresh one and retry once.
                started = System.currentTimeMillis();
                VictusHttp.Response refreshed = http.get(VictusApi.PATH_LOGIN);
                login = http.post(VictusApi.PATH_LOGIN, body,
                        VictusApi.csrfTokenFromHtml(refreshed.body));
                step("POST " + VictusApi.PATH_LOGIN + "  (after a CSRF refresh)", login, started);
            }

            VictusApi.LoginResult result = VictusApi.parseLogin(login.status, login.body);
            if (result.state == VictusApi.LoginResult.State.TWO_FACTOR_REQUIRED) {
                if (totp == null) {
                    check("password accepted", true, "the account requires a two-factor code");
                    check("two-factor completed", false, "re-run with --totp <6-digit code>");
                    return null;
                }
                started = System.currentTimeMillis();
                VictusHttp.Response checkpoint = http.post(VictusApi.PATH_LOGIN_CHECKPOINT,
                        VictusApi.checkpointBody(result.confirmationToken, totp), null);
                step("POST " + VictusApi.PATH_LOGIN_CHECKPOINT, checkpoint, started);
                if (VictusApi.parseLogin(checkpoint.status, checkpoint.body).state
                        != VictusApi.LoginResult.State.SESSION_READY) {
                    check("two-factor completed", false,
                            VictusApi.errorDetail(checkpoint.status, checkpoint.body));
                    return null;
                }
                check("two-factor completed", true, "session established");
            } else if (result.state == VictusApi.LoginResult.State.FAILED) {
                check("password accepted", false,
                        "HTTP " + login.status + " · " + result.detail);
                return null;
            } else {
                check("password accepted", true, "session established");
            }
            return new Auth(http, null, "session cookie for " + user);
        }

        String describe() {
            return label;
        }

        VictusHttp.Response get(String path) {
            return bearer == null
                    ? http.get(path)
                    : VictusHttp.bearerRequest("GET", path, null, bearer);
        }

        VictusHttp.Response post(String path, String body) {
            // Both paths must carry the panel's CSRF token on writes: the session
            // path uses the XSRF-TOKEN cookie the login set; the key path collects
            // its own anonymous pair first (bearerWrite).
            return bearer == null
                    ? http.post(path, body, null)
                    : VictusHttp.bearerWrite("POST", path, body, bearer);
        }
    }
}
