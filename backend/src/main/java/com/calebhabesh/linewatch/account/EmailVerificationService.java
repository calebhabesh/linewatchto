package com.calebhabesh.linewatch.account;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class EmailVerificationService {
    static final Duration TOKEN_TTL = Duration.ofHours(24);
    private static final int MAX_TOKEN_LENGTH = 256;

    private final EmailVerificationTokenRepository tokenRepository;
    private final SessionTokenService tokenService;
    private final EmailVerificationEmailSender emailSender;
    private final EmailVerificationLinkFactory linkFactory;
    private final boolean devLinks;

    @Autowired
    public EmailVerificationService(
        EmailVerificationTokenRepository tokenRepository,
        SessionTokenService tokenService,
        EmailVerificationEmailSender emailSender,
        EmailVerificationLinkFactory linkFactory,
        @Value("${linewatch.auth.email-verification.dev-links:false}") boolean devLinks
    ) {
        this.tokenRepository = tokenRepository;
        this.tokenService = tokenService;
        this.emailSender = emailSender;
        this.linkFactory = linkFactory;
        this.devLinks = devLinks;
    }

    EmailVerificationService(
        EmailVerificationTokenRepository tokenRepository,
        SessionTokenService tokenService,
        EmailVerificationEmailSender emailSender,
        EmailVerificationLinkFactory linkFactory
    ) {
        this(tokenRepository, tokenService, emailSender, linkFactory, true);
    }

    public IssuedVerification issue(AccountEntity account, Instant now) {
        tokenRepository.deleteExpiredTokens(now);
        tokenRepository.deleteUnusedByAccountId(account.getId());

        SessionTokenService.GeneratedSessionToken token = tokenService.generateToken();
        Instant expiresAt = now.plus(TOKEN_TTL);
        tokenRepository.save(EmailVerificationTokenEntity.create(
            nextId(),
            account,
            token.tokenHash(),
            now,
            expiresAt
        ));
        boolean delivered = emailSender.sendVerificationEmail(
            account.getEmail(),
            linkFactory.verificationUrl(token.rawToken()),
            expiresAt
        );
        if (!delivered && !devLinks) {
            throw new AccountException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "email_verification_unavailable",
                "Email verification is temporarily unavailable. Try again later."
            );
        }
        return new IssuedVerification(token.rawToken(), expiresAt);
    }

    public AccountEntity confirm(String rawToken, Instant now) {
        String token = rawToken == null ? "" : rawToken.trim();
        if (token.isBlank() || token.length() > MAX_TOKEN_LENGTH) {
            throw invalidToken();
        }

        EmailVerificationTokenEntity verificationToken = tokenRepository
            .findByTokenHash(tokenService.hashToken(token))
            .filter(candidate -> candidate.isUsableAt(now))
            .orElseThrow(this::invalidToken);
        AccountEntity account = verificationToken.getAccount();
        account.markEmailVerified(now);
        verificationToken.markUsed(now);
        tokenRepository.deleteUnusedByAccountId(account.getId());
        return account;
    }

    public void discardPendingTokens(String accountId) {
        tokenRepository.deleteUnusedByAccountId(accountId);
    }

    private AccountException invalidToken() {
        return new AccountException(
            HttpStatus.BAD_REQUEST,
            "invalid_verification_token",
            "Verification link expired or invalid. Request a new link and try again."
        );
    }

    private String nextId() {
        return "verify_" + UUID.randomUUID().toString().replace("-", "");
    }

    public record IssuedVerification(String rawToken, Instant expiresAt) {}
}
