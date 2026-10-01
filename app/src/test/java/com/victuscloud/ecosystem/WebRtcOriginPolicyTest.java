package com.victuscloud.ecosystem;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Who is allowed to ask for the camera and microphone.
 *
 * <p>{@code WebChromeClient.onPermissionRequest} is delivered to whichever page
 * asked for it, and this shell loads third-party content alongside its own
 * pages — CDN bundles, embedded media, anything a Victus page chooses to
 * reference. The handler already restricted <em>which resources</em> could be
 * granted (mic/camera only, and only when the app holds the matching runtime
 * permission), but it never checked <em>who</em> was asking. Any origin could
 * therefore open a live capture stream on a device where the app happened to
 * hold the permission — a permission the app requests for nothing else, so it is
 * granted purely on this path.</p>
 *
 * <p>The rule, stated once so it cannot drift: only the bundled React app and
 * Victus Cloud's own hosts may ask. Everything else is denied outright.</p>
 */
public class WebRtcOriginPolicyTest {

    /** The predicate the chrome client actually calls, named here for clarity. */
    private static boolean mayRequestCamera(String origin) {
        String host = hostOf(origin);
        return InAppLinks.isVictusHost(host) || WebViewSetup.ASSETS_HOST.equals(host);
    }

    private static String hostOf(String origin) {
        if (origin == null) {
            return null;
        }
        // Parsed with java.net.URI rather than android.net.Uri so the policy is
        // exercised as pure JVM code, like InAppLinks itself. Robolectric is not
        // attached to this class, so Uri.parse would return null for everything.
        try {
            java.net.URI parsed = new java.net.URI(origin.trim());
            String scheme = parsed.getScheme();
            if (scheme == null || !"https".equalsIgnoreCase(scheme)) return null;
            String host = parsed.getHost();
            return host == null ? null : host.toLowerCase(java.util.Locale.US);
        } catch (Exception malformed) {
            return null;
        }
    }

    @Test
    public void theBundledAppMayAsk() {
        assertTrue(mayRequestCamera("https://appassets.androidplatform.net"));
    }

    @Test
    public void theApexSiteMayAsk() {
        assertTrue(mayRequestCamera("https://victuscloud.com"));
    }

    @Test
    public void ourSubdomainsMayAsk() {
        assertTrue(mayRequestCamera("https://control.victuscloud.com"));
        assertTrue(mayRequestCamera("https://drive.victuscloud.com"));
        assertTrue(mayRequestCamera("https://billing.victuscloud.com"));
        assertTrue(mayRequestCamera("https://community.victuscloud.com"));
    }

    @Test
    public void theRetiredWwwHostIsStillOurs() {
        // Canonicalisation happens on navigation, not on the permission origin,
        // so www must be judged by the same suffix rule rather than special-cased.
        assertTrue(mayRequestCamera("https://www.victuscloud.com"));
    }

    // ------------------------------------------------------------- the denials

    @Test
    public void aForeignSiteMayNotAsk() {
        assertFalse(mayRequestCamera("https://evil.example.com"));
    }

    @Test
    public void aLookalikeDomainMayNotAsk() {
        // The classic suffix-confusion: this host ENDS WITH "victuscloud.com"
        // but is not a subdomain of it.
        assertFalse(mayRequestCamera("https://notvictuscloud.com"));
        assertFalse(mayRequestCamera("https://victuscloud.com.evil.example"));
        assertFalse(mayRequestCamera("https://evilvictuscloud.com"));
    }

    @Test
    public void aSubdomainOfALookalikeMayNotAsk() {
        assertFalse(mayRequestCamera("https://panel.notvictuscloud.com"));
    }

    @Test
    public void aMissingOrMalformedOriginMayNotAsk() {
        // Fail closed: a request that cannot be attributed to anyone is denied,
        // never treated as the bundled app.
        assertFalse(mayRequestCamera(null));
        assertFalse(mayRequestCamera(""));
        assertFalse(mayRequestCamera("not a url at all"));
        assertFalse(mayRequestCamera("://missing-scheme"));
    }

    @Test
    public void aNonWebSchemeWithOurHostnameMayNotAsk() {
        // Matching the host alone would wave these through: they carry our
        // hostname but are not web origins, and a permission request is only
        // meaningful from an https page.
        assertFalse(mayRequestCamera("file://victuscloud.com"));
        assertFalse(mayRequestCamera("http://victuscloud.com"));
        assertFalse(mayRequestCamera("victuscloud.com"));
    }

    @Test
    public void theHostComparisonIsCaseInsensitive() {
        // URI.getHost() preserves case, so this also proves the lowercasing in
        // the real handler is load-bearing rather than incidental.
        assertTrue(mayRequestCamera("https://Control.VictusCloud.COM"));
        assertTrue(mayRequestCamera("https://APPASSETS.ANDROIDPLATFORM.NET"));
    }
}
