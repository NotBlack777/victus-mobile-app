package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Proves the download-truncation guard: a body shorter than the declared
 * {@code Content-Length} must fail the transfer (and never be presented as a
 * complete file), an exact-length body passes, and an unknown length passes.
 */
public class TransferTest {

    @Test
    public void copy_countsEveryByteAndReturnsTheTotal() throws Exception {
        byte[] payload = "victus-cloud-download-payload".getBytes("UTF-8");
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        long written = Transfer.copy(new ByteArrayInputStream(payload), out);

        assertEquals(payload.length, written);
        assertEquals(payload.length, out.size());
    }

    @Test
    public void copyCopiesAnEmptyStreamWithoutError() throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        long written = Transfer.copy(new ByteArrayInputStream(new byte[0]), out);

        assertEquals(0, written);
    }

    @Test
    public void requireComplete_acceptsAnExactLengthBody() throws Exception {
        Transfer.requireComplete(1024, 1024);
    }

    @Test
    public void requireComplete_rejectsABodyShorterThanTheDeclaredLength() {
        try {
            Transfer.requireComplete(5_000, 10_000);
            fail("A truncated download must throw, not pass as complete");
        } catch (IOException expected) {
            assertTrue("Message should name both counts",
                    expected.getMessage().contains("5000")
                            && expected.getMessage().contains("10000"));
        }
    }

    @Test
    public void requireComplete_rejectsABodyLongerThanTheDeclaredLength() {
        try {
            Transfer.requireComplete(12, 10);
            fail("An oversized body also contradicts the declared length");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("Incomplete download"));
        }
    }

    @Test
    public void requireComplete_acceptsAnUndeclaredLength() throws Exception {
        // 0 / negative = chunked or legacy response; nothing to verify.
        Transfer.requireComplete(0, 0);
        Transfer.requireComplete(4096, -1);
    }
}
