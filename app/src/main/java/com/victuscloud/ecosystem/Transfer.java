package com.victuscloud.ecosystem;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Byte-counting stream copy used by {@link DownloadTask}.
 *
 * <p>A network socket that dies mid-body often surfaces as a clean EOF rather
 * than an exception, so a naive copy loop happily writes a truncated file and
 * the caller reports success. Keeping the byte total here and checking it
 * against the response's {@code Content-Length} (when the server declares one)
 * is the only reliable way to catch that.</p>
 *
 * <p>Pure {@code java.io} — no Android classes — so it is covered by JVM unit
 * tests (see {@code TransferTest}).</p>
 */
final class Transfer {

    private Transfer() { }

    /**
     * Copies {@code in} to {@code out} until EOF and returns the number of
     * bytes written. Does not close either stream.
     */
    static long copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
            total += read;
        }
        out.flush();
        return total;
    }

    /**
     * Throws when the copied byte count does not match the transfer size the
     * server declared. {@code expectedBytes <= 0} means "unknown" (chunked or
     * legacy responses) and always passes — nothing can be verified there.
     */
    static void requireComplete(long written, long expectedBytes) throws IOException {
        if (expectedBytes > 0 && written != expectedBytes) {
            throw new IOException("Incomplete download (" + written
                    + " of " + expectedBytes + " bytes)");
        }
    }
}
