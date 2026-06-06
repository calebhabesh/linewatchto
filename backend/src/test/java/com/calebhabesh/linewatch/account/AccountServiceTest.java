package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class AccountServiceTest {
    private final AccountRepository accountRepository = mock(AccountRepository.class);
    private final UserSessionRepository sessionRepository = mock(UserSessionRepository.class);
    private final PasswordResetTokenRepository passwordResetTokenRepository = mock(PasswordResetTokenRepository.class);
    private final PasswordHasher passwordHasher = new PasswordHasher();
    private final SessionTokenService tokenService = new SessionTokenService();
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T14:30:00Z"), ZoneOffset.UTC);
    private final AccountService service = new AccountService(
        accountRepository,
        sessionRepository,
        passwordResetTokenRepository,
        passwordHasher,
        tokenService,
        clock,
        true
    );

    @Test
    void registerNormalizesEmailHashesPasswordAndCreatesSession() {
        when(accountRepository.existsByEmail("rider@example.com")).thenReturn(false);
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.register(
            new AccountService.RegisterRequest(" Rider@Example.COM ", "correct horse battery staple", " Rider ")
        );

        assertThat(response.user().email()).isEqualTo("rider@example.com");
        assertThat(response.user().displayName()).isEqualTo("Rider");
        assertThat(response.rawSessionToken()).isNotBlank();
        assertThat(response.expiresAt()).isAfter(Instant.parse("2026-06-05T14:30:00Z"));
        verify(accountRepository).save(any(AccountEntity.class));
        verify(sessionRepository).save(any(UserSessionEntity.class));
    }

    @Test
    void registerRejectsDuplicateEmail() {
        when(accountRepository.existsByEmail("rider@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", "correct horse battery staple", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void registerRejectsMalformedEmail() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@localhost", "correct horse battery staple", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void registerAcceptsEasyPassphrasePassword() {
        when(accountRepository.existsByEmail("rider@example.com")).thenReturn(false);
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.register(
            new AccountService.RegisterRequest("rider@example.com", "correct horse battery staple", "Rider")
        );

        assertThat(response.user().email()).isEqualTo("rider@example.com");
    }

    @Test
    void registerRejectsPasswordWithoutLetter() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", "1234567890!", "Rider")
        ))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Password must include at least one letter");
    }

    @Test
    void registerRejectsPasswordWithoutNumberSymbolOrSpace() {
        assertThatThrownBy(() -> service.register(
            new AccountService.RegisterRequest("rider@example.com", "aaaaaaaaaa", "Rider")
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
    void demoLoginCreatesSeedAccountWhenMissing() {
        when(accountRepository.findByEmail(AccountService.DEMO_EMAIL)).thenReturn(Optional.empty());
        when(accountRepository.save(any(AccountEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.demoLogin();

        assertThat(response.user().demo()).isTrue();
        assertThat(response.user().email()).isEqualTo(AccountService.DEMO_EMAIL);
    }

    @Test
    void requestPasswordResetCreatesShortLivedTokenForKnownEmail() {
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

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).isEqualTo("If an account exists for that email, a password reset link is available.");
        assertThat(response.devResetToken()).isNotBlank();
        assertThat(response.expiresAt()).isEqualTo(Instant.parse("2026-06-05T15:00:00Z"));
        verify(passwordResetTokenRepository).deleteUnusedByAccountId("user_test");
        verify(passwordResetTokenRepository).save(any(PasswordResetTokenEntity.class));
    }

    @Test
    void requestPasswordResetUsesSamePublicResponseForUnknownEmail() {
        when(accountRepository.findByEmail("missing@example.com")).thenReturn(Optional.empty());

        AccountService.PasswordResetRequestResponse response = service.requestPasswordReset(
            new AccountService.PasswordResetRequest("missing@example.com")
        );

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).isEqualTo("If an account exists for that email, a password reset link is available.");
        assertThat(response.devResetToken()).isNull();
        assertThat(response.expiresAt()).isNull();
    }

    @Test
    void confirmPasswordResetUpdatesPasswordInvalidatesSessionsAndCreatesSession() {
        AccountEntity account = AccountEntity.create(
            "user_test",
            "rider@example.com",
            "Rider",
            passwordHasher.hash("old password 1"),
            false,
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
}
