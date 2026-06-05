package com.calebhabesh.linewatch.account;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    public static final String DEMO_EMAIL = "demo@linewatch.local";
    private static final Duration SESSION_TTL = Duration.ofDays(14);
    private static final int MIN_PASSWORD_LENGTH = 10;

    private final AccountRepository accountRepository;
    private final UserSessionRepository sessionRepository;
    private final PasswordHasher passwordHasher;
    private final SessionTokenService tokenService;
    private final Clock clock;

    public AccountService(
        AccountRepository accountRepository,
        UserSessionRepository sessionRepository,
        PasswordHasher passwordHasher,
        SessionTokenService tokenService
    ) {
        this(accountRepository, sessionRepository, passwordHasher, tokenService, Clock.systemUTC());
    }

    AccountService(
        AccountRepository accountRepository,
        UserSessionRepository sessionRepository,
        PasswordHasher passwordHasher,
        SessionTokenService tokenService,
        Clock clock
    ) {
        this.accountRepository = accountRepository;
        this.sessionRepository = sessionRepository;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
        this.clock = clock;
    }

    @Transactional
    public AccountResponses.AuthSession register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        validatePassword(request.password());
        if (accountRepository.existsByEmail(email)) {
            throw new AccountException(HttpStatus.CONFLICT, "email_exists", "An account with that email already exists.");
        }

        Instant now = clock.instant();
        AccountEntity account = AccountEntity.create(
            nextId("user"),
            email,
            normalizeDisplayName(request.displayName(), email),
            passwordHasher.hash(request.password()),
            false,
            now
        );
        account.markLogin(now);
        AccountEntity saved = accountRepository.save(account);
        return createSession(saved, now);
    }

    @Transactional
    public AccountResponses.AuthSession login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        AccountEntity account = accountRepository.findByEmail(email)
            .orElseThrow(this::invalidCredentials);
        if (!passwordHasher.matches(request.password(), account.getPasswordHash())) {
            throw invalidCredentials();
        }

        Instant now = clock.instant();
        account.markLogin(now);
        return createSession(account, now);
    }

    @Transactional
    public AccountResponses.AuthSession demoLogin() {
        Instant now = clock.instant();
        AccountEntity account = accountRepository.findByEmail(DEMO_EMAIL)
            .orElseGet(() -> accountRepository.save(AccountEntity.create(
                "user_demo",
                DEMO_EMAIL,
                "Demo Rider",
                passwordHasher.hash(nextId("demo-password")),
                true,
                now
            )));
        account.markLogin(now);
        return createSession(account, now);
    }

    @Transactional(readOnly = true)
    public AccountResponses.AuthResponse currentUser(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            return new AccountResponses.AuthResponse(false, null);
        }
        String tokenHash = tokenService.hashToken(rawSessionToken);
        return sessionRepository.findByTokenHash(tokenHash)
            .filter(session -> session.getExpiresAt().isAfter(clock.instant()))
            .map(session -> new AccountResponses.AuthResponse(true, toUserResponse(session.getAccount())))
            .orElse(new AccountResponses.AuthResponse(false, null));
    }

    @Transactional
    public void logout(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            return;
        }
        sessionRepository.deleteByTokenHash(tokenService.hashToken(rawSessionToken));
    }

    @Transactional(readOnly = true)
    public AccountEntity requireAccount(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            throw new AccountException(HttpStatus.UNAUTHORIZED, "not_authenticated", "Sign in to use saved commute preferences.");
        }
        String tokenHash = tokenService.hashToken(rawSessionToken);
        UserSessionEntity session = sessionRepository.findByTokenHash(tokenHash)
            .filter(candidate -> candidate.getExpiresAt().isAfter(clock.instant()))
            .orElseThrow(() -> new AccountException(HttpStatus.UNAUTHORIZED, "not_authenticated", "Sign in to use saved commute preferences."));
        return session.getAccount();
    }

    public Duration sessionTtl() {
        return SESSION_TTL;
    }

    private AccountResponses.AuthSession createSession(AccountEntity account, Instant now) {
        SessionTokenService.GeneratedSessionToken token = tokenService.generateToken();
        Instant expiresAt = now.plus(SESSION_TTL);
        sessionRepository.save(UserSessionEntity.create(
            nextId("session"),
            account,
            token.tokenHash(),
            now,
            expiresAt
        ));
        return new AccountResponses.AuthSession(toUserResponse(account), token.rawToken(), expiresAt);
    }

    private AccountResponses.UserResponse toUserResponse(AccountEntity account) {
        return new AccountResponses.UserResponse(
            account.getId(),
            account.getEmail(),
            account.getDisplayName(),
            account.isDemo()
        );
    }

    private String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || !normalized.contains("@")) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Enter a valid email address.");
        }
        return normalized;
    }

    private String normalizeDisplayName(String displayName, String email) {
        String normalized = displayName == null ? "" : displayName.trim();
        if (!normalized.isBlank()) {
            return normalized;
        }
        return email.substring(0, email.indexOf('@'));
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must be at least 10 characters.");
        }
    }

    private AccountException invalidCredentials() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Email or password is incorrect.");
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    public record RegisterRequest(String email, String password, String displayName) {}
    public record LoginRequest(String email, String password) {}
}
