package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Covers the shell/URL helpers every install backend depends on. */
public class UpdateCommandsTest {

    @Test
    public void acceptsOnlyPlainHttpsUrls() {
        assertTrue(UpdateCommands.isAcceptableUrl("https://api.github.com/repos/o/r/releases/latest"));
        assertTrue(UpdateCommands.isAcceptableUrl("  https://example.com/update.json  "));

        assertFalse(UpdateCommands.isAcceptableUrl(null));
        assertFalse(UpdateCommands.isAcceptableUrl(""));
        assertFalse(UpdateCommands.isAcceptableUrl("http://example.com/update.json"));
        assertFalse(UpdateCommands.isAcceptableUrl("file:///etc/passwd"));
        assertFalse(UpdateCommands.isAcceptableUrl("https://user:pass@example.com/x"));
        assertFalse(UpdateCommands.isAcceptableUrl("https://"));
    }

    @Test
    public void stagesThenInstallsThenAlwaysCleansUp() {
        String stage = UpdateCommands.stageScript();
        String install = UpdateCommands.installAndCleanupScript();
        String combined = UpdateCommands.shellScript();

        assertEquals("cat > " + UpdateCommands.TMP_APK, stage);
        assertTrue(install.startsWith("{ " + UpdateCommands.PM + " install -r " + UpdateCommands.TMP_APK));
        assertTrue("modern cmd fallback missing", install.contains(UpdateCommands.CMD + " package install -r"));
        assertTrue("cleanup must run unconditionally", install.endsWith("; rm -f " + UpdateCommands.TMP_APK));

        // The APK is streamed once: staging must gate the install, and the whole
        // operation must be a single shell invocation.
        assertEquals(stage + " && " + install, combined);
        assertTrue(combined.contains("&&"));
    }

    @Test
    public void usesAbsolutePathsBecauseAShizukuServiceHasNoPath() {
        String script = UpdateCommands.shellScript();
        assertTrue(script.contains(UpdateCommands.PM));
        assertTrue(script.startsWith("/system/bin/pm") || script.contains("/system/bin/pm"));
        assertEquals("/system/bin/sh", UpdateCommands.SH);
        assertFalse("must not rely on PATH lookups", script.contains(" pm install"));
    }

    @Test
    public void onlyUserIndependentConstantsReachTheShell() {
        // Nothing in the script comes from a manifest or a user, so there is no
        // injection surface: the same string for every device.
        assertEquals(UpdateCommands.shellScript(), UpdateCommands.shellScript());
        assertFalse(UpdateCommands.shellScript().contains("$"));
    }

    @Test
    public void recognisesPackageManagerOutput() {
        assertTrue(UpdateCommands.isSuccessOutput("Success"));
        assertTrue(UpdateCommands.isSuccessOutput("\nSuccess\n"));
        assertFalse(UpdateCommands.isSuccessOutput("Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]"));
        assertFalse(UpdateCommands.isSuccessOutput(""));
        assertFalse(UpdateCommands.isSuccessOutput(null));

        assertEquals("Failure [INSTALL_FAILED_VERSION_DOWNGRADE]",
                UpdateCommands.summarize("\n  \nFailure [INSTALL_FAILED_VERSION_DOWNGRADE]\nmore"));
        assertEquals("", UpdateCommands.summarize("   \n\n"));
    }

    @Test
    public void sanitisesGeneratedFileNames() {
        assertEquals("victus-2.1.2.apk", UpdateCommands.sanitizeFileName("victus-2.1.2.apk"));
        assertEquals("victus-update.apk", UpdateCommands.sanitizeFileName(null));
        assertEquals("victus-update.apk", UpdateCommands.sanitizeFileName("   "));
        assertFalse(UpdateCommands.sanitizeFileName("../../evil.sh").contains("/"));
        assertFalse(UpdateCommands.sanitizeFileName("a b;rm -rf /.apk").contains(" "));
        assertFalse(UpdateCommands.sanitizeFileName("a`b`.apk").contains("`"));
        assertTrue(UpdateCommands.sanitizeFileName("x".repeat(200)).length() <= 64);
    }

    @Test
    public void formatsSizesForTheUi() {
        assertEquals("unknown size", UpdateCommands.humanSize(0));
        assertEquals("512 B", UpdateCommands.humanSize(512));
        assertEquals("1 KB", UpdateCommands.humanSize(1024));
        assertEquals("3.0 MB", UpdateCommands.humanSize(3155187L));
    }
}
