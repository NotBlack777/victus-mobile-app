package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The allowlist behind {@code window.VictusNative.openWebView}. Any page loaded in
 * the shell WebView can call the bridge, so these are the tests that keep it from
 * becoming a way to make the app open something it shouldn't. Pure JVM — no
 * Android classes involved.
 */
public class InAppLinksTest {

    @Test
    public void acceptsVictusHttpsUrlsVerbatim() {
        assertEquals("https://control.victuscloud.com/",
                InAppLinks.toInAppHttpsUrl("https://control.victuscloud.com/"));
        assertEquals("https://victuscloud.com",
                InAppLinks.toInAppHttpsUrl("https://victuscloud.com"));
        assertEquals("https://drive.victuscloud.com/login?next=%2Ffiles",
                InAppLinks.toInAppHttpsUrl("https://drive.victuscloud.com/login?next=%2Ffiles"));
    }

    @Test
    public void upgradesCleartextVictusLinksToHttps() {
        // The bundle still carries http:// portal links, and the app forbids
        // cleartext: upgrade rather than refuse, so those taps still work.
        assertEquals("https://billing.victuscloud.com/",
                InAppLinks.toInAppHttpsUrl("http://billing.victuscloud.com/"));
        assertEquals("https://control.victuscloud.com/",
                InAppLinks.toInAppHttpsUrl("http://control.victuscloud.com/"));
    }

    @Test
    public void trimsSurroundingWhitespace() {
        assertEquals("https://victuscloud.com/status",
                InAppLinks.toInAppHttpsUrl("  https://victuscloud.com/status  "));
    }

    @Test
    public void rejectsForeignHosts() {
        assertNull(InAppLinks.toInAppHttpsUrl("https://evil.example.com/"));
        assertNull(InAppLinks.toInAppHttpsUrl("https://victuscloud.com.evil.example/"));
        assertNull(InAppLinks.toInAppHttpsUrl("https://notvictuscloud.com/"));
        assertNull(InAppLinks.toInAppHttpsUrl("https://victuscloud.com.evil.com/x"));
        // A lookalike domain that merely contains the brand must not pass.
        assertNull(InAppLinks.toInAppHttpsUrl("https://myvictuscloud.com/"));
    }

    @Test
    public void rejectsNonHttpSchemes() {
        assertNull(InAppLinks.toInAppHttpsUrl("javascript:alert(1)"));
        assertNull(InAppLinks.toInAppHttpsUrl("intent://victuscloud.com/#Intent;end"));
        assertNull(InAppLinks.toInAppHttpsUrl("file:///data/local/tmp/x.html"));
        assertNull(InAppLinks.toInAppHttpsUrl("content://com.example/x"));
        assertNull(InAppLinks.toInAppHttpsUrl("//victuscloud.com/"));
        assertNull(InAppLinks.toInAppHttpsUrl("victuscloud.com"));
        assertNull(InAppLinks.toInAppHttpsUrl("mailto:help@victuscloud.com"));
    }

    @Test
    public void rejectsEmbeddedCredentials() {
        assertNull(InAppLinks.toInAppHttpsUrl("https://user:pass@victuscloud.com/"));
        assertNull(InAppLinks.toInAppHttpsUrl("https://user@control.victuscloud.com/"));
    }

    @Test
    public void rejectsMalformedAndEmptyInput() {
        assertNull(InAppLinks.toInAppHttpsUrl(null));
        assertNull(InAppLinks.toInAppHttpsUrl(""));
        assertNull(InAppLinks.toInAppHttpsUrl("   "));
        assertNull(InAppLinks.toInAppHttpsUrl("https://"));
        assertNull(InAppLinks.toInAppHttpsUrl("https://victuscloud.com:notaport/"));
    }

    @Test
    public void keepsPortsAndFragments() {
        assertEquals("https://sg1.victuscloud.com:2022/x#top",
                InAppLinks.toInAppHttpsUrl("https://sg1.victuscloud.com:2022/x#top"));
    }

    @Test
    public void externalBrowserTargetsAllowAnyHttpsHost() {
        assertEquals("https://example.com/x",
                InAppLinks.toExternalHttpsUrl("https://example.com/x"));
        // Cleartext is never handed out, even though a browser would take it.
        assertEquals("https://victuscloud.com/",
                InAppLinks.toExternalHttpsUrl("http://victuscloud.com/"));
        assertNull(InAppLinks.toExternalHttpsUrl("javascript:alert(1)"));
        assertNull(InAppLinks.toExternalHttpsUrl("intent://host/#Intent;end"));
        assertNull(InAppLinks.toExternalHttpsUrl("file:///etc/hosts"));
        assertNull(InAppLinks.toExternalHttpsUrl("content://com.example/x"));
        assertNull(InAppLinks.toExternalHttpsUrl("https://user:pass@example.com/"));
        assertNull(InAppLinks.toExternalHttpsUrl(null));
        assertNull(InAppLinks.toExternalHttpsUrl("   "));
    }

    @Test
    public void recognisesVictusHosts() {
        assertTrue(InAppLinks.isVictusHost("victuscloud.com"));
        assertTrue(InAppLinks.isVictusHost("VICTUSCLOUD.COM"));
        assertTrue(InAppLinks.isVictusHost("sg1.victuscloud.com"));
        assertFalse(InAppLinks.isVictusHost(null));
        assertFalse(InAppLinks.isVictusHost(""));
        assertFalse(InAppLinks.isVictusHost("victuscloud.com.evil.com"));
        assertFalse(InAppLinks.isVictusHost("evilvictuscloud.com"));
    }

    @Test
    public void sanitizesPageSuppliedTitles() {
        assertEquals("Control Panel", InAppLinks.sanitizeTitle("Control Panel", "Victus Cloud"));
        assertEquals("Victus Cloud", InAppLinks.sanitizeTitle(null, "Victus Cloud"));
        assertEquals("Victus Cloud", InAppLinks.sanitizeTitle("   ", "Victus Cloud"));
        // Control characters (including newlines) never reach a native header.
        assertEquals("a b", InAppLinks.sanitizeTitle("a\nb", "Victus Cloud"));
        assertEquals("a b", InAppLinks.sanitizeTitle("a\u0000b", "Victus Cloud"));
        String longTitle = InAppLinks.sanitizeTitle("x".repeat(200), "Victus Cloud");
        assertEquals(48, longTitle.length());
        assertTrue(longTitle.endsWith("…"));
    }
}
