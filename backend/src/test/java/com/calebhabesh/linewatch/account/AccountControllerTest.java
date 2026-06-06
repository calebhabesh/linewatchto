package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class AccountControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final AuthCookieFactory cookieFactory = new AuthCookieFactory(false);
    private final AccountController controller = new AccountController(accountService, cookieFactory);

    @Test
    void loginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false);
        when(accountService.login(new AccountService.LoginRequest("rider@example.com", "correct horse battery staple")))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.login(
            new AccountService.LoginRequest("rider@example.com", "correct horse battery staple")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
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
            "If an account exists for that email, a password reset link is available.",
            "dev-token",
            Instant.parse("2026-06-05T15:00:00Z")
        );
        when(accountService.requestPasswordReset(request)).thenReturn(serviceResponse);

        ResponseEntity<AccountService.PasswordResetRequestResponse> response = controller.requestPasswordReset(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(serviceResponse);
    }

    @Test
    void passwordResetConfirmSetsSessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false);
        AccountService.PasswordResetConfirmRequest request = new AccountService.PasswordResetConfirmRequest("dev-token", "new correct horse 2");
        when(accountService.confirmPasswordReset(request))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.confirmPasswordReset(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
    }
}
