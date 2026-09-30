package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Covers the real Victus Cloud control-panel contract: URL and path policy, the
 * request bodies, and every response shape the sign-in flow branches on.
 *
 * <p>The payloads marked "live" were captured verbatim from
 * {@code control.victuscloud.com} while building this client, so the tests pin
 * the panel's actual behaviour rather than an assumption about it. The success and
 * error-envelope shapes come from the panel's own published client bundle.</p>
 */
public class VictusApiTest {

    /** Live: {@code POST /auth/login} with a wrong password. */
    private static final String LIVE_BAD_CREDENTIALS =
            "{\"errors\":[{\"code\":\"DisplayException\",\"status\":\"400\","
                    + "\"detail\":\"No account matching those credentials could be found.\"}]}";

    /** Live: {@code GET /api/client} with no or an invalid bearer token. */
    private static final String LIVE_UNAUTHENTICATED =
            "{\"errors\":[{\"code\":\"AuthenticationException\",\"status\":\"401\","
                    + "\"detail\":\"Unauthenticated.\"}]}";

    /** Live: {@code POST /auth/login/checkpoint} without a real CSRF token. */
    private static final String LIVE_CSRF_MISMATCH = "{\n    \"errors\": [\n        {\n"
            + "            \"code\": \"HttpException\",\n"
            + "            \"status\": \"419\",\n"
            + "            \"detail\": \"CSRF token mismatch.\"\n        }\n    ]\n}";

    /** Live: {@code POST /auth/password} with an invalid address — reset is enabled
     *  even though self-service registration is not. */
    private static final String LIVE_PASSWORD_RESET_INVALID_EMAIL =
            "{\"errors\":[{\"code\":\"ValidationException\",\"status\":\"422\","
            + "\"detail\":\"The email must be a valid email address.\","
            + "\"meta\":{\"source_field\":\"email\",\"rule\":\"email\"}}]}";

    /** Live: the token the panel exposes in the login page's meta tag. */
    private static final String LIVE_LOGIN_META =
            "<meta name=\"csrf-token\" content=\"6mWenZSvqFv9Or6NXYP0uSPcphRjAMIp0Bf9QH1t\">";

    private static final String LOGIN_COMPLETE = "{\"data\":{\"complete\":true,\"intended\":\"/\"}}";
    private static final String LOGIN_NEEDS_TWO_FACTOR =
            "{\"data\":{\"complete\":false,\"confirmation_token\":\"abc123\"}}";

    private static final String ACCOUNT = "{"
            + "\"object\":\"user\",\"attributes\":{"
            + "\"id\":1,\"admin\":false,\"username\":\"ada\",\"email\":\"ada@victuscloud.com\","
            + "\"first_name\":\"Ada\",\"last_name\":\"Lovelace\",\"language\":\"en\","
            + "\"root_admin\":true,\"use_totp\":true,"
            + "\"created_at\":\"2026-01-01T00:00:00+00:00\",\"updated_at\":\"2026-01-01T00:00:00+00:00\"}}";

    /** The key-minting response: the secret appears once, under {@code meta}. */
    private static final String API_KEY_CREATED = "{"
            + "\"object\":\"api_key\",\"attributes\":{\"identifier\":\"abc12345\","
            + "\"description\":\"Victus Cloud Android\",\"allowed_ips\":[],"
            + "\"last_used_at\":null,\"created_at\":\"2026-01-01T00:00:00+00:00\"},"
            + "\"meta\":{\"secret_token\":\"ptlc_secretvalue\"}}";

    // ------------------------------------------------------------ URL policy

    @Test
    public void acceptsTheControlPanelHostOverHttps() {
        assertTrue(VictusApi.isAcceptableUrl("https://control.victuscloud.com"));
        assertTrue(VictusApi.isAcceptableUrl("https://control.victuscloud.com/api/client"));
        assertTrue(VictusApi.isAcceptableUrl("https://control.victuscloud.com:443/api/client"));
        assertTrue(VictusApi.isAcceptableUrl("HTTPS://CONTROL.VICTUSCLOUD.COM/auth/login"));
    }

    @Test
    public void refusesCleartextAndForeignHostsSoCredentialsCannotLeak() {
        assertFalse(VictusApi.isAcceptableUrl("http://control.victuscloud.com"));
        assertFalse(VictusApi.isAcceptableUrl("https://evil.example.com/api/client"));
        // A lookalike suffix must not pass an endsWith check.
        assertFalse(VictusApi.isAcceptableUrl("https://control.victuscloud.com.evil.example.com"));
        assertFalse(VictusApi.isAcceptableUrl("https://evil.example.com#victuscloud.com"));
        assertFalse(VictusApi.isAcceptableUrl(null));
        assertFalse(VictusApi.isAcceptableUrl(""));
    }

    @Test
    public void hostComparisonIgnoresUserInfoThatPrecedesTheRealHost() {
        // The authority here really is control.victuscloud.com (userinfo is "evil"),
        // so it is the panel and is allowed...
        assertTrue(VictusApi.isAcceptableUrl("https://evil@control.victuscloud.com/api/client"));
        // ...while this one really points at evil.example.com and is not.
        assertFalse(VictusApi.isAcceptableUrl("https://control.victuscloud.com@evil.example.com/"));
    }

    @Test
    public void onlyClientApiPathsAreForwardable() {
        assertTrue(VictusApi.isAcceptableApiPath("/api/client"));
        assertTrue(VictusApi.isAcceptableApiPath("/api/client/servers/abc123"));
        assertTrue(VictusApi.isAcceptableApiPath("/api/client/account/api-keys"));
        assertTrue(VictusApi.isAcceptableApiPath("/api/client?page=1"));
    }

    @Test
    public void refusesPathsOutsideTheClientApiAndAnyTraversal() {
        assertFalse(VictusApi.isAcceptableApiPath("/auth/login"));
        assertFalse(VictusApi.isAcceptableApiPath("/api/application/users"));
        // A sibling route that merely shares a prefix.
        assertFalse(VictusApi.isAcceptableApiPath("/api/clientX"));
        assertFalse(VictusApi.isAcceptableApiPath("/api/client/../../auth/login"));
        assertFalse(VictusApi.isAcceptableApiPath("https://evil.example.com/api/client"));
        assertFalse(VictusApi.isAcceptableApiPath("/api/client/servers\r\nHost: evil"));
        assertFalse(VictusApi.isAcceptableApiPath(null));
    }

    // ------------------------------------------------------------- requests

    @Test
    public void loginBodyUsesThePanelsFieldNames() throws Exception {
        JSONObject body = new JSONObject(VictusApi.loginBody("  ada@victuscloud.com ", "hunter2"));
        assertEquals("ada@victuscloud.com", body.getString("user"));
        assertEquals("hunter2", body.getString("password"));
    }

    @Test
    public void checkpointBodySendsAuthenticationCodeNotToken() throws Exception {
        JSONObject body = new JSONObject(VictusApi.checkpointBody("abc123", " 123456 "));
        assertEquals("abc123", body.getString("confirmation_token"));
        assertEquals("123456", body.getString("authentication_code"));
        assertFalse(body.has("token"));
    }

    @Test
    public void apiKeyBodyAsksForTheAppsOwnLabelledKeyWithNoIpRestriction() throws Exception {
        JSONObject body = new JSONObject(VictusApi.apiKeyBody(null));
        assertEquals(VictusApi.APP_KEY_DESCRIPTION, body.getString("description"));
        assertEquals(0, body.getJSONArray("allowed_ips").length());
    }

    @Test
    public void bearerHeaderConcatenatesIdentifierAndSecretAsThePanelExpects() {
        assertEquals("Bearer abc12345ptlc_secretvalue",
                VictusApi.apiKeyHeader("abc12345", "ptlc_secretvalue"));
        assertNull(VictusApi.apiKeyHeader("abc12345", ""));
        assertNull(VictusApi.apiKeyHeader("abc12345", null));
    }

    @Test
    public void csrfTokenIsReadFromTheLiveLoginPageMetaTag() {
        assertEquals("6mWenZSvqFv9Or6NXYP0uSPcphRjAMIp0Bf9QH1t",
                VictusApi.csrfTokenFromHtml(LIVE_LOGIN_META));
    }

    @Test
    public void csrfTokenParsingDoesNotDependOnAttributeOrder() {
        assertEquals("t0ken",
                VictusApi.csrfTokenFromHtml("<meta content=\"t0ken\" name=\"csrf-token\">"));
        assertEquals("t1ken", VictusApi.csrfTokenFromHtml(
                "<html><head><meta name=\"csrf-token\" content=\"t1ken\"><meta charset=\"utf-8\">"));
        assertNull(VictusApi.csrfTokenFromHtml("<html><body>nothing here</body></html>"));
        assertNull(VictusApi.csrfTokenFromHtml(null));
    }

    @Test
    public void passwordResetBodyUsesTheFieldThePanelValidates() throws Exception {
        JSONObject body = new JSONObject(VictusApi.passwordResetBody(" ada@victuscloud.com "));
        assertEquals("ada@victuscloud.com", body.getString("email"));
    }

    // ------------------------------------------------------------ responses

    @Test
    public void aCompletedLoginIsTheOnlyThingThatCountsAsSignedIn() {
        assertEquals(VictusApi.LoginResult.State.SESSION_READY,
                VictusApi.parseLogin(200, LOGIN_COMPLETE).state);
    }

    @Test
    public void anIncompleteLoginAsksForTheSecondFactorInsteadOfFailing() {
        VictusApi.LoginResult result = VictusApi.parseLogin(200, LOGIN_NEEDS_TWO_FACTOR);
        assertEquals(VictusApi.LoginResult.State.TWO_FACTOR_REQUIRED, result.state);
        assertEquals("abc123", result.confirmationToken);
    }

    @Test
    public void aTwoHundredWithoutCompleteIsNeverTreatedAsSignedIn() {
        assertEquals(VictusApi.LoginResult.State.FAILED, VictusApi.parseLogin(200, "{}").state);
        assertEquals(VictusApi.LoginResult.State.FAILED,
                VictusApi.parseLogin(200, "{\"data\":{}}").state);
        assertEquals(VictusApi.LoginResult.State.FAILED,
                VictusApi.parseLogin(200, "<html>login page</html>").state);
        assertEquals(VictusApi.LoginResult.State.FAILED, VictusApi.parseLogin(200, "").state);
    }

    @Test
    public void aRejectedPasswordSurfacesThePanelsOwnSentence() {
        VictusApi.LoginResult result = VictusApi.parseLogin(400, LIVE_BAD_CREDENTIALS);
        assertEquals(VictusApi.LoginResult.State.FAILED, result.state);
        assertEquals("No account matching those credentials could be found.", result.detail);
    }

    @Test
    public void serverErrorsBecomeReadableMessages() {
        assertEquals("Victus Cloud is having trouble (HTTP 503). Try again shortly.",
                VictusApi.errorDetail(503, "<html>bad gateway</html>"));
        assertEquals("Too many attempts. Wait a minute and try again.",
                VictusApi.errorDetail(429, ""));
        assertEquals("Your session has expired. Please sign in again.",
                VictusApi.errorDetail(401, ""));
    }

    @Test
    public void thePanelsDetailWinsOverAGenericStatusMessage() {
        assertEquals("Unauthenticated.", VictusApi.errorDetail(401, LIVE_UNAUTHENTICATED));
        assertEquals("CSRF token mismatch.", VictusApi.errorDetail(419, LIVE_CSRF_MISMATCH));
    }

    @Test
    public void laravelFieldValidationErrorsAreUnderstoodToo() {
        String validation = "{\"errors\":{\"user\":[\"The user field is required.\"]}}";
        assertEquals("The user field is required.", VictusApi.errorDetail(422, validation));
    }

    @Test
    public void passwordResetPrefersThePanelsOwnConfirmationText() {
        assertEquals("We have emailed your password reset link!",
                VictusApi.statusMessage("{\"status\":\"We have emailed your password reset link!\"}"));
        assertNull(VictusApi.statusMessage(LIVE_PASSWORD_RESET_INVALID_EMAIL));
        assertNull(VictusApi.statusMessage(""));
        assertNull(VictusApi.statusMessage(null));
    }

    @Test
    public void anInvalidResetEmailSurfacesThePanelsValidationMessage() {
        assertEquals("The email must be a valid email address.",
                VictusApi.errorDetail(422, LIVE_PASSWORD_RESET_INVALID_EMAIL));
    }

    @Test
    public void csrfAndCredentialFailuresAreDistinguished() {
        assertTrue(VictusApi.isCsrfFailure(419, LIVE_CSRF_MISMATCH));
        assertTrue(VictusApi.isCsrfFailure(419, ""));
        assertFalse(VictusApi.isCsrfFailure(400, LIVE_BAD_CREDENTIALS));

        assertTrue(VictusApi.isCredentialRejection(400, LIVE_BAD_CREDENTIALS));
        assertTrue(VictusApi.isCredentialRejection(401, LIVE_UNAUTHENTICATED));
        assertFalse(VictusApi.isCredentialRejection(500, ""));
    }

    // --------------------------------------------------------------- account

    @Test
    public void accountIsMappedFromTheDocumentedAttributes() {
        VictusApi.Account account = VictusApi.parseAccount(ACCOUNT);
        assertNotNull(account);
        assertEquals("1", account.id);
        assertEquals("ada", account.username);
        assertEquals("ada@victuscloud.com", account.email);
        assertEquals("Ada Lovelace", account.name);
        assertTrue(account.rootAdmin);
        assertTrue(account.twoFactorEnabled);
        assertEquals("ada@victuscloud.com", account.displayEmail());
    }

    @Test
    public void accountFallsBackToUsernameWhenThePanelHidesTheEmail() {
        VictusApi.Account account = VictusApi.parseAccount(
                "{\"object\":\"user\",\"attributes\":{\"id\":7,\"username\":\"ada\"}}");
        assertNotNull(account);
        assertEquals("ada", account.name);
        assertEquals("ada", account.displayEmail());
        assertFalse(account.rootAdmin);
        assertFalse(account.twoFactorEnabled);
    }

    @Test
    public void anAccountPayloadWithNoIdentityIsNotAnAccount() {
        assertNull(VictusApi.parseAccount("{\"object\":\"user\",\"attributes\":{}}"));
        assertNull(VictusApi.parseAccount("{\"errors\":[]}"));
        assertNull(VictusApi.parseAccount(""));
        assertNull(VictusApi.parseAccount("<html>login</html>"));
    }

    // --------------------------------------------------------------- API key

    @Test
    public void theMintedKeyIsReadFromTheOneTimeSecretToken() {
        assertEquals("ptlc_secretvalue", VictusApi.secretTokenFromApiKey(API_KEY_CREATED));
        assertEquals("abc12345", VictusApi.identifierFromApiKey(API_KEY_CREATED));
    }

    @Test
    public void olderKeyResponsesThatPutTheSecretInAttributesStillWork() {
        String older = "{\"object\":\"api_key\",\"attributes\":{\"identifier\":\"zzz\","
                + "\"token\":\"ptlc_old\"}}";
        assertEquals("ptlc_old", VictusApi.secretTokenFromApiKey(older));
        assertEquals("zzz", VictusApi.identifierFromApiKey(older));
    }

    @Test
    public void aKeyResponseWithoutASecretIsRejectedRatherThanStoredEmpty() {
        assertNull(VictusApi.secretTokenFromApiKey("{\"object\":\"api_key\",\"attributes\":{}}"));
        assertNull(VictusApi.secretTokenFromApiKey(""));
        assertNull(VictusApi.secretTokenFromApiKey("not json"));
    }

    @Test
    public void keyListPayloadsAreWalkedForTheRevocationStep() throws Exception {
        String listed = "{\"object\":\"list\",\"data\":["
                + "{\"object\":\"api_key\",\"attributes\":{\"identifier\":\"first\","
                + "\"description\":\"Someone else's key\"}},"
                + "{\"object\":\"api_key\",\"attributes\":{\"identifier\":\"abc12345\","
                + "\"description\":\"Victus Cloud Android\"}}]}";
        JSONArray data = VictusApi.dataArray(listed);
        assertEquals(2, data.length());

        String found = null;
        for (int i = 0; i < data.length(); i++) {
            JSONObject attributes = data.getJSONObject(i).getJSONObject("attributes");
            if (VictusApi.APP_KEY_DESCRIPTION.equals(attributes.optString("description"))) {
                found = attributes.optString("identifier");
            }
        }
        assertEquals("abc12345", found);
    }

    @Test
    public void aMalformedListIsAnEmptyListRatherThanAnException() {
        assertEquals(0, VictusApi.dataArray("{}").length());
        assertEquals(0, VictusApi.dataArray("").length());
        assertEquals(0, VictusApi.dataArray("<!DOCTYPE html>").length());
    }

    // -------------------------------------------------------------- secrets

    @Test
    public void apiKeysAreRecognisedButNeverPrintedWhole() {
        assertTrue(VictusApi.looksLikeApiKey("abc12345ptlc_secretvalue"));
        assertTrue(VictusApi.looksLikeApiKey("ptlc_secretvalue"));
        assertFalse(VictusApi.looksLikeApiKey("hunter2"));
        assertFalse(VictusApi.looksLikeApiKey(""));
        assertFalse(VictusApi.looksLikeApiKey(null));

        assertEquals("…alue", VictusApi.maskToken("abc12345ptlc_secretvalue"));
        assertEquals("…", VictusApi.maskToken("abcd"));
        assertEquals("", VictusApi.maskToken(null));
    }

    @Test
    public void signOutOnlyRevokesTheKeyThisAppMintedItself() {
        // App-minted key: revoke it, or "Sign out" leaves a live credential behind.
        assertTrue(VictusApi.mayRevokeOnSignOut(true, true));
        // A key the user pasted in is theirs: signing out must not delete it.
        assertFalse(VictusApi.mayRevokeOnSignOut(true, false));
        // A session cookie has nothing to revoke.
        assertFalse(VictusApi.mayRevokeOnSignOut(false, false));
        assertFalse(VictusApi.mayRevokeOnSignOut(false, true));
    }

    @Test
    public void twoFactorCodesAreSixDigitsOrLongerRecoveryCodes() {
        assertTrue(VictusApi.looksLikeTotpOrRecoveryCode("123456"));
        assertTrue(VictusApi.looksLikeTotpOrRecoveryCode(" 654321 "));
        assertTrue(VictusApi.looksLikeTotpOrRecoveryCode("a1b2c3d4e5f6a1b2c3d4"));
        assertFalse(VictusApi.looksLikeTotpOrRecoveryCode("12345a"));
        assertFalse(VictusApi.looksLikeTotpOrRecoveryCode(""));
        assertFalse(VictusApi.looksLikeTotpOrRecoveryCode(null));
    }

    @Test
    public void spacedCodesAreNormalisedToTheSixDigits() {
        // What an authenticator app displays, and what Android's OTP autofill
        // inserts. Sent verbatim this arrives as an invalid code.
        assertEquals("123456", VictusApi.normaliseTwoFactorCode(" 123 456 "));
        assertEquals("654321", VictusApi.normaliseTwoFactorCode("654 321"));
        assertEquals("123456", VictusApi.normaliseTwoFactorCode("123\n456"));
        assertEquals("123456", VictusApi.normaliseTwoFactorCode("\t123456  "));
        assertEquals("", VictusApi.normaliseTwoFactorCode("   "));
        assertEquals("", VictusApi.normaliseTwoFactorCode(null));
    }

    @Test
    public void spacedDigitsStillClassifyAsTotp() {
        assertEquals(VictusApi.TwoFactorKind.TOTP,
                VictusApi.classifyTwoFactor(" 123 456 "));
        assertEquals(VictusApi.TwoFactorKind.TOTP,
                VictusApi.classifyTwoFactor("123456"));
    }

    @Test
    public void recoveryCodesClassifySeparatelyFromTotpCodes() {
        assertEquals(VictusApi.TwoFactorKind.RECOVERY,
                VictusApi.classifyTwoFactor("a1b2c3d4e5f6a1b2c3d4"));
        assertEquals(VictusApi.TwoFactorKind.RECOVERY,
                VictusApi.classifyTwoFactor("12345678"));
        assertEquals(VictusApi.TwoFactorKind.UNKNOWN,
                VictusApi.classifyTwoFactor("12345a"));
        assertEquals(VictusApi.TwoFactorKind.UNKNOWN,
                VictusApi.classifyTwoFactor("ab"));
        assertEquals(VictusApi.TwoFactorKind.UNKNOWN,
                VictusApi.classifyTwoFactor(""));
        assertEquals(VictusApi.TwoFactorKind.UNKNOWN,
                VictusApi.classifyTwoFactor(null));
    }

    @Test
    public void recoveryCodesGoToRecoveryTokenNotAuthenticationCode() {
        // The panel validates these two fields separately, so a recovery code sent
        // as authentication_code can only ever come back as "invalid code".
        String body = VictusApi.checkpointBody("confirm-token",
                "a1b2c3d4e5f6a1b2c3d4", VictusApi.TwoFactorKind.RECOVERY);
        assertTrue(body.contains("\"recovery_token\":\"a1b2c3d4e5f6a1b2c3d4\""));
        assertFalse(body.contains("authentication_code"));
        assertTrue(body.contains("\"confirmation_token\":\"confirm-token\""));
    }

    @Test
    public void authenticatorCodesStillGoToAuthenticationCode() {
        String body = VictusApi.checkpointBody("confirm-token", "123 456",
                VictusApi.classifyTwoFactor("123 456"));
        assertTrue(body.contains("\"authentication_code\":\"123456\""));
        assertFalse(body.contains("recovery_token"));
    }

    @Test
    public void theDefaultCheckpointBodyRoutesByShape() {
        String recovery = VictusApi.checkpointBody("t", "a1b2c3d4e5f6a1b2c3d4");
        assertTrue(recovery.contains("recovery_token"));
        String totp = VictusApi.checkpointBody("t", "123456");
        assertTrue(totp.contains("authentication_code\":\"123456\""));
    }
}
