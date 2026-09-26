package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.http.HttpStatus;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.web.util.UriComponentsBuilder;
import org.mockito.ArgumentCaptor;

@ExtendWith(OutputCaptureExtension.class)
class AccountServiceTest {
    private final AccountRepository accountRepository = mock(AccountRepository.class);
    private final UserSessionRepository sessionRepository = mock(UserSessionRepository.class);
    private final PasswordResetTokenRepository passwordResetTokenRepository = mock(PasswordResetTokenRepository.class);
    private final PasswordResetEmailSender passwordResetEmailSender = mock(PasswordResetEmailSender.class);
    private final EmailVerificationService emailVerificationService = mock(EmailVerificationService.class);
    private final AccountAuthIdentityRepository authIdentityRepository = mock(AccountAuthIdentityRepository.class);
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final GoogleIdentityVerifier googleIdentityVerifier = mock(GoogleIdentityVerifier.class);
    private final AccountSessionRequestContext sessionRequestContext = mock(AccountSessionRequestContext.class);
    private final GoogleAuthProperties googleAuthProperties = googleProperties();
    private final PasswordHasher passwordHasher = new PasswordHasher(4);
    private final SessionTokenService tokenService = new SessionTokenService();
    private final PasswordResetLinkFactory passwordResetLinkFactory = new PasswordResetLinkFactory("https://linewatch.example");
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T14:30:00Z"), ZoneOffset.UTC);
    private final AccountService service = new AccountService(
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
        googleAuthProperties,
        sessionRequestContext,
        clock,
        true,
        true,
        Duration.ofDays(365)
    );

    private static GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        return result;
    }

    @Test
    void registerNormalizesEmailHashesPasswordAndRequiresVerificationBeforeSession() {
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.empty());
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(emailVerificationService.issue(any(AccountEntity.class), eq(clock.instant())))
            .thenReturn(new EmailVerificationService.IssuedVerification(
                "verification-token",
                Instant.parse("2026-06-06T14:30:00Z")
            ));

        AccountService.EmailVerificationRequestResponse response = service.register(
            new AccountService.RegisterRequest(" Rider@Example.COM ", " Rider ")
        );

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).contains("verify");
        assertThat(response.devVerificationToken()).isEqualTo("verification-token");
        assertThat(response.expiresAt()).isEqualTo(Instant.parse("2026-06-06T14:30:00Z"));
        assertThat(service.sessionTtl()).isEqualTo(Duration.ofDays(365));
        ArgumentCaptor<AccountEntity> accountCaptor = ArgumentCaptor.forClass(AccountEntity.class);
        verify(accountRepository).save(accountCaptor.capture());
        assertThat(accountCaptor.getValue().getEmail()).isEqualTo("rider@example.com");
        assertThat(accountCaptor.getValue().getDisplayName()).isEqualTo("Rider");
        assertThat(accountCaptor.getValue().isEmailVerified()).isFalse();
        assertThat(accountCaptor.getValue().getPasswordHash()).isNull();
        verify(emailVerificationService).issue(accountCaptor.getValue(), clock.instant());
        verify(sessionRepository, never()).save(any(UserSessionEntity.class));
    }

    @Test
    void registerRejectsDuplicateEmail() {
        AccountEntity existing = AccountEntity.create(
            "user_existing",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("existing password 1"),
            false,
            clock.instant()
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void registerReissuesVerificationForPendingAddressWithoutAcceptingAPassword() {
        AccountEntity pending = AccountEntity.createPendingEmailAccount(
            "user_pending",
            "rider@example.com",
            "Old pending name",
            clock.instant().minusSeconds(60)
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(pending));
        when(accountRepository.save(pending)).thenReturn(pending);
        when(emailVerificationService.issue(pending, clock.instant()))
            .thenReturn(new EmailVerificationService.IssuedVerification(
                "new-verification-token",
                Instant.parse("2026-06-06T14:30:00Z")
            ));

        AccountService.EmailVerificationRequestResponse response = service.register(
            new AccountService.RegisterRequest("rider@example.com", "Mailbox Owner")
        );

        assertThat(response.accepted()).isTrue();
        assertThat(pending.getDisplayName()).isEqualTo("Mailbox Owner");
        assertThat(pending.getPasswordHash()).isNull();
        verify(emailVerificationService).issue(pending, clock.instant());
    }

    @Test
    void registerRejectsMalformedEmail() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@localhost", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void registerRejectsOverlongDisplayNameBeforeSaving() {
        String displayName = "A".repeat(121);

        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", displayName)
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Display name must be 120 characters or less");
        verify(accountRepository, never()).save(any(AccountEntity.class));
    }

    @Test
    void verificationRejectsOverlongAsciiPasswordBeforeConsumingToken() {
        String password = "a".repeat(257) + " 1";

        assertThatThrownBy(() -> service.confirmEmailVerification(
            new AccountService.EmailVerificationConfirmRequest("verification-token", password)
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Password must be 72 UTF-8 bytes or less");
        verify(accountRepository, never()).save(any(AccountEntity.class));
    }

    @Test
    void verificationRejectsPasswordOverBcryptUtf8ByteLimit() {
        String password = "é".repeat(40) + "1a";

        assertThatThrownBy(() -> service.confirmEmailVerification(
            new AccountService.EmailVerificationConfirmRequest("verification-token", password)
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("72 UTF-8 bytes or less");
        verify(emailVerificationService, never()).confirm(any(), any());
    }

    @Test
    void loginTreatsOverlongBcryptInputAsInvalidCredentialsInsteadOfServerError() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            clock.instant()
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.login(new AccountService.LoginRequest(
            "rider@example.com",
            "é".repeat(40)
        )))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Incorrect Email or Password");
    }

    @Test
    void verificationAcceptsEasyPassphrasePassword() {
        AccountEntity account = AccountEntity.createPendingEmailAccount(
            "user_test", "rider@example.com", "Rider", clock.instant()
        );
        when(emailVerificationService.confirm("verification-token", clock.instant())).thenReturn(account);
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.confirmEmailVerification(
            new AccountService.EmailVerificationConfirmRequest("verification-token", "correct horse battery staple")
        );

        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(passwordHasher.matches("correct horse battery staple", account.getPasswordHash())).isTrue();
    }

    @Test
    void verificationRejectsPasswordWithoutLetter() {
        assertThatThrownBy(() -> service.confirmEmailVerification(
            new AccountService.EmailVerificationConfirmRequest("verification-token", "1234567890!")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Password must include at least one letter");
    }

    @Test
    void verificationRejectsPasswordWithoutNumberSymbolOrSpace() {
        assertThatThrownBy(() -> service.confirmEmailVerification(
            new AccountService.EmailVerificationConfirmRequest("verification-token", "aaaaaaaaaa")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Password must include a number, symbol, or space");
    }

    @Test
    void loginRejectsInvalidPassword() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.login(
            new AccountService.LoginRequest("rider@example.com", "wrong password")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Incorrect Email or Password");
    }

    @Test
    void loginRejectsCorrectPasswordUntilEmailIsVerified() {
        AccountEntity account = AccountEntity.createUnverified(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.login(
            new AccountService.LoginRequest("rider@example.com", "correct horse battery staple")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Verify your email")
            .extracting("status")
            .isEqualTo(HttpStatus.FORBIDDEN);
        verify(sessionRepository, never()).save(any(UserSessionEntity.class));
    }

    @Test
    void resendVerificationUsesNeutralResponseAndIssuesTokenOnlyForUnverifiedPasswordAccount() {
        AccountEntity account = AccountEntity.createUnverified(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));
        when(emailVerificationService.issue(account, clock.instant()))
            .thenReturn(new EmailVerificationService.IssuedVerification(
                "verification-token",
                Instant.parse("2026-06-06T14:30:00Z")
            ));

        AccountService.EmailVerificationRequestResponse response = service.requestEmailVerification(
            new AccountService.EmailVerificationRequest(" Rider@Example.COM ")
        );

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).startsWith("If an unverified account exists");
        assertThat(response.devVerificationToken()).isEqualTo("verification-token");
        verify(emailVerificationService).issue(account, clock.instant());
    }

    @Test
    void resendVerificationDoesNotRevealUnknownOrAlreadyVerifiedAccounts() {
        when(accountRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());

        AccountService.EmailVerificationRequestResponse response = service.requestEmailVerification(
            new AccountService.EmailVerificationRequest("missing@example.com")
        );

        assertThat(response.accepted()).isTrue();
        assertThat(response.devVerificationToken()).isNull();
        assertThat(response.expiresAt()).isNull();
        verify(emailVerificationService, never()).issue(any(), any());
    }

    @Test
    void confirmEmailVerificationCreatesTheFirstAuthenticatedSession() {
        AccountEntity account = AccountEntity.createUnverified(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            Instant.parse("2026-06-05T14:00:00Z")
        );
        account.markEmailVerified(clock.instant());
        when(emailVerificationService.confirm("verification-token", clock.instant())).thenReturn(account);
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.confirmEmailVerification(
            new AccountService.EmailVerificationConfirmRequest("verification-token", "correct horse battery staple")
        );

        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(response.rawSessionToken()).isNotBlank();
        verify(sessionRepository).save(any(UserSessionEntity.class));
    }

    @Test
    void currentUserRejectsExpiredSession() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity expired = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-token"),
            Instant.parse("2026-06-05T13:00:00Z"),
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token"))).thenReturn(Optional.of(expired));

        assertThat(service.currentUser("raw-token").authenticated()).isFalse();
    }

    @Test
    void currentUserLogsPrivacySafeMissingSessionOutcome(CapturedOutput output) {
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token"))).thenReturn(Optional.empty());

        assertThat(service.currentUser("raw-token").authenticated()).isFalse();

        assertThat(output).contains("outcome=session_not_found operation=current_user");
        assertThat(output).doesNotContain("raw-token");
        assertThat(output).doesNotContain(tokenService.hashToken("raw-token"));
    }

    @Test
    void currentUserMigratesAStillValidLegacySessionToTheLongSlidingTtl() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-token"),
            Instant.parse("2026-05-27T14:30:00Z"),
            Instant.parse("2026-06-10T14:30:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(session));

        assertThat(service.currentUser("raw-token").authenticated()).isTrue();

        assertThat(session.getExpiresAt()).isEqualTo(Instant.parse("2027-06-05T14:30:00Z"));
        verify(sessionRepository).save(session);
        verify(sessionRequestContext).markValidated(true);
    }

    @Test
    void protectedAccountActivityDoesNotRenewFreshSessionOrCookieEarly() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-token"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2027-06-05T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(session));

        assertThat(service.requireAccount("raw-token")).isSameAs(account);

        verify(sessionRepository, never()).save(any(UserSessionEntity.class));
        verify(sessionRequestContext).markValidated(false);
    }

    @Test
    void protectedAccountActivityRenewsAfterTheDailyWriteInterval() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-token"),
            Instant.parse("2026-06-04T14:00:00Z"),
            Instant.parse("2027-06-04T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(session));

        assertThat(service.requireAccount("raw-token")).isSameAs(account);

        assertThat(session.getExpiresAt()).isEqualTo(Instant.parse("2027-06-05T14:30:00Z"));
        verify(sessionRepository).save(session);
        verify(sessionRequestContext).markValidated(true);
    }

    @Test
    void demoLoginsCreateIsolatedDisposableAccounts() {
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession first = service.demoLogin();
        AccountResponses.AuthSession second = service.demoLogin();

        assertThat(first.user().demo()).isTrue();
        assertThat(first.user().email()).isEqualTo(AccountService.DEMO_EMAIL);
        assertThat(second.user().email()).isEqualTo(AccountService.DEMO_EMAIL);
        assertThat(first.user().id()).isNotEqualTo(second.user().id());

        ArgumentCaptor<AccountEntity> accounts = ArgumentCaptor.forClass(AccountEntity.class);
        verify(accountRepository, times(2)).save(accounts.capture());
        assertThat(accounts.getAllValues())
            .extracting(AccountEntity::getEmail)
            .doesNotHaveDuplicates()
            .allMatch(email -> email.endsWith("@demo.linewatch.local"));
    }

    @Test
    void logoutDeletesDisposableDemoAccount() {
        AccountEntity account = AccountEntity.create(
            "user_demo_one",
            "user_demo_one@demo.linewatch.local",
            "Demo Rider",
            "hash",
            true,
            clock.instant()
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_demo",
            account,
            tokenService.hashToken("raw-token"),
            clock.instant(),
            clock.instant().plusSeconds(3600)
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-token"))).thenReturn(Optional.of(session));

        service.logout("raw-token");

        verify(accountRepository).delete(account);
        verify(sessionRepository, never()).deleteByTokenHash(any());
    }

    @Test
    void devLoginCreatesSeededNonDemoAccountAndCommutes() {
        when(accountRepository.findByEmail(AccountService.DEV_EMAIL)).thenReturn(Optional.empty());
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(savedCommuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_dev", "finch", "union")).thenReturn(false);
        when(savedCommuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_dev", "mount-dennis", "kennedy")).thenReturn(false);

        AccountResponses.AuthSession response = service.devLogin();

        assertThat(response.user().demo()).isFalse();
        assertThat(response.user().email()).isEqualTo(AccountService.DEV_EMAIL);
        assertThat(response.user().displayName()).isEqualTo("Dev Rider");

        ArgumentCaptor<SavedCommuteEntity> commuteCaptor = ArgumentCaptor.forClass(SavedCommuteEntity.class);
        verify(savedCommuteRepository, times(2)).save(commuteCaptor.capture());
        assertThat(commuteCaptor.getAllValues())
            .extracting(SavedCommuteEntity::getLabel)
            .containsExactly("Line 1: Finch to Union", "Line 5/2: Mount Dennis to Kennedy");
    }

    @Test
    void requestPasswordResetCreatesShortLivedTokenAndEmailsLinkForKnownEmail() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));
        when(passwordResetTokenRepository.save(any(PasswordResetTokenEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountService.PasswordResetRequestResponse response = service.requestPasswordReset(
            new AccountService.PasswordResetRequest(" Rider@Example.COM ")
        );

        ArgumentCaptor<PasswordResetTokenEntity> resetTokenCaptor = ArgumentCaptor.forClass(PasswordResetTokenEntity.class);
        ArgumentCaptor<String> resetUrlCaptor = ArgumentCaptor.forClass(String.class);
        verify(passwordResetTokenRepository).save(resetTokenCaptor.capture());
        verify(passwordResetEmailSender).sendPasswordResetEmail(
            eq("rider@example.com"),
            resetUrlCaptor.capture(),
            eq(Instant.parse("2026-06-05T15:00:00Z"))
        );
        String resetUrl = resetUrlCaptor.getValue();
        assertThat(resetUrl).startsWith("https://linewatch.example/reset-password?token=");
        String rawResetToken = UriComponentsBuilder.fromUriString(resetUrl).build().getQueryParams().getFirst("token");

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).isEqualTo("If an account exists for that email, a password reset link has been sent.");
        assertThat(response.devResetToken()).isEqualTo(rawResetToken);
        assertThat(response.expiresAt()).isEqualTo(Instant.parse("2026-06-05T15:00:00Z"));
        assertThat(resetTokenCaptor.getValue().getTokenHash()).isEqualTo(tokenService.hashToken(rawResetToken));
        verify(passwordResetTokenRepository).deleteUnusedByAccountId("user_test");
    }

    @Test
    void requestPasswordResetHidesDevTokenWhenDevLinksAreDisabledButStillEmailsLink() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));
        when(passwordResetTokenRepository.save(any(PasswordResetTokenEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        AccountService productionLikeService = new AccountService(
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
            googleAuthProperties,
            sessionRequestContext,
            clock,
            false,
            false,
            Duration.ofDays(365)
        );

        AccountService.PasswordResetRequestResponse response = productionLikeService.requestPasswordReset(
            new AccountService.PasswordResetRequest("rider@example.com")
        );

        assertThat(response.devResetToken()).isNull();
        verify(passwordResetEmailSender).sendPasswordResetEmail(
            eq("rider@example.com"),
            any(),
            eq(Instant.parse("2026-06-05T15:00:00Z"))
        );
    }

    @Test
    void requestPasswordResetUsesSamePublicResponseForUnknownEmail() {
        when(accountRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());

        AccountService.PasswordResetRequestResponse response = service.requestPasswordReset(
            new AccountService.PasswordResetRequest("missing@example.com")
        );

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).isEqualTo("If an account exists for that email, a password reset link has been sent.");
        assertThat(response.devResetToken()).isNull();
        assertThat(response.expiresAt()).isNull();
        verify(passwordResetEmailSender, never()).sendPasswordResetEmail(any(), any(), any());
    }

    @Test
    void confirmPasswordResetUpdatesPasswordInvalidatesSessionsAndCreatesSession() {
        AccountEntity account = AccountEntity.createUnverified(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("old password 1"),
            Instant.parse("2026-06-05T14:00:00Z")
        );
        String rawResetToken = "reset-token";
        PasswordResetTokenEntity token = PasswordResetTokenEntity.create(
            "reset_1",
            account,
            tokenService.hashToken(rawResetToken),
            Instant.parse("2026-06-05T14:20:00Z"),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        when(passwordResetTokenRepository.findByTokenHash(tokenService.hashToken(rawResetToken))).thenReturn(Optional.of(token));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.confirmPasswordReset(
            new AccountService.PasswordResetConfirmRequest(rawResetToken, "new correct horse 2")
        );

        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(response.rawSessionToken()).isNotBlank();
        assertThat(passwordHasher.matches("new correct horse 2", account.getPasswordHash())).isTrue();
        assertThat(account.isEmailVerified()).isTrue();
        assertThat(token.getUsedAt()).isEqualTo(Instant.parse("2026-06-05T14:30:00Z"));
        verify(sessionRepository).deleteByAccountId("user_test");
        verify(sessionRepository).save(any(UserSessionEntity.class));
    }

    @Test
    void confirmPasswordResetRejectsExpiredToken() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("old password 1"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PasswordResetTokenEntity token = PasswordResetTokenEntity.create(
            "reset_1",
            account,
            tokenService.hashToken("expired-token"),
            Instant.parse("2026-06-05T13:00:00Z"),
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(passwordResetTokenRepository.findByTokenHash(tokenService.hashToken("expired-token"))).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> service.confirmPasswordReset(
            new AccountService.PasswordResetConfirmRequest("expired-token", "new correct horse 2")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Reset link expired or invalid");
    }

    @Test
    void googleLoginCreatesPasswordlessAccountAndIdentity() {
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "Rider@Example.COM",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.empty());
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.empty());
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authIdentityRepository.save(any(AccountAuthIdentityEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.googleLogin(new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(response.user().displayName()).isEqualTo("Transit Rider");
        assertThat(response.user().demo()).isFalse();
        assertThat(response.rawSessionToken()).isNotBlank();
        verify(accountRepository).save(any(AccountEntity.class));
        verify(authIdentityRepository).save(any(AccountAuthIdentityEntity.class));
        verify(sessionRepository).save(any(UserSessionEntity.class));
    }

    @Test
    void googleLoginCanReuseVerifiedIdentityFromOAuthCallback() {
        VerifiedGoogleIdentity identity = new VerifiedGoogleIdentity(
            "google-subject-1",
            "Rider@Example.COM",
            true,
            "Transit Rider"
        );
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.empty());
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.empty());
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authIdentityRepository.save(any(AccountAuthIdentityEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.googleLogin(identity);

        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(response.user().googleLinked()).isTrue();
        verify(googleIdentityVerifier, never()).verify("credential");
    }

    @Test
    void googleLoginRejectsAnUnverifiedIdentityAtTheServiceBoundary() {
        VerifiedGoogleIdentity identity = new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            false,
            "Transit Rider"
        );

        assertThatThrownBy(() -> service.googleLogin(identity))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in");
        verify(accountRepository, never()).save(any(AccountEntity.class));
        verify(sessionRepository, never()).save(any(UserSessionEntity.class));
    }

    @Test
    void googleLoginUsesEmailPrefixWhenGoogleNameIsBlank() {
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            true,
            ""
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.empty());
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.empty());
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(authIdentityRepository.save(any(AccountAuthIdentityEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.googleLogin(new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.user().displayName()).isEqualTo("rider");
    }

    @Test
    void googleLoginSignsInExistingGoogleIdentity() {
        AccountEntity account = AccountEntity.createPasswordless(
            "user_google",
            "rider@example.com",
            "Transit Rider",
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        AccountAuthIdentityEntity identity = AccountAuthIdentityEntity.createGoogle(
            "identity_google",
            account,
            "google-subject-1",
            "old@example.com",
            true,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.of(identity));
        when(authIdentityRepository.existsByAccount_IdAndProvider("user_google", AccountAuthIdentityEntity.PROVIDER_GOOGLE)).thenReturn(true);
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.googleLogin(new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.user().id()).isEqualTo("user_google");
        assertThat(response.user().googleLinked()).isTrue();
        assertThat(identity.getEmail()).isEqualTo("rider@example.com");
        assertThat(identity.getLastLoginAt()).isEqualTo(Instant.parse("2026-06-05T14:30:00Z"));
        assertThat(account.getLastLoginAt()).isEqualTo(Instant.parse("2026-06-05T14:30:00Z"));
    }

    @Test
    void googleLoginBlocksSameEmailPasswordAccountWithoutAutoLinking() {
        AccountEntity passwordAccount = AccountEntity.create(
            "user_password",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.empty());
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(passwordAccount));

        assertThatThrownBy(() -> service.googleLogin(new AccountService.GoogleLoginRequest("credential")))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("linking Google")
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);

        verify(authIdentityRepository, never()).save(any(AccountAuthIdentityEntity.class));
    }

    @Test
    void verifiedGoogleLoginSafelyClaimsAPendingEmailRegistration() {
        AccountEntity pending = AccountEntity.createPendingEmailAccount(
            "user_pending",
            "rider@example.com",
            "Pending Rider",
            clock.instant().minusSeconds(60)
        );
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            true,
            "Google Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1"))
            .thenReturn(Optional.empty());
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(pending));
        when(accountRepository.save(pending)).thenReturn(pending);
        when(authIdentityRepository.save(any(AccountAuthIdentityEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.googleLogin(new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.user().id()).isEqualTo("user_pending");
        assertThat(response.user().googleLinked()).isTrue();
        assertThat(pending.isEmailVerified()).isTrue();
        assertThat(pending.getPasswordHash()).isNull();
        verify(emailVerificationService).discardPendingTokens("user_pending");
    }

    @Test
    void passwordLoginRejectsPasswordlessGoogleAccountWithoutNullHasherCall() {
        AccountEntity account = AccountEntity.createPasswordless(
            "user_google",
            "rider@example.com",
            "Transit Rider",
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(accountRepository.findByEmail("rider@example.com")).thenReturn(Optional.of(account));

        assertThatThrownBy(() -> service.login(
            new AccountService.LoginRequest("rider@example.com", "legacy")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Incorrect Email or Password");
    }

    @Test
    void linkGoogleAddsIdentityToCurrentPasswordAccount() {
        AccountEntity account = AccountEntity.create(
            "user_password",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-session"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-19T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-session"))).thenReturn(Optional.of(session));
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "Rider@Example.COM",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.empty());
        when(authIdentityRepository.findByAccount_IdAndProvider("user_password", "google")).thenReturn(Optional.empty());
        when(authIdentityRepository.save(any(AccountAuthIdentityEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthResponse response = service.linkGoogle("raw-session", new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.authenticated()).isTrue();
        assertThat(response.user().id()).isEqualTo("user_password");
        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(response.user().googleLinked()).isTrue();
        assertThat(account.getLastLoginAt()).isEqualTo(Instant.parse("2026-06-05T14:30:00Z"));
        verify(authIdentityRepository).save(any(AccountAuthIdentityEntity.class));
    }

    @Test
    void linkGoogleCanReuseVerifiedIdentityFromOAuthCallback() {
        AccountEntity account = AccountEntity.create(
            "user_password",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-session"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-19T14:00:00Z")
        );
        VerifiedGoogleIdentity identity = new VerifiedGoogleIdentity(
            "google-subject-1",
            "Rider@Example.COM",
            true,
            "Transit Rider"
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-session"))).thenReturn(Optional.of(session));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.empty());
        when(authIdentityRepository.findByAccount_IdAndProvider("user_password", "google")).thenReturn(Optional.empty());
        when(authIdentityRepository.save(any(AccountAuthIdentityEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthResponse response = service.linkGoogle("raw-session", identity);

        assertThat(response.authenticated()).isTrue();
        assertThat(response.user().googleLinked()).isTrue();
        verify(googleIdentityVerifier, never()).verify("credential");
    }

    @Test
    void linkGoogleRejectsMismatchedGoogleEmail() {
        AccountEntity account = AccountEntity.create(
            "user_password",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-session"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-19T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-session"))).thenReturn(Optional.of(session));
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "other@example.com",
            true,
            "Other Rider"
        ));

        assertThatThrownBy(() -> service.linkGoogle("raw-session", new AccountService.GoogleLoginRequest("credential")))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Google account email must match")
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);
        verify(authIdentityRepository, never()).save(any(AccountAuthIdentityEntity.class));
    }

    @Test
    void linkGoogleRejectsGoogleIdentityAlreadyLinkedToAnotherAccount() {
        AccountEntity currentAccount = AccountEntity.create(
            "user_current",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        AccountEntity otherAccount = AccountEntity.createPasswordless(
            "user_other",
            "rider@example.com",
            "Transit Rider",
            false,
            Instant.parse("2026-06-05T13:00:00Z")
        );
        AccountAuthIdentityEntity otherIdentity = AccountAuthIdentityEntity.createGoogle(
            "identity_other",
            otherAccount,
            "google-subject-1",
            "rider@example.com",
            true,
            Instant.parse("2026-06-05T13:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            currentAccount,
            tokenService.hashToken("raw-session"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-19T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-session"))).thenReturn(Optional.of(session));
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.of(otherIdentity));

        assertThatThrownBy(() -> service.linkGoogle("raw-session", new AccountService.GoogleLoginRequest("credential")))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("already linked to another LineWatch account")
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void linkGoogleRejectsAccountAlreadyLinkedToDifferentGoogleSubject() {
        AccountEntity account = AccountEntity.create(
            "user_password",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        AccountAuthIdentityEntity existingIdentity = AccountAuthIdentityEntity.createGoogle(
            "identity_existing",
            account,
            "google-subject-existing",
            "rider@example.com",
            true,
            Instant.parse("2026-06-05T13:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-session"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-19T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-session"))).thenReturn(Optional.of(session));
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-new",
            "rider@example.com",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-new")).thenReturn(Optional.empty());
        when(authIdentityRepository.findByAccount_IdAndProvider("user_password", "google")).thenReturn(Optional.of(existingIdentity));

        assertThatThrownBy(() -> service.linkGoogle("raw-session", new AccountService.GoogleLoginRequest("credential")))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("already linked to a different Google account")
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void linkGoogleIsIdempotentForSameAccountAndSubject() {
        AccountEntity account = AccountEntity.create(
            "user_password",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("correct horse battery staple"),
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        AccountAuthIdentityEntity existingIdentity = AccountAuthIdentityEntity.createGoogle(
            "identity_existing",
            account,
            "google-subject-1",
            "old@example.com",
            true,
            Instant.parse("2026-06-05T13:00:00Z")
        );
        UserSessionEntity session = UserSessionEntity.create(
            "session_test",
            account,
            tokenService.hashToken("raw-session"),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-19T14:00:00Z")
        );
        when(sessionRepository.findByTokenHash(tokenService.hashToken("raw-session"))).thenReturn(Optional.of(session));
        when(googleIdentityVerifier.verify("credential")).thenReturn(new VerifiedGoogleIdentity(
            "google-subject-1",
            "rider@example.com",
            true,
            "Transit Rider"
        ));
        when(authIdentityRepository.findByProviderAndProviderSubject("google", "google-subject-1")).thenReturn(Optional.of(existingIdentity));

        AccountResponses.AuthResponse response = service.linkGoogle("raw-session", new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.authenticated()).isTrue();
        assertThat(response.user().googleLinked()).isTrue();
        assertThat(existingIdentity.getEmail()).isEqualTo("rider@example.com");
        assertThat(existingIdentity.getLastLoginAt()).isEqualTo(Instant.parse("2026-06-05T14:30:00Z"));
        verify(authIdentityRepository, never()).save(any(AccountAuthIdentityEntity.class));
    }
}
