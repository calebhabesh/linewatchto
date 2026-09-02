package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.calebhabesh.linewatch.push.PushNotificationService;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

class AccountSessionRenewalIntegrationTest {
    private static final Instant NOW = Instant.parse("2026-06-05T14:30:00Z");

    private final AccountRepository accountRepository = mock(AccountRepository.class);
    private final UserSessionRepository sessionRepository = mock(UserSessionRepository.class);
    private final PasswordResetTokenRepository passwordResetTokenRepository = mock(PasswordResetTokenRepository.class);
    private final PasswordHasher passwordHasher = new PasswordHasher();
    private final SessionTokenService tokenService = new SessionTokenService();
    private final PasswordResetEmailSender passwordResetEmailSender = mock(PasswordResetEmailSender.class);
    private final PasswordResetLinkFactory passwordResetLinkFactory = new PasswordResetLinkFactory("https://linewatch.example");
    private final EmailVerificationService emailVerificationService = mock(EmailVerificationService.class);
    private final AccountAuthIdentityRepository authIdentityRepository = mock(AccountAuthIdentityRepository.class);
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final GoogleIdentityVerifier googleIdentityVerifier = mock(GoogleIdentityVerifier.class);
    private final AccountSessionRequestContext sessionContext = new AccountSessionRequestContext();
    private final AuthCookieFactory cookieFactory = new AuthCookieFactory(false);
    private final AccountService accountService = new AccountService(
        accountRepository,
        sessionRepository,
        passwordResetTokenRepository,
        passwordHasher,
        tokenService,
        passwordResetEmailSender,
        passwordResetLinkFactory,
        emailVerificationService,
        authIdentityRepository,
        savedCommuteRepository,
        googleIdentityVerifier,
        new GoogleAuthProperties(),
        sessionContext,
        Clock.fixed(NOW, ZoneOffset.UTC),
        false,
        false,
        Duration.ofDays(365)
    );
    private final AccountSessionCookieInterceptor interceptor = new AccountSessionCookieInterceptor(
        sessionContext,
        cookieFactory,
        accountService,
        new SessionTokenResolver()
    );

    @BeforeEach
    void saveSessionEntityByReference() {
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void appOpenUpgradesLegacyDatabaseExpiryAndBrowserCookieTogether() throws Exception {
        UserSessionEntity legacySession = legacySession();
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(legacySession));
        when(authIdentityRepository.existsByAccount_IdAndProvider("user_test", AccountAuthIdentityEntity.PROVIDER_GOOGLE))
            .thenReturn(false);

        MockMvc mvc = MockMvcBuilders.standaloneSetup(accountController())
            .addInterceptors(interceptor)
            .setCustomArgumentResolvers(new SessionTokenArgumentResolver(new SessionTokenResolver()))
            .build();

        mvc.perform(get("/api/auth/me").cookie(new Cookie(AuthCookieFactory.COOKIE_NAME, "raw-token")))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.containsString("Max-Age=31536000")));

        assertThat(legacySession.getExpiresAt()).isEqualTo(Instant.parse("2027-06-05T14:30:00Z"));
        verify(sessionRepository).save(legacySession);
    }

    @Test
    void protectedRequestRenewsDatabaseAndCookieBeforeAConflictResponse() throws Exception {
        UserSessionEntity legacySession = legacySession();
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(legacySession));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new ConflictController())
            .addInterceptors(interceptor)
            .build();

        mvc.perform(post("/api/account/test-conflict").cookie(new Cookie(AuthCookieFactory.COOKIE_NAME, "raw-token")))
            .andExpect(status().isConflict())
            .andExpect(header().string(HttpHeaders.SET_COOKIE, org.hamcrest.Matchers.containsString("Max-Age=31536000")));

        assertThat(legacySession.getExpiresAt()).isEqualTo(Instant.parse("2027-06-05T14:30:00Z"));
        verify(sessionRepository).save(legacySession);
    }

    private UserSessionEntity legacySession() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-05-27T14:30:00Z")
        );
        return UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-token"),
            Instant.parse("2026-05-27T14:30:00Z"),
            Instant.parse("2026-06-10T14:30:00Z")
        );
    }

    private AccountController accountController() {
        return new AccountController(
            accountService,
            cookieFactory,
            mock(AccountRateLimiter.class),
            new GoogleAuthProperties(),
            mock(GoogleOAuthService.class),
            mock(PushNotificationService.class),
            new ClientAddressResolver(new TrustedProxyProperties()),
            new PasswordResetDevLinkPolicy(true, "127.0.0.1", "http://localhost:3000", "http://localhost:3000"),
            new EmailVerificationDevLinkPolicy(true, "127.0.0.1", "http://localhost:3000", "http://localhost:3000"),
            false
        );
    }

    @RestController
    static class ConflictController {
        @PostMapping("/api/account/test-conflict")
        ResponseEntity<Void> conflict() {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }
}
