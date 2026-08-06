package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.push.PushNotificationService;
import com.calebhabesh.linewatch.push.PushRequests;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/api/auth")
public class AccountController {
    private final AccountService accountService;
    private final AuthCookieFactory cookieFactory;
    private final AccountRateLimiter rateLimiter;
    private final GoogleAuthProperties googleAuthProperties;
    private final GoogleOAuthService googleOAuthService;
    private final PushNotificationService pushNotificationService;
    private final boolean devAccountEnabled;

    public AccountController(
        AccountService accountService,
        AuthCookieFactory cookieFactory,
        AccountRateLimiter rateLimiter,
        GoogleAuthProperties googleAuthProperties,
        GoogleOAuthService googleOAuthService,
        PushNotificationService pushNotificationService,
        @Value("${linewatch.auth.dev-account.enabled:false}") boolean devAccountEnabled
    ) {
        this.accountService = accountService;
        this.cookieFactory = cookieFactory;
        this.rateLimiter = rateLimiter;
        this.googleAuthProperties = googleAuthProperties;
        this.googleOAuthService = googleOAuthService;
        this.pushNotificationService = pushNotificationService;
        this.devAccountEnabled = devAccountEnabled;
    }

    @GetMapping("/config")
    public AccountResponses.AuthConfigResponse config() {
        return new AccountResponses.AuthConfigResponse(
            googleAuthProperties.oauthConfigured(),
            googleAuthProperties.oauthConfigured() ? googleAuthProperties.getClientId() : ""
        );
    }

    @GetMapping("/google/start")
    public ResponseEntity<Void> startGoogleOAuth(
        @RequestParam(name = "mode", defaultValue = GoogleOAuthService.MODE_LOGIN) String mode,
        @RequestParam(name = "returnTo", defaultValue = "/") String returnTo,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("google-oauth-start", AccountRateLimiter.clientAddress(httpRequest));
        GoogleOAuthService.GoogleOAuthStart start = googleOAuthService.start(mode, returnTo);
        return ResponseEntity.status(HttpStatus.FOUND)
            .header(HttpHeaders.LOCATION, start.authorizationUri().toString())
            .header(
                HttpHeaders.SET_COOKIE,
                cookieFactory.googleOAuthStateCookie(start.cookieValue(), googleOAuthService.stateTtl()).toString()
            )
            .build();
    }

    @GetMapping("/google/callback")
    public ResponseEntity<Void> googleOAuthCallback(
        @RequestParam(name = "code", required = false) String code,
        @RequestParam(name = "state", required = false) String state,
        @RequestParam(name = "error", required = false) String error,
        @CookieValue(name = AuthCookieFactory.GOOGLE_OAUTH_COOKIE_NAME, required = false) String googleOAuthStateCookie,
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("google-oauth-callback", AccountRateLimiter.clientAddress(httpRequest));
        ResponseCookie expiredOAuthCookie = cookieFactory.expiredGoogleOAuthStateCookie();
        try {
            GoogleOAuthService.VerifiedGoogleOAuthCallback callback = googleOAuthService.verifyCallback(
                googleOAuthStateCookie,
                state,
                code,
                error
            );
            if (GoogleOAuthService.MODE_LINK.equals(callback.mode())) {
                accountService.linkGoogle(rawSessionToken, callback.identity());
                return redirect(callback.returnTo(), expiredOAuthCookie);
            }

            AccountResponses.AuthSession session = accountService.googleLogin(callback.identity());
            return redirect(
                callback.returnTo(),
                cookieFactory.sessionCookie(session.rawSessionToken(), accountService.sessionTtl()),
                expiredOAuthCookie
            );
        } catch (AccountException ex) {
            return redirect(oauthErrorRedirect(ex.getError()), expiredOAuthCookie);
        }
    }

    @PostMapping("/google")
    public ResponseEntity<AccountResponses.AuthResponse> google(
        @RequestBody AccountService.GoogleLoginRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("google", AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.googleLogin(request));
    }

    @PostMapping("/google/link")
    public ResponseEntity<AccountResponses.AuthResponse> linkGoogle(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody AccountService.GoogleLoginRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("google-link", AccountRateLimiter.clientAddress(httpRequest));
        return ResponseEntity.ok(accountService.linkGoogle(rawSessionToken, request));
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

    @PostMapping("/dev")
    public ResponseEntity<AccountResponses.AuthResponse> dev(HttpServletRequest httpRequest) {
        if (!devAccountEnabled) {
            throw new AccountException(HttpStatus.NOT_FOUND, "dev_account_disabled", "Dev account sign-in is only available when explicitly enabled for local development.");
        }
        rateLimiter.requireDemoAttempt(AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.devLogin());
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
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody(required = false) AccountService.LogoutRequest request
    ) {
        disableCurrentPushEndpoint(rawSessionToken, request);
        accountService.logout(rawSessionToken);
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookieFactory.expiredCookie().toString())
            .body(new AccountResponses.AuthResponse(false, null));
    }

    @GetMapping("/me")
    public ResponseEntity<AccountResponses.AuthResponse> me(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken
    ) {
        AccountResponses.AuthResponse response = accountService.currentUser(rawSessionToken);
        if (response.authenticated() && rawSessionToken != null && !rawSessionToken.isBlank()) {
            return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookieFactory.sessionCookie(rawSessionToken, accountService.sessionTtl()).toString())
                .body(response);
        }
        return ResponseEntity.ok(response);
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

    private ResponseEntity<Void> redirect(String location, ResponseCookie... cookies) {
        ResponseEntity.BodyBuilder response = ResponseEntity.status(HttpStatus.FOUND)
            .header(HttpHeaders.LOCATION, location);
        for (ResponseCookie cookie : cookies) {
            response.header(HttpHeaders.SET_COOKIE, cookie.toString());
        }
        return response.build();
    }

    private String oauthErrorRedirect(String error) {
        String code = error == null || error.isBlank() ? "google_oauth_failed" : error;
        return UriComponentsBuilder.fromPath("/")
            .queryParam("account_error", code)
            .build()
            .encode()
            .toUriString();
    }

    private void disableCurrentPushEndpoint(String rawSessionToken, AccountService.LogoutRequest request) {
        if (request == null || request.pushEndpoint() == null || request.pushEndpoint().isBlank()) {
            return;
        }
        try {
            AccountEntity account = accountService.requireAccount(rawSessionToken);
            pushNotificationService.disableSubscription(
                account,
                new PushRequests.SubscriptionEndpointRequest(request.pushEndpoint())
            );
        } catch (AccountException ex) {
            if (ex.getStatus() != HttpStatus.UNAUTHORIZED) {
                throw ex;
            }
        }
    }
}
