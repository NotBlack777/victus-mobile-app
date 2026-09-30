package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

/**
 * The sign-in and admin-access rules, pinned down as pure data.
 *
 * <p>Both of these were reported as "it does not work" with no error shown. The
 * first is a normalisation bug that made a real credential look wrong to the
 * panel; the second locked a genuine admin out of the app's admin entry. Neither
 * is visible without a test, because the symptom is the panel's own deliberately
 * vague rejection message.</p>
 */
public class LoginIdentityTest {

    private static String loginUserField(String raw) throws Exception {
        return new JSONObject(VictusApi.loginBody(raw, "hunter2")).getString("user");
    }

    // ------------------------------------------------------ identifier tidying

    @Test
    public void anEmailIsLowercased() throws Exception {
        // The panel's own frontend only ever sees a value the browser already
        // normalised, so it can afford to compare verbatim. The app cannot.
        assertEquals("ada@victuscloud.com", loginUserField("Ada@VictusCloud.COM"));
    }

    @Test
    public void trailingAndLeadingWhitespaceIsRemoved() throws Exception {
        // The single most likely cause of "no account matching those
        // credentials": a pasted address, or Android autofill, carrying a space.
        assertEquals("ada@victuscloud.com", loginUserField("  ada@victuscloud.com  "));
    }

    @Test
    public void anEmbeddedOrTrailingNewlineIsRemoved() throws Exception {
        assertEquals("ada@victuscloud.com", loginUserField("ada@victuscloud.com\n"));
        assertEquals("ada@victuscloud.com", loginUserField("ada@victuscloud.com\r\n"));
    }

    @Test
    public void aWrappedPastedAddressIsRejoined() throws Exception {
        // Text copied out of a wrapped email collapses to "ada@victus cloud.com"
        // in some editors; the inner whitespace is never legitimate.
        assertEquals("ada@victuscloud.com", loginUserField("ada@victus cloud.com"));
    }

    @Test
    public void aUsernameIsLeftExactlyAsTyped() throws Exception {
        // Usernames are case-sensitive on the panel. Folding one would break a
        // sign-in that otherwise worked, so only addresses are lowercased.
        assertEquals("AdaLovelace", loginUserField("AdaLovelace"));
        assertEquals("adalove", loginUserField("adalove"));
    }

    @Test
    public void aUsernameIsStillTrimmed() throws Exception {
        assertEquals("AdaLovelace", loginUserField("  AdaLovelace  "));
    }

    @Test
    public void anEmptyOrNullIdentifierStaysEmpty() throws Exception {
        assertEquals("", loginUserField(null));
        assertEquals("", loginUserField("   "));
    }

    @Test
    public void thePasswordIsNeverAltered() throws Exception {
        // Trimming a password would silently break any credential that has
        // leading or trailing whitespace, and it must not be case-folded either.
        String body = VictusApi.loginBody("ada@victuscloud.com", "  PaSs Word  ");
        assertEquals("  PaSs Word  ", new JSONObject(body).getString("password"));
    }

    // ------------------------------------------------------- admin role parsing

    @Test
    public void anOwnerIsRecognisedAsAdmin() {
        assertTrue(adminFor("{\"id\":\"1\",\"username\":\"a\",\"email\":\"a@b.c\","
                + "\"root_admin\":true}"));
    }

    @Test
    public void aFullAdminWhoIsNotTheOwnerIsAlsoRecognised() {
        // The regression. This account has full admin rights on the panel, but
        // root_admin is false because it is not the owner. Reading only
        // root_admin hid the app's admin entry from a legitimate administrator.
        assertTrue(adminFor("{\"id\":\"1\",\"username\":\"a\",\"email\":\"a@b.c\","
                + "\"root_admin\":false,\"admin\":true}"));
    }

    @Test
    public void aNonAdminIsNotGivenAdminAreas() {
        assertFalse(adminFor("{\"id\":\"1\",\"username\":\"a\",\"email\":\"a@b.c\","
                + "\"root_admin\":false,\"admin\":false}"));
    }

    @Test
    public void anAccountWithNoRoleFieldsIsNotAnAdmin() {
        // Fail closed: an unrecognised payload must not grant anything.
        assertFalse(adminFor("{\"id\":\"1\",\"username\":\"a\",\"email\":\"a@b.c\"}"));
    }

    @Test
    public void aMalformedAccountIsNotAnAdmin() {
        assertEquals(null, VictusApi.parseAccount(null));
        assertEquals(null, VictusApi.parseAccount(""));
        assertEquals(null, VictusApi.parseAccount("not json"));
    }

    private static boolean adminFor(String body) {
        VictusApi.Account account = VictusApi.parseAccount(body);
        return account != null && account.rootAdmin;
    }
}
