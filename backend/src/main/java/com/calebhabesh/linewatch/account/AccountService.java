package com.calebhabesh.linewatch.account;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    public static final String DEMO_EMAIL = "demo@linewatch.local";
    private static final Duration SESSION_TTL = Duration.ofDays(14);
    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int MAX_EMAIL_LENGTH = 320;
    private static final int MAX_PASSWORD_LENGTH = 256;
    private static final int MAX_DISPLAY_NAME_LENGTH = 120;
    private static final int MAX_RESET_TOKEN_LENGTH = 256;
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
        Pattern.CASE_INSENSITIVE
    );

    private static final Duration PASSWORD_RESET_TTL = Duration.ofMinutes(30);
    private static final String PASSWORD_RESET_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

    private final AccountRepository accountRepository;
    private final UserSessionRepository sessionRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordHasher passwordHasher;
    private final SessionTokenService tokenService;
    private final PasswordResetEmailSender passwordResetEmailSender;
    private final PasswordResetLinkFactory passwordResetLinkFactory;
    private final AccountAuthIdentityRepository authIdentityRepository;
    private final GoogleIdentityVerifier googleIdentityVerifier;
    private final GoogleAuthProperties googleAuthProperties;
    private final Clock clock;
    private final boolean passwordResetDevLinks;

    @Autowired
    public AccountService(
        AccountRepository accountRepository,
        UserSessionRepository sessionRepository,
        PasswordResetTokenRepository passwordResetTokenRepository,
        PasswordHasher passwordHasher,
        SessionTokenService tokenService,
        PasswordResetEmailSender passwordResetEmailSender,
        PasswordResetLinkFactory passwordResetLinkFactory,
        AccountAuthIdentityRepository authIdentityRepository,
        GoogleIdentityVerifier googleIdentityVerifier,
        GoogleAuthProperties googleAuthProperties,
        @org.springframework.beans.factory.annotation.Value("${linewatch.auth.password-reset.dev-links:false}") boolean passwordResetDevLinks
    ) {
        this(
            accountRepository,
            sessionRepository,
            passwordResetTokenRepository,
            passwordHasher,
            tokenService,
            passwordResetEmailSender,
            passwordResetLinkFactory,
            authIdentityRepository,
            googleIdentityVerifier,
            googleAuthProperties,
            Clock.systemUTC(),
            passwordResetDevLinks
        );
    }

    AccountService(
        AccountRepository accountRepository,
        UserSessionRepository sessionRepository,
        PasswordResetTokenRepository passwordResetTokenRepository,
        PasswordHasher passwordHasher,
        SessionTokenService tokenService,
        PasswordResetEmailSender passwordResetEmailSender,
        PasswordResetLinkFactory passwordResetLinkFactory,
        AccountAuthIdentityRepository authIdentityRepository,
        GoogleIdentityVerifier googleIdentityVerifier,
        GoogleAuthProperties googleAuthProperties,
        Clock clock,
        boolean passwordResetDevLinks
    ) {
        this.accountRepository = accountRepository;
        this.sessionRepository = sessionRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
        this.passwordResetEmailSender = passwordResetEmailSender;
        this.passwordResetLinkFactory = passwordResetLinkFactory;
        this.authIdentityRepository = authIdentityRepository;
        this.googleIdentityVerifier = googleIdentityVerifier;
        this.googleAuthProperties = googleAuthProperties;
        this.clock = clock;
        this.passwordResetDevLinks = passwordResetDevLinks;
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
        if (account.getPasswordHash() == null || !passwordHasher.matches(request.password(), account.getPasswordHash())) {
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

    @Transactional
    public AccountResponses.AuthSession googleLogin(GoogleLoginRequest request) {
        VerifiedGoogleIdentity googleIdentity = googleIdentityVerifier.verify(request.credential());
        String email = normalizeEmail(googleIdentity.email());
        Instant now = clock.instant();

        return authIdentityRepository.findByProviderAndProviderSubject(
                AccountAuthIdentityEntity.PROVIDER_GOOGLE,
                googleIdentity.subject()
            )
            .map(identity -> {
                identity.updateGoogleProfile(email, googleIdentity.emailVerified(), now);
                AccountEntity account = identity.getAccount();
                account.markLogin(now);
                return createSession(account, now);
            })
            .orElseGet(() -> createGoogleAccountSession(googleIdentity, email, now));
    }

    private AccountResponses.AuthSession createGoogleAccountSession(VerifiedGoogleIdentity googleIdentity, String email, Instant now) {
        accountRepository.findByEmail(email).ifPresent(account -> {
            throw new AccountException(
                HttpStatus.CONFLICT,
                "google_account_link_required",
                "An account already exists for that email. Sign in with email and password before linking Google."
            );
        });

        AccountEntity account = AccountEntity.createPasswordless(
            nextId("user"),
            email,
            normalizeDisplayName(googleIdentity.displayName(), email),
            false,
            now
        );
        account.markLogin(now);
        AccountEntity saved = accountRepository.save(account);
        authIdentityRepository.save(AccountAuthIdentityEntity.createGoogle(
            nextId("identity"),
            saved,
            googleIdentity.subject(),
            email,
            googleIdentity.emailVerified(),
            now
        ));
        return createSession(saved, now);
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
        return toUserResponse(
            account,
            authIdentityRepository.existsByAccount_IdAndProvider(
                account.getId(),
                AccountAuthIdentityEntity.PROVIDER_GOOGLE
            )
        );
    }

    private AccountResponses.UserResponse toUserResponse(AccountEntity account, boolean googleLinked) {
        return new AccountResponses.UserResponse(
            account.getId(),
            account.getEmail(),
            account.getDisplayName(),
            account.isDemo(),
            googleLinked
        );
    }

    private String normalizeEmail(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > MAX_EMAIL_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Email must be 320 characters or less.");
        }
        if (normalized.isBlank() || !EMAIL_PATTERN.matcher(normalized).matches()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Enter a valid email address.");
        }
        return normalized;
    }

    private String normalizeDisplayName(String displayName, String email) {
        String normalized = displayName == null ? "" : displayName.trim();
        if (normalized.length() > MAX_DISPLAY_NAME_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_display_name", "Display name must be 120 characters or less.");
        }
        if (!normalized.isBlank()) {
            return normalized;
        }
        return email.substring(0, email.indexOf('@'));
    }

    private void validatePassword(String password) {
        String candidate = password == null ? "" : password.trim();
        if (candidate.length() > MAX_PASSWORD_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must be 256 characters or less.");
        }
        if (candidate.length() < MIN_PASSWORD_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must be at least 8 characters.");
        }
        boolean hasLetter = candidate.chars().anyMatch(Character::isLetter);
        if (!hasLetter) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must include at least one letter.");
        }
        boolean hasNumberSymbolOrSpace = candidate.chars().anyMatch(value ->
            Character.isDigit(value) || !Character.isLetterOrDigit(value)
        );
        if (!hasNumberSymbolOrSpace) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must include a number, symbol, or space.");
        }
    }

    private AccountException invalidCredentials() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Incorrect Email or Password.");
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    @Transactional
    public PasswordResetRequestResponse requestPasswordReset(PasswordResetRequest request) {
        String email = normalizeEmail(request.email());
        Instant now = clock.instant();
        passwordResetTokenRepository.deleteExpiredTokens(now);

        return accountRepository.findByEmail(email)
            .map(account -> {
                passwordResetTokenRepository.deleteUnusedByAccountId(account.getId());
                SessionTokenService.GeneratedSessionToken token = tokenService.generateToken();
                Instant expiresAt = now.plus(PASSWORD_RESET_TTL);
                String resetUrl = passwordResetLinkFactory.resetUrl(token.rawToken());
                passwordResetTokenRepository.save(PasswordResetTokenEntity.create(
                    nextId("reset"),
                    account,
                    token.tokenHash(),
                    now,
                    expiresAt
                ));
                passwordResetEmailSender.sendPasswordResetEmail(account.getEmail(), resetUrl, expiresAt);
                return new PasswordResetRequestResponse(
                    true,
                    PASSWORD_RESET_MESSAGE,
                    passwordResetDevLinks ? token.rawToken() : null,
                    expiresAt
                );
            })
            .orElseGet(() -> new PasswordResetRequestResponse(true, PASSWORD_RESET_MESSAGE, null, null));
    }

    @Transactional
    public AccountResponses.AuthSession confirmPasswordReset(PasswordResetConfirmRequest request) {
        String rawToken = request.token() == null ? "" : request.token().trim();
        if (rawToken.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_reset_token", "Reset link expired or invalid.");
        }
        if (rawToken.length() > MAX_RESET_TOKEN_LENGTH) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_reset_token", "Reset link expired or invalid.");
        }
        validatePassword(request.password());

        Instant now = clock.instant();
        String tokenHash = tokenService.hashToken(rawToken);
        PasswordResetTokenEntity resetToken = passwordResetTokenRepository.findByTokenHash(tokenHash)
            .filter(token -> token.isUsableAt(now))
            .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, "invalid_reset_token", "Reset link expired or invalid."));

        AccountEntity account = resetToken.getAccount();
        account.replacePasswordHash(passwordHasher.hash(request.password()));
        resetToken.markUsed(now);
        sessionRepository.deleteByAccountId(account.getId());
        account.markLogin(now);
        return createSession(account, now);
    }

    public record RegisterRequest(String email, String password, String displayName) {}
    public record LoginRequest(String email, String password) {}
    public record GoogleLoginRequest(String credential) {}
    public record PasswordResetRequest(String email) {}
    public record PasswordResetConfirmRequest(String token, String password) {}
    public record PasswordResetRequestResponse(
        boolean accepted,
        String message,
        String devResetToken,
        Instant expiresAt
    ) {}
}
