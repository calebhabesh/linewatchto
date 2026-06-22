package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class AccountControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final AuthCookieFactory cookieFactory = new AuthCookieFactory(false);
    private final AccountRateLimiter rateLimiter = mock(AccountRateLimiter.class);
    private final GoogleAuthProperties googleAuthProperties = googleProperties();
    private final AccountController controller = new AccountController(accountService, cookieFactory, rateLimiter, googleAuthProperties);

    private GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        return result;
    }

    @Test
    void loginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false);
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
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false);
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
    void googleLoginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_google", "rider@example.com", "Transit Rider", false);
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

    private MockHttpServletRequest requestFrom(String remoteAddress) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        return request;
    }
}
