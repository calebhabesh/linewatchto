package com.calebhabesh.linewatch.account;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AccountController {
    private final AccountService accountService;
    private final AuthCookieFactory cookieFactory;
    private final AccountRateLimiter rateLimiter;

    public AccountController(
        AccountService accountService,
        AuthCookieFactory cookieFactory,
        AccountRateLimiter rateLimiter
    ) {
        this.accountService = accountService;
        this.cookieFactory = cookieFactory;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping("/register")
    public ResponseEntity<AccountResponses.AuthResponse> register(
        @RequestBody AccountService.RegisterRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("register", AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AccountResponses.AuthResponse> login(
        @RequestBody AccountService.LoginRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("login", AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.login(request));
    }

    @PostMapping("/demo")
    public ResponseEntity<AccountResponses.AuthResponse> demo(HttpServletRequest httpRequest) {
        rateLimiter.requireDemoAttempt(AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.demoLogin());
    }

    @PostMapping("/password-reset/request")
    public ResponseEntity<AccountService.PasswordResetRequestResponse> requestPasswordReset(
        @RequestBody AccountService.PasswordResetRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requirePasswordResetAttempt(AccountRateLimiter.clientAddress(httpRequest), request.email());
        return ResponseEntity.ok(accountService.requestPasswordReset(request));
    }

    @PostMapping("/password-reset/confirm")
    public ResponseEntity<AccountResponses.AuthResponse> confirmPasswordReset(
        @RequestBody AccountService.PasswordResetConfirmRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("password-reset-confirm", AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.confirmPasswordReset(request));
    }

    @PostMapping("/logout")
    public ResponseEntity<AccountResponses.AuthResponse> logout(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken
    ) {
        accountService.logout(rawSessionToken);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookieFactory.expiredCookie().toString())
            .body(new AccountResponses.AuthResponse(false, null));
    }

    @GetMapping("/me")
    public AccountResponses.AuthResponse me(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken
    ) {
        return accountService.currentUser(rawSessionToken);
    }

    @ExceptionHandler(AccountException.class)
    public ResponseEntity<AccountErrorResponse> handleAccountException(AccountException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new AccountErrorResponse(ex.getError(), ex.getMessage()));
    }

    private ResponseEntity<AccountResponses.AuthResponse> authenticated(AccountResponses.AuthSession session) {
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookieFactory.sessionCookie(session.rawSessionToken(), accountService.sessionTtl()).toString())
            .body(new AccountResponses.AuthResponse(true, session.user()));
    }
}
