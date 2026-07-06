package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class AccountControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final AuthCookieFactory cookieFactory = new AuthCookieFactory(false);
    private final AccountRateLimiter rateLimiter = mock(AccountRateLimiter.class);
    private final GoogleAuthProperties googleAuthProperties = googleProperties();
    private final GoogleOAuthService googleOAuthService = mock(GoogleOAuthService.class);
    private final AccountController controller = new AccountController(accountService, cookieFactory, rateLimiter, googleAuthProperties, googleOAuthService, false);

    private GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        result.setClientSecret("client-secret");
        result.setRedirectUri("http://localhost:3000/api/auth/google/callback");
        return result;
    }

    @Test
    void loginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false, false);
        when(accountService.login(new AccountService.LoginRequest("rider@example.com", "correct horse battery staple")))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.login(
            new AccountService.LoginRequest("rider@example.com", "correct horse battery staple"),
            requestFrom("203.0.113.10")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
        verify(rateLimiter).requireAuthAttempt("login", "203.0.113.10");
    }

    @Test
    void logoutExpiresSessionCookieAndDeletesServerSession() {
        ResponseEntity<AccountResponses.AuthResponse> response = controller.logout("raw-token");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=")
            .contains("Max-Age=0");
        verify(accountService).logout("raw-token");
    }

    @Test
    void accountExceptionMapsToErrorResponse() {
        AccountException ex = new AccountException(HttpStatus.CONFLICT, "email_exists", "An account with that email already exists.");

        ResponseEntity<AccountErrorResponse> response = controller.handleAccountException(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isEqualTo(new AccountErrorResponse("email_exists", "An account with that email already exists."));
    }

    @Test
    void passwordResetRequestReturnsNeutralMessage() {
        AccountService.PasswordResetRequest request = new AccountService.PasswordResetRequest("rider@example.com");
        AccountService.PasswordResetRequestResponse serviceResponse = new AccountService.PasswordResetRequestResponse(
            true,
            "If an account exists for that email, a password reset link has been sent.",
            "dev-token",
            Instant.parse("2026-06-05T15:00:00Z")
        );
        when(accountService.requestPasswordReset(request)).thenReturn(serviceResponse);

        ResponseEntity<AccountService.PasswordResetRequestResponse> response = controller.requestPasswordReset(
            request,
            requestFrom("203.0.113.20")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(serviceResponse);
        verify(rateLimiter).requirePasswordResetAttempt("203.0.113.20", "rider@example.com");
    }

    @Test
    void passwordResetConfirmSetsSessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false, false);
        AccountService.PasswordResetConfirmRequest request = new AccountService.PasswordResetConfirmRequest("dev-token", "new correct horse 2");
        when(accountService.confirmPasswordReset(request))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.confirmPasswordReset(
            request,
            requestFrom("203.0.113.30")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
        verify(rateLimiter).requireAuthAttempt("password-reset-confirm", "203.0.113.30");
    }

    @Test
    void authConfigExposesGoogleAvailabilityWhenConfigured() {
        AccountResponses.AuthConfigResponse response = controller.config();

        assertThat(response.googleSignInAvailable()).isTrue();
        assertThat(response.googleClientId()).isEqualTo("client-123.apps.googleusercontent.com");
    }

    @Test
    void devLoginIsUnavailableUnlessExplicitlyEnabled() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.dev(requestFrom("127.0.0.1")))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Dev account sign-in is only available");

        verify(accountService, never()).devLogin();
    }

    @Test
    void devLoginSetsHttpOnlySessionCookieWhenEnabled() {
        AccountController enabledController = new AccountController(accountService, cookieFactory, rateLimiter, googleAuthProperties, googleOAuthService, true);
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_dev", "dev@linewatch.local", "Dev Rider", false, false);
        when(accountService.devLogin())
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = enabledController.dev(requestFrom("127.0.0.1"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
        verify(rateLimiter).requireDemoAttempt("127.0.0.1");
    }

    @Test
    void googleLoginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_google", "rider@example.com", "Transit Rider", false, true);
        AccountService.GoogleLoginRequest request = new AccountService.GoogleLoginRequest("credential");
        when(accountService.googleLogin(request))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.google(
            request,
            requestFrom("203.0.113.40")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
        verify(rateLimiter).requireAuthAttempt("google", "203.0.113.40");
    }

    @Test
    void googleLinkRequiresSessionCookieAndReturnsUpdatedUser() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false, true);
        AccountService.GoogleLoginRequest request = new AccountService.GoogleLoginRequest("credential");
        when(accountService.linkGoogle("raw-session", request))
            .thenReturn(new AccountResponses.AuthResponse(true, user));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.linkGoogle(
            "raw-session",
            request,
            requestFrom("203.0.113.50")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        verify(accountService).linkGoogle("raw-session", request);
        verify(rateLimiter).requireAuthAttempt("google-link", "203.0.113.50");
    }

    @Test
    void googleOAuthStartRedirectsAndSetsStateCookie() {
        when(googleOAuthService.start("login", "/?panel=commutes"))
            .thenReturn(new GoogleOAuthService.GoogleOAuthStart(
                URI.create("https://accounts.google.com/o/oauth2/v2/auth?state=state-123"),
                "state-cookie"
            ));

        ResponseEntity<Void> response = controller.startGoogleOAuth(
            "login",
            "/?panel=commutes",
            requestFrom("203.0.113.60")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FOUND);
        assertThat(response.getHeaders().getFirst(HttpHeaders.LOCATION))
            .isEqualTo("https://accounts.google.com/o/oauth2/v2/auth?state=state-123");
        assertThat(response.getHeaders().getFirst(HttpHeaders.SET_COOKIE))
            .contains("linewatch_google_oauth=state-cookie")
            .contains("HttpOnly")
            .contains("SameSite=Lax");
        verify(rateLimiter).requireAuthAttempt("google-oauth-start", "203.0.113.60");
    }

    @Test
    void googleOAuthCallbackCreatesSessionCookieForLoginModeAndClearsStateCookie() {
        VerifiedGoogleIdentity identity = new VerifiedGoogleIdentity("google-subject", "rider@example.com", true, "Transit Rider");
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_google", "rider@example.com", "Transit Rider", false, true);
        when(googleOAuthService.verifyCallback("state-cookie", "state-123", "code-123", null))
            .thenReturn(new GoogleOAuthService.VerifiedGoogleOAuthCallback("login", "/?panel=commutes", identity));
        when(accountService.googleLogin(identity))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<Void> response = controller.googleOAuthCallback(
            "code-123",
            "state-123",
            null,
            "state-cookie",
            null,
            requestFrom("203.0.113.61")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FOUND);
        assertThat(response.getHeaders().getFirst(HttpHeaders.LOCATION)).isEqualTo("/?panel=commutes");
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE)).anySatisfy(cookie ->
            assertThat(cookie).contains("linewatch_session=raw-token")
        );
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE)).anySatisfy(cookie ->
            assertThat(cookie).contains("linewatch_google_oauth=").contains("Max-Age=0")
        );
        verify(rateLimiter).requireAuthAttempt("google-oauth-callback", "203.0.113.61");
    }

    @Test
    void googleOAuthCallbackLinksCurrentAccountWithoutReplacingSessionCookie() {
        VerifiedGoogleIdentity identity = new VerifiedGoogleIdentity("google-subject", "rider@example.com", true, "Transit Rider");
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false, true);
        when(googleOAuthService.verifyCallback("state-cookie", "state-123", "code-123", null))
            .thenReturn(new GoogleOAuthService.VerifiedGoogleOAuthCallback("link", "/?panel=commutes", identity));
        when(accountService.linkGoogle("raw-session", identity))
            .thenReturn(new AccountResponses.AuthResponse(true, user));

        ResponseEntity<Void> response = controller.googleOAuthCallback(
            "code-123",
            "state-123",
            null,
            "state-cookie",
            "raw-session",
            requestFrom("203.0.113.62")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FOUND);
        assertThat(response.getHeaders().getFirst(HttpHeaders.LOCATION)).isEqualTo("/?panel=commutes");
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE)).noneSatisfy(cookie ->
            assertThat(cookie).contains("linewatch_session=")
        );
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE)).anySatisfy(cookie ->
            assertThat(cookie).contains("linewatch_google_oauth=").contains("Max-Age=0")
        );
        verify(accountService).linkGoogle("raw-session", identity);
        verify(rateLimiter).requireAuthAttempt("google-oauth-callback", "203.0.113.62");
    }

    @Test
    void googleOAuthCallbackRedirectsToAccountErrorWhenStateFails() {
        when(googleOAuthService.verifyCallback("state-cookie", "wrong-state", "code-123", null))
            .thenThrow(new AccountException(HttpStatus.BAD_REQUEST, "google_oauth_failed", "Could not complete Google sign-in."));

        ResponseEntity<Void> response = controller.googleOAuthCallback(
            "code-123",
            "wrong-state",
            null,
            "state-cookie",
            null,
            requestFrom("203.0.113.63")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FOUND);
        assertThat(response.getHeaders().getFirst(HttpHeaders.LOCATION)).isEqualTo("/?account_error=google_oauth_failed");
        assertThat(response.getHeaders().get(HttpHeaders.SET_COOKIE)).anySatisfy(cookie ->
            assertThat(cookie).contains("linewatch_google_oauth=").contains("Max-Age=0")
        );
        verify(rateLimiter).requireAuthAttempt("google-oauth-callback", "203.0.113.63");
    }

    private MockHttpServletRequest requestFrom(String remoteAddress) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        return request;
    }
}
