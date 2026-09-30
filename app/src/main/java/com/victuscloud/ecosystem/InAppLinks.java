package com.victuscloud.ecosystem;

import java.net.URI;
import java.util.Locale;

/**
 * URL policy for the in-app browser bridge ({@code window.VictusNative}).
 *
 * <p>Everything here is pure Java — no Android imports — so the rules that decide
 * what a web page is allowed to make the app open are covered by JVM unit tests,
 * in the same spirit as {@link UpdateCommands}. The web app can reach this
 * through {@code addJavascriptInterface}, which means <em>any</em> page loaded in
 * the shell WebView can call it: the allowlist below is what keeps that from
 * being a hole. Only {@code https://} URLs on {@code victuscloud.com} (or a
 * subdomain) are accepted, and an {@code http://} link to one of those hosts is
 * upgraded to https rather than refused, so legacy in-app links keep working
 * inside an app whose network security config forbids cleartext.</p>
 */
final class InAppLinks {

    static final String ROOT_DOMAIN = "victuscloud.com";

    /**
     * The only host that carries the apex site's certificate.
     *
     * <p>{@code victuscloud.com}'s certificate lists {@code DNS:victuscloud.com}
     * and nothing else, while {@code www.victuscloud.com} has been left behind
     * with a certificate that expired — a navigation there is a guaranteed
     * certificate failure ("Can't reach Victus Cloud"). Every URL that reaches
     * the shell is therefore folded onto the apex host before it is opened, so
     * the app can never walk into a host the site itself no longer serves.</p>
     */
    static final String CANONICAL_ROOT_DOMAIN = "victuscloud.com";

    /** The retired host folded onto {@link #CANONICAL_ROOT_DOMAIN}. */
    private static final String RETIRED_WWW_PREFIX = "www." + ROOT_DOMAIN;

    private InAppLinks() {
    }

    /**
     * Normalises a URL requested for the in-app browser: https form, Victus Cloud
     * hosts only, or null when it must not be opened there at all (foreign host,
     * credentials embedded, non-http scheme, malformed).
     */
    static String toInAppHttpsUrl(String url) {
        return normalizedHttps(url, true);
    }

    /**
     * Normalises a URL requested for the device browser: https form only, any
     * host. Handing an https link to the OS browser is exactly what a normal link
     * tap already does, so this is a convenience rather than a capability; every
     * other scheme (javascript:, intent:, file:, content:) is refused so the
     * bridge can never smuggle a non-web target into an Intent.
     */
    static String toExternalHttpsUrl(String url) {
        return normalizedHttps(url, false);
    }

    /**
     * Folds {@code www.victuscloud.com} (and its explicit :443 form) onto the
     * apex host, leaving every other host and the rest of the URL byte for byte.
     * Returns the input unchanged when it is not the retired host.
     */
    static String canonicalizeAuthority(String authorityAndPath) {
        if (authorityAndPath == null) return null;
        String rest = authorityAndPath;
        String head = rest;
        String tail = "";
        int slash = rest.indexOf('/');
        if (slash >= 0) {
            head = rest.substring(0, slash);
            tail = rest.substring(slash);
        }
        String lower = head.toLowerCase(Locale.US);
        if (lower.equals(RETIRED_WWW_PREFIX)) {
            return CANONICAL_ROOT_DOMAIN + tail;
        }
        if (lower.equals(RETIRED_WWW_PREFIX + ":443")) {
            return CANONICAL_ROOT_DOMAIN + tail;
        }
        return rest;
    }

    private static String normalizedHttps(String url, boolean victusHostOnly) {
        if (url == null) return null;
        String trimmed = url.trim();
        if (trimmed.isEmpty()) return null;

        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (Exception malformed) {
            return null;
        }

        String scheme = uri.getScheme();
        if (scheme == null) return null;
        scheme = scheme.toLowerCase(Locale.US);
        if (!"https".equals(scheme) && !"http".equals(scheme)) return null;

        // "https://user:pass@host" must never reach the WebView or an Intent: the
        // credentials would be handed to whatever the page says next.
        if (uri.getUserInfo() != null) return null;

        String host = uri.getHost();
        if (host == null) return null;
        if (victusHostOnly && !isVictusHost(host)) return null;

        // Swap only the scheme and keep everything else byte for byte: rebuilding
        // through the URI components would re-encode escapes ("next=%2Ffiles"
        // round-trips as "next=/files") and quietly change the target.
        int separator = trimmed.indexOf("://");
        if (separator < 0) return null;
        return "https://" + canonicalizeAuthority(trimmed.substring(separator + 3));
    }

    /** {@code victuscloud.com} or any of its subdomains. */
    static boolean isVictusHost(String host) {
        if (host == null) return false;
        String clean = host.toLowerCase(Locale.US);
        return ROOT_DOMAIN.equals(clean) || clean.endsWith("." + ROOT_DOMAIN);
    }

    /**
     * Keeps a page-supplied title safe for a native header: control characters
     * stripped, length capped, and a fallback when nothing usable is left.
     */
    static String sanitizeTitle(String title, String fallback) {
        if (title == null) return fallback;
        String cleaned = title.replaceAll("[\\p{Cntrl}]", " ").trim();
        if (cleaned.isEmpty()) return fallback;
        return cleaned.length() > 48 ? cleaned.substring(0, 47) + "…" : cleaned;
    }
}
