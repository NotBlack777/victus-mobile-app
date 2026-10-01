package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.WebViewClient;

import org.junit.Test;

/**
 * A failed page load must say the plain thing.
 *
 * <p>The raw platform codes are what the WebView hands back; each of these has a
 * different real cause, and collapsing them all into "connection error" is what
 * made the offline screen useless. These pin the mapping, including the cases
 * where retrying is pointless and the screen should not offer it.</p>
 */
public class NetworkErrorsTest {

    @Test
    public void mapsEveryFailureToItsRealCause() {
        assertEquals(NetworkErrors.Kind.DNS,
                NetworkErrors.classify(WebViewClient.ERROR_HOST_LOOKUP));
        assertEquals(NetworkErrors.Kind.OFFLINE,
                NetworkErrors.classify(WebViewClient.ERROR_CONNECT));
        assertEquals(NetworkErrors.Kind.OFFLINE,
                NetworkErrors.classify(WebViewClient.ERROR_IO));
        assertEquals(NetworkErrors.Kind.TIMEOUT,
                NetworkErrors.classify(WebViewClient.ERROR_TIMEOUT));
        assertEquals(NetworkErrors.Kind.TLS,
                NetworkErrors.classify(WebViewClient.ERROR_FAILED_SSL_HANDSHAKE));
        assertEquals(NetworkErrors.Kind.SCHEME,
                NetworkErrors.classify(WebViewClient.ERROR_UNSUPPORTED_SCHEME));
        assertEquals(NetworkErrors.Kind.SCHEME,
                NetworkErrors.classify(WebViewClient.ERROR_UNSUPPORTED_AUTH_SCHEME));
        assertEquals(NetworkErrors.Kind.TOO_MANY_REQUESTS,
                NetworkErrors.classify(WebViewClient.ERROR_TOO_MANY_REQUESTS));
    }

    @Test
    public void anUnknownCodeIsNeverGuessedAt() {
        assertEquals(NetworkErrors.Kind.GENERIC, NetworkErrors.classify(0));
        assertEquals(NetworkErrors.Kind.GENERIC, NetworkErrors.classify(999));
        assertEquals(NetworkErrors.Kind.GENERIC, NetworkErrors.classify(-4242));
    }

    @Test
    public void eachCauseGetsItsOwnMessage() {
        int offline = NetworkErrors.messageFor(NetworkErrors.Kind.OFFLINE);
        int dns = NetworkErrors.messageFor(NetworkErrors.Kind.DNS);
        int timeout = NetworkErrors.messageFor(NetworkErrors.Kind.TIMEOUT);
        assertNotEquals(offline, dns);
        assertNotEquals(dns, timeout);
        assertNotEquals(offline, timeout);
        // No two kinds may collapse onto the same sentence.
        assertNotEquals(NetworkErrors.messageFor(NetworkErrors.Kind.TLS), offline);
        assertNotEquals(NetworkErrors.messageFor(NetworkErrors.Kind.REFUSED), dns);
    }

    @Test
    public void retryingIsOfferedOnlyWhenItCanActuallyHelp() {
        assertTrue(NetworkErrors.isWorthRetrying(NetworkErrors.Kind.OFFLINE));
        assertTrue(NetworkErrors.isWorthRetrying(NetworkErrors.Kind.DNS));
        assertTrue(NetworkErrors.isWorthRetrying(NetworkErrors.Kind.TIMEOUT));
        assertTrue(NetworkErrors.isWorthRetrying(NetworkErrors.Kind.GENERIC));
        // These fail identically the second time; offering "try again" is noise.
        assertFalse(NetworkErrors.isWorthRetrying(NetworkErrors.Kind.SCHEME));
        assertFalse(NetworkErrors.isWorthRetrying(NetworkErrors.Kind.TOO_MANY_REQUESTS));
    }
}