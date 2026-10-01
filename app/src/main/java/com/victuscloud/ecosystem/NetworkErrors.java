package com.victuscloud.ecosystem;

/**
 * What a failed page load actually was.
 *
 * <p>{@code WebViewClient.onReceivedError} hands back a raw platform code and a
 * {@code net::ERR_…} description. Showing either verbatim is how a user ends up
 * staring at "net::ERR_NAME_NOT_RESOLVED" and having no idea whether to check
 * their Wi-Fi, wait longer, or give up. Classifying the code first lets the error
 * screen say the plain thing — "no internet connection", "the site took too long"
 * — which is the difference between a message a person can act on and one they
 * can only screenshot.</p>
 *
 * <p>Pure Java, no Android imports, so every code is covered by ordinary JVM
 * unit tests rather than by a device.</p>
 */
final class NetworkErrors {

    /** The handful of outcomes worth telling apart. */
    enum Kind {
        /** The device has no usable connection at all. */
        OFFLINE,
        /** The name did not resolve — usually a dead or typo'd domain. */
        DNS,
        /** The server took too long to answer. */
        TIMEOUT,
        /** The host actively refused the connection. */
        REFUSED,
        /** The TLS handshake failed. */
        TLS,
        /** The URL used a scheme the WebView cannot load. */
        SCHEME,
        /** The site is rate-limiting this device. */
        TOO_MANY_REQUESTS,
        /** Anything else. */
        GENERIC
    }

    private NetworkErrors() {
    }

    /**
     * Maps a {@code WebViewClient.ERROR_*} code onto a {@link Kind}.
     *
     * <p>Unknown codes (and Android's habit of reusing them across releases) fall
     * through to {@link Kind#GENERIC} rather than being guessed at.</p>
     */
    static Kind classify(int code) {
        switch (code) {
            case android.webkit.WebViewClient.ERROR_HOST_LOOKUP:
                return Kind.DNS;
            case android.webkit.WebViewClient.ERROR_CONNECT:
            case android.webkit.WebViewClient.ERROR_IO:
                return Kind.OFFLINE;
            case android.webkit.WebViewClient.ERROR_TIMEOUT:
                return Kind.TIMEOUT;
            case android.webkit.WebViewClient.ERROR_FAILED_SSL_HANDSHAKE:
                return Kind.TLS;
            case android.webkit.WebViewClient.ERROR_UNSUPPORTED_SCHEME:
            case android.webkit.WebViewClient.ERROR_UNSUPPORTED_AUTH_SCHEME:
                return Kind.SCHEME;
            case android.webkit.WebViewClient.ERROR_TOO_MANY_REQUESTS:
                return Kind.TOO_MANY_REQUESTS;
            default:
                return Kind.GENERIC;
        }
    }

    /** The string resource describing a kind. */
    static int messageFor(Kind kind) {
        switch (kind) {
            case OFFLINE:
                return R.string.error_offline;
            case DNS:
                return R.string.error_dns;
            case TIMEOUT:
                return R.string.error_timeout;
            case REFUSED:
                return R.string.error_refused;
            case TLS:
                return R.string.error_tls;
            case TOO_MANY_REQUESTS:
                return R.string.error_too_many_requests;
            case SCHEME:
            case GENERIC:
            default:
                return R.string.error_generic;
        }
    }

    /**
     * Whether retrying is worth offering. A rate-limit and a bad scheme will fail
     * identically on a second try, so the screen says "try again" only when it
     * can genuinely help.
     */
    static boolean isWorthRetrying(Kind kind) {
        return kind != Kind.SCHEME && kind != Kind.TOO_MANY_REQUESTS;
    }
}