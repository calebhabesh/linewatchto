package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class EmailVerificationServiceTest {
    private final EmailVerificationTokenRepository tokenRepository = mock(EmailVerificationTokenRepository.class);
    private final SessionTokenService tokenService = new SessionTokenService();
    private final EmailVerificationEmailSender emailSender = mock(EmailVerificationEmailSender.class);
    private final EmailVerificationLinkFactory linkFactory = new EmailVerificationLinkFactory("https://linewatch.example/");
    private final EmailVerificationService service = new EmailVerificationService(
        tokenRepository,
        tokenService,
        emailSender,
        linkFactory
    );
    private final Instant now = Instant.parse("2026-08-24T14:30:00Z");

    @Test
    void issueReplacesUnusedTokensStoresOnlyAHashAndEmailsTheLink() {
        AccountEntity account = unverifiedAccount();
        when(tokenRepository.save(any(EmailVerificationTokenEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        EmailVerificationService.IssuedVerification issued = service.issue(account, now);

        ArgumentCaptor<EmailVerificationTokenEntity> tokenCaptor = ArgumentCaptor.forClass(EmailVerificationTokenEntity.class);
        verify(tokenRepository).deleteExpiredTokens(now);
        verify(tokenRepository).deleteUnusedByAccountId("user_1");
        verify(tokenRepository).save(tokenCaptor.capture());
        assertThat(tokenCaptor.getValue().getTokenHash()).isEqualTo(tokenService.hashToken(issued.rawToken()));
        assertThat(tokenCaptor.getValue().getTokenHash()).doesNotContain(issued.rawToken());
        assertThat(issued.expiresAt()).isEqualTo(Instant.parse("2026-08-25T14:30:00Z"));
        verify(emailSender).sendVerificationEmail(
            eq("rider@example.com"),
            eq("https://linewatch.example/verify-email#token=" + issued.rawToken()),
            eq(issued.expiresAt())
        );
    }

    @Test
    void confirmMarksTheAccountVerifiedAndConsumesTheToken() {
        AccountEntity account = unverifiedAccount();
        EmailVerificationTokenEntity verificationToken = EmailVerificationTokenEntity.create(
            "verify_1",
            account,
            tokenService.hashToken("raw-token"),
            now.minusSeconds(60),
            now.plusSeconds(60)
        );
        when(tokenRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(verificationToken));

        assertThat(service.confirm(" raw-token ", now)).isSameAs(account);

        assertThat(account.isEmailVerified()).isTrue();
        assertThat(account.getEmailVerifiedAt()).isEqualTo(now);
        assertThat(verificationToken.getUsedAt()).isEqualTo(now);
        verify(tokenRepository).deleteUnusedByAccountId("user_1");
    }

    @Test
    void confirmRejectsExpiredTokens() {
        EmailVerificationTokenEntity expired = EmailVerificationTokenEntity.create(
            "verify_1",
            unverifiedAccount(),
            tokenService.hashToken("raw-token"),
            now.minusSeconds(120),
            now.minusSeconds(1)
        );
        when(tokenRepository.findByTokenHash(tokenService.hashToken("raw-token")))
            .thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.confirm("raw-token", now))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("expired or invalid");
    }

    @Test
    void issueFailsClosedWhenNeitherEmailDeliveryNorLocalDevLinksAreAvailable() {
        EmailVerificationService productionService = new EmailVerificationService(
            tokenRepository,
            tokenService,
            emailSender,
            linkFactory,
            false
        );
        when(emailSender.sendVerificationEmail(any(), any(), any())).thenReturn(false);

        assertThatThrownBy(() -> productionService.issue(unverifiedAccount(), now))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("temporarily unavailable");
    }

    private AccountEntity unverifiedAccount() {
        return AccountEntity.createUnverified(
            "user_1",
            "rider@example.com",
            "Rider",
            "$2a$hash",
            now.minusSeconds(300)
        );
    }
}
