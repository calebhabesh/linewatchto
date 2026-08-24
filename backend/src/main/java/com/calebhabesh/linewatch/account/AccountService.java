package com.calebhabesh.linewatch.account;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    private static final Logger log = LoggerFactory.getLogger(AccountService.class);
    public static final String DEMO_EMAIL = "demo@linewatch.local";
    public static final String DEV_EMAIL = "dev@linewatch.local";
    private static final Duration MAX_SESSION_RENEWAL_INTERVAL = Duration.ofDays(1);
    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int MAX_EMAIL_LENGTH = 320;
    private static final int MAX_PASSWORD_BYTES = 72;
    private static final int MAX_DISPLAY_NAME_LENGTH = 120;
    private static final int MAX_RESET_TOKEN_LENGTH = 256;
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
        Pattern.CASE_INSENSITIVE
    );

    private static final Duration PASSWORD_RESET_TTL = Duration.ofMinutes(30);
    private static final String PASSWORD_RESET_MESSAGE = "If an account exists for that email, a password reset link has been sent.";
    private static final String EMAIL_VERIFICATION_MESSAGE = "If an unverified account exists for that email, a verification link has been sent.";
    private static final String REGISTRATION_VERIFICATION_MESSAGE = "Check your email to verify your LineWatchTO account before signing in.";

    private final AccountRepository accountRepository;
    private final UserSessionRepository sessionRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordHasher passwordHasher;
    private final SessionTokenService tokenService;
    private final PasswordResetEmailSender passwordResetEmailSender;
    private final PasswordResetLinkFactory passwordResetLinkFactory;
    private final EmailVerificationService emailVerificationService;
    private final AccountAuthIdentityRepository authIdentityRepository;
    private final SavedCommuteRepository savedCommuteRepository;
    private final GoogleIdentityVerifier googleIdentityVerifier;
    private final GoogleAuthProperties googleAuthProperties;
    private final AccountSessionRequestContext sessionRequestContext;
    private final Clock clock;
    private final boolean passwordResetDevLinks;
    private final boolean emailVerificationDevLinks;
    private final Duration sessionTtl;

    @Autowired
    public AccountService(
        AccountRepository accountRepository,
        UserSessionRepository sessionRepository,
        PasswordResetTokenRepository passwordResetTokenRepository,
        PasswordHasher passwordHasher,
        SessionTokenService tokenService,
        PasswordResetEmailSender passwordResetEmailSender,
        PasswordResetLinkFactory passwordResetLinkFactory,
        EmailVerificationService emailVerificationService,
        AccountAuthIdentityRepository authIdentityRepository,
        SavedCommuteRepository savedCommuteRepository,
        GoogleIdentityVerifier googleIdentityVerifier,
        GoogleAuthProperties googleAuthProperties,
        AccountSessionRequestContext sessionRequestContext,
        @org.springframework.beans.factory.annotation.Value("${linewatch.auth.password-reset.dev-links:false}") boolean passwordResetDevLinks,
        @org.springframework.beans.factory.annotation.Value("${linewatch.auth.email-verification.dev-links:false}") boolean emailVerificationDevLinks,
        @org.springframework.beans.factory.annotation.Value("${linewatch.auth.session-ttl:P365D}") Duration sessionTtl
    ) {
        this(
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
            Clock.systemUTC(),
            passwordResetDevLinks,
            emailVerificationDevLinks,
            sessionTtl
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
        EmailVerificationService emailVerificationService,
        AccountAuthIdentityRepository authIdentityRepository,
        SavedCommuteRepository savedCommuteRepository,
        GoogleIdentityVerifier googleIdentityVerifier,
        GoogleAuthProperties googleAuthProperties,
        AccountSessionRequestContext sessionRequestContext,
        Clock clock,
        boolean passwordResetDevLinks,
        boolean emailVerificationDevLinks,
        Duration sessionTtl
    ) {
        this.accountRepository = accountRepository;
        this.sessionRepository = sessionRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
        this.passwordResetEmailSender = passwordResetEmailSender;
        this.passwordResetLinkFactory = passwordResetLinkFactory;
        this.emailVerificationService = emailVerificationService;
        this.authIdentityRepository = authIdentityRepository;
        this.savedCommuteRepository = savedCommuteRepository;
        this.googleIdentityVerifier = googleIdentityVerifier;
        this.googleAuthProperties = googleAuthProperties;
        this.sessionRequestContext = sessionRequestContext;
        this.clock = clock;
        this.passwordResetDevLinks = passwordResetDevLinks;
        this.emailVerificationDevLinks = emailVerificationDevLinks;
        if (sessionTtl == null || sessionTtl.isZero() || sessionTtl.isNegative()) {
            throw new IllegalArgumentException("Session TTL must be positive.");
        }
        this.sessionTtl = sessionTtl;
    }

    @Transactional
    public EmailVerificationRequestResponse register(RegisterRequest request) {
        if (request == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Enter a valid email address.");
        }
        String email = normalizeEmail(request.email());
        Instant now = clock.instant();
        String displayName = normalizeDisplayName(request.displayName(), email);
        AccountEntity saved = accountRepository.findByEmail(email)
            .map(existing -> reusePendingEmailAccount(existing, displayName))
            .orElseGet(() -> accountRepository.save(AccountEntity.createPendingEmailAccount(
                nextId("user"),
                email,
                displayName,
                now
            )));
        EmailVerificationService.IssuedVerification issued = emailVerificationService.issue(saved, now);
        return new EmailVerificationRequestResponse(
            true,
            REGISTRATION_VERIFICATION_MESSAGE,
            emailVerificationDevLinks ? issued.rawToken() : null,
            issued.expiresAt()
        );
    }

    private AccountEntity reusePendingEmailAccount(AccountEntity account, String displayName) {
        if (account.isEmailVerified()) {
            throw new AccountException(HttpStatus.CONFLICT, "email_exists", "An account with that email already exists.");
        }
        account.updatePendingDisplayName(displayName);
        return accountRepository.save(account);
    }

    @Transactional
    public AccountResponses.AuthSession login(LoginRequest request) {
        if (request == null) {
            throw invalidCredentials();
        }
        String email = normalizeEmail(request.email());
        AccountEntity account = accountRepository.findByEmail(email)
            .orElseThrow(this::invalidCredentials);
        if (
            account.getPasswordHash() == null ||
                request.password() == null ||
                passwordByteLength(request.password()) > MAX_PASSWORD_BYTES ||
                !passwordHasher.matches(request.password(), account.getPasswordHash())
        ) {
            throw invalidCredentials();
        }
        if (!account.isEmailVerified()) {
            throw new AccountException(
                HttpStatus.FORBIDDEN,
                "email_not_verified",
                "Verify your email before signing in. You can request a new verification link."
            );
        }

        Instant now = clock.instant();
        account.markLogin(now);
        return createSession(account, now);
    }

    @Transactional
    public AccountResponses.AuthSession demoLogin() {
        Instant now = clock.instant();
        String accountId = nextId("user_demo");
        AccountEntity account = accountRepository.save(AccountEntity.create(
            accountId,
            accountId + "@demo.linewatch.local",
            "Demo Rider",
            passwordHasher.hash(nextId("demo-password")),
            true,
            now
        ));
        account.markLogin(now);
        return createSession(account, now);
    }

    @Transactional
    public AccountResponses.AuthSession devLogin() {
        Instant now = clock.instant();
        AccountEntity account = accountRepository.findByEmail(DEV_EMAIL)
            .orElseGet(() -> accountRepository.save(AccountEntity.create(
                "user_dev",
                DEV_EMAIL,
                "Dev Rider",
                passwordHasher.hash(nextId("dev-password")),
                false,
                now
            )));
        seedDevCommutes(account, now);
        account.markLogin(now);
        return createSession(account, now);
    }

    private void seedDevCommutes(AccountEntity account, Instant now) {
        List<DevCommuteSeed> seeds = List.of(
            new DevCommuteSeed("dev_commute_finch_union", "Line 1: Finch to Union", "finch", "union", true),
            new DevCommuteSeed("dev_commute_mount_dennis_kennedy", "Line 5/2: Mount Dennis to Kennedy", "mount-dennis", "kennedy", true)
        );

        for (DevCommuteSeed seed : seeds) {
            if (!savedCommuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId(
                account.getId(),
                seed.originStationId(),
                seed.destinationStationId()
            )) {
                savedCommuteRepository.save(SavedCommuteEntity.create(
                    seed.id(),
                    account,
                    seed.label(),
                    seed.originStationId(),
                    seed.destinationStationId(),
                    seed.watchReturnTrip(),
                    now
                ));
            }
        }
    }

    @Transactional
    public AccountResponses.AuthSession googleLogin(GoogleLoginRequest request) {
        VerifiedGoogleIdentity googleIdentity = googleIdentityVerifier.verify(request == null ? null : request.credential());
        return googleLogin(googleIdentity);
    }

    @Transactional
    public AccountResponses.AuthSession googleLogin(VerifiedGoogleIdentity googleIdentity) {
        requireVerifiedGoogleEmail(googleIdentity);
        String email = normalizeEmail(googleIdentity.email());
        Instant now = clock.instant();

        return authIdentityRepository.findByProviderAndProviderSubject(
                AccountAuthIdentityEntity.PROVIDER_GOOGLE,
                googleIdentity.subject()
            )
            .map(identity -> {
                identity.updateGoogleProfile(email, googleIdentity.emailVerified(), now);
                AccountEntity account = identity.getAccount();
                if (email.equals(account.getEmail()) && googleIdentity.emailVerified()) {
                    account.markEmailVerified(now);
                }
                account.markLogin(now);
                return createSession(account, now, true);
            })
            .orElseGet(() -> createGoogleAccountSession(googleIdentity, email, now));
    }

    @Transactional
    public AccountResponses.AuthResponse linkGoogle(String rawSessionToken, GoogleLoginRequest request) {
        VerifiedGoogleIdentity googleIdentity = googleIdentityVerifier.verify(request == null ? null : request.credential());
        return linkGoogle(rawSessionToken, googleIdentity);
    }

    @Transactional
    public AccountResponses.AuthResponse linkGoogle(String rawSessionToken, VerifiedGoogleIdentity googleIdentity) {
        requireVerifiedGoogleEmail(googleIdentity);
        AccountEntity account = requireAccount(rawSessionToken);
        if (account.isDemo()) {
            throw new AccountException(HttpStatus.CONFLICT, "google_link_demo_account", "Demo accounts cannot link Google sign-in.");
        }

        String email = normalizeEmail(googleIdentity.email());
        if (!email.equals(account.getEmail())) {
            throw new AccountException(
                HttpStatus.CONFLICT,
                "google_email_mismatch",
                "Google account email must match the signed-in LineWatch account email."
            );
        }

        Instant now = clock.instant();
        return authIdentityRepository.findByProviderAndProviderSubject(
                AccountAuthIdentityEntity.PROVIDER_GOOGLE,
                googleIdentity.subject()
            )
            .map(identity -> updateExistingGoogleLink(account, identity, email, googleIdentity.emailVerified(), now))
            .orElseGet(() -> createGoogleLink(account, googleIdentity, email, now));
    }

    private AccountResponses.AuthSession createGoogleAccountSession(VerifiedGoogleIdentity googleIdentity, String email, Instant now) {
        AccountEntity account = accountRepository.findByEmail(email)
            .map(existing -> claimPendingEmailAccountWithGoogle(existing, googleIdentity, now))
            .orElseGet(() -> AccountEntity.createPasswordless(
                nextId("user"),
                email,
                normalizeDisplayName(googleIdentity.displayName(), email),
                false,
                now
            ));
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
        return createSession(saved, now, true);
    }

    private AccountEntity claimPendingEmailAccountWithGoogle(
        AccountEntity account,
        VerifiedGoogleIdentity googleIdentity,
        Instant now
    ) {
        if (account.isEmailVerified()) {
            throw new AccountException(
                HttpStatus.CONFLICT,
                "google_account_link_required",
                "An account already exists for that email. Sign in with email and password before linking Google."
            );
        }
        account.updatePendingDisplayName(normalizeDisplayName(googleIdentity.displayName(), account.getEmail()));
        account.clearPasswordHash();
        account.markEmailVerified(now);
        emailVerificationService.discardPendingTokens(account.getId());
        return account;
    }

    private AccountResponses.AuthResponse updateExistingGoogleLink(
        AccountEntity account,
        AccountAuthIdentityEntity identity,
        String email,
        boolean emailVerified,
        Instant now
    ) {
        if (!identity.getAccount().getId().equals(account.getId())) {
            throw new AccountException(
                HttpStatus.CONFLICT,
                "google_identity_in_use",
                "That Google account is already linked to another LineWatch account."
            );
        }
        identity.updateGoogleProfile(email, emailVerified, now);
        account.markLogin(now);
        return new AccountResponses.AuthResponse(true, toUserResponse(account, true));
    }

    private AccountResponses.AuthResponse createGoogleLink(
        AccountEntity account,
        VerifiedGoogleIdentity googleIdentity,
        String email,
        Instant now
    ) {
        authIdentityRepository.findByAccount_IdAndProvider(account.getId(), AccountAuthIdentityEntity.PROVIDER_GOOGLE)
            .ifPresent(existing -> {
                throw new AccountException(
                    HttpStatus.CONFLICT,
                    "google_already_linked",
                    "This LineWatch account is already linked to a different Google account."
                );
            });

        authIdentityRepository.save(AccountAuthIdentityEntity.createGoogle(
            nextId("identity"),
            account,
            googleIdentity.subject(),
            email,
            googleIdentity.emailVerified(),
            now
        ));
        account.markLogin(now);
        return new AccountResponses.AuthResponse(true, toUserResponse(account, true));
    }

    @Transactional
    public AccountResponses.AuthResponse currentUser(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            log.debug("Account authentication outcome=missing_cookie operation=current_user");
            return new AccountResponses.AuthResponse(false, null);
        }
        String tokenHash = tokenService.hashToken(rawSessionToken);
        UserSessionEntity session = sessionRepository.findByTokenHash(tokenHash).orElse(null);
        if (session == null) {
            log.info("Account authentication outcome=session_not_found operation=current_user");
            return new AccountResponses.AuthResponse(false, null);
        }
        if (!session.getExpiresAt().isAfter(clock.instant())) {
            log.info("Account authentication outcome=expired_session operation=current_user");
            return new AccountResponses.AuthResponse(false, null);
        }
        if (!session.getAccount().isEmailVerified()) {
            log.info("Account authentication outcome=email_not_verified operation=current_user");
            return new AccountResponses.AuthResponse(false, null);
        }
        boolean renewed = extendSessionIfNecessary(session);
        sessionRequestContext.markValidated(renewed);
        log.debug("Account authentication outcome=authenticated operation=current_user renewed={}", renewed);
        return new AccountResponses.AuthResponse(true, toUserResponse(session.getAccount()));
    }

    @Transactional
    public void logout(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            return;
        }
        String tokenHash = tokenService.hashToken(rawSessionToken);
        sessionRepository.findByTokenHash(tokenHash).ifPresentOrElse(session -> {
            if (session.getAccount().isDemo()) {
                accountRepository.delete(session.getAccount());
            } else {
                sessionRepository.deleteByTokenHash(tokenHash);
            }
        }, () -> sessionRepository.deleteByTokenHash(tokenHash));
    }

    @Transactional
    public AccountEntity requireAccount(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            log.debug("Account authentication outcome=missing_cookie operation=protected_account");
            throw new AccountException(HttpStatus.UNAUTHORIZED, "not_authenticated", "Sign in to use account features.");
        }
        String tokenHash = tokenService.hashToken(rawSessionToken);
        UserSessionEntity session = sessionRepository.findByTokenHash(tokenHash).orElse(null);
        if (session == null) {
            log.info("Account authentication outcome=session_not_found operation=protected_account");
            throw notAuthenticated();
        }
        if (!session.getExpiresAt().isAfter(clock.instant())) {
            log.info("Account authentication outcome=expired_session operation=protected_account");
            throw notAuthenticated();
        }
        if (!session.getAccount().isEmailVerified()) {
            throw notAuthenticated();
        }
        sessionRequestContext.markValidated(extendSessionIfNecessary(session));
        return session.getAccount();
    }

    @Transactional
    public boolean renewSessionBeforeProtectedRequest(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            return false;
        }
        return sessionRepository.findByTokenHash(tokenService.hashToken(rawSessionToken))
            .filter(session -> session.getExpiresAt().isAfter(clock.instant()))
            .filter(session -> session.getAccount().isEmailVerified())
            .map(this::extendSessionIfNecessary)
            .orElse(false);
    }

    public Duration sessionTtl() {
        return sessionTtl;
    }

    private boolean extendSessionIfNecessary(UserSessionEntity session) {
        Instant now = clock.instant();
        Duration renewalInterval = sessionTtl.compareTo(MAX_SESSION_RENEWAL_INTERVAL) > 0
            ? MAX_SESSION_RENEWAL_INTERVAL
            : sessionTtl.dividedBy(2);
        if (renewalInterval.isZero()) {
            renewalInterval = sessionTtl;
        }
        Instant renewalThreshold = now.plus(sessionTtl.minus(renewalInterval));
        if (session.getExpiresAt().isBefore(renewalThreshold)) {
            session.setExpiresAt(now.plus(sessionTtl));
            sessionRepository.save(session);
            return true;
        }
        return false;
    }

    private AccountException notAuthenticated() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "not_authenticated", "Sign in to use account features.");
    }

    private AccountResponses.AuthSession createSession(AccountEntity account, Instant now) {
        return createSession(account, now, toUserResponse(account));
    }

    private AccountResponses.AuthSession createSession(AccountEntity account, Instant now, boolean googleLinked) {
        return createSession(account, now, toUserResponse(account, googleLinked));
    }

    private AccountResponses.AuthSession createSession(AccountEntity account, Instant now, AccountResponses.UserResponse user) {
        SessionTokenService.GeneratedSessionToken token = tokenService.generateToken();
        Instant expiresAt = now.plus(sessionTtl);
        sessionRepository.save(UserSessionEntity.create(
            nextId("session"),
            account,
            token.tokenHash(),
            now,
            expiresAt
        ));
        return new AccountResponses.AuthSession(user, token.rawToken(), expiresAt);
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
            account.isDemo() ? DEMO_EMAIL : account.getEmail(),
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
        if (passwordByteLength(password) > MAX_PASSWORD_BYTES) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "weak_password", "Password must be 72 UTF-8 bytes or less.");
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

    private int passwordByteLength(String password) {
        return password == null ? 0 : password.getBytes(StandardCharsets.UTF_8).length;
    }

    private void requireVerifiedGoogleEmail(VerifiedGoogleIdentity googleIdentity) {
        if (googleIdentity == null || !googleIdentity.emailVerified()) {
            throw new AccountException(
                HttpStatus.UNAUTHORIZED,
                "invalid_google_credential",
                "Could not verify Google sign-in."
            );
        }
    }

    private AccountException invalidCredentials() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "Incorrect Email or Password.");
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    @Transactional
    public EmailVerificationRequestResponse requestEmailVerification(EmailVerificationRequest request) {
        if (request == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Enter a valid email address.");
        }
        String email = normalizeEmail(request.email());
        Instant now = clock.instant();

        return accountRepository.findByEmail(email)
            .filter(account -> !account.isDemo() && !account.isEmailVerified())
            .map(account -> {
                EmailVerificationService.IssuedVerification issued = emailVerificationService.issue(account, now);
                return new EmailVerificationRequestResponse(
                    true,
                    EMAIL_VERIFICATION_MESSAGE,
                    emailVerificationDevLinks ? issued.rawToken() : null,
                    issued.expiresAt()
                );
            })
            .orElseGet(() -> new EmailVerificationRequestResponse(
                true,
                EMAIL_VERIFICATION_MESSAGE,
                null,
                null
            ));
    }

    @Transactional
    public AccountResponses.AuthSession confirmEmailVerification(EmailVerificationConfirmRequest request) {
        if (request == null) {
            throw new AccountException(
                HttpStatus.BAD_REQUEST,
                "invalid_verification_token",
                "Verification link expired or invalid. Request a new link and try again."
            );
        }
        validatePassword(request.password());
        Instant now = clock.instant();
        AccountEntity account = emailVerificationService.confirm(request.token(), now);
        account.replacePasswordHash(passwordHasher.hash(request.password()));
        account.markLogin(now);
        return createSession(account, now);
    }

    @Transactional
    public PasswordResetRequestResponse requestPasswordReset(PasswordResetRequest request) {
        if (request == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_email", "Enter a valid email address.");
        }
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
        if (request == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_reset_token", "Reset link expired or invalid.");
        }
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
        account.markEmailVerified(now);
        resetToken.markUsed(now);
        sessionRepository.deleteByAccountId(account.getId());
        account.markLogin(now);
        return createSession(account, now);
    }

    public record RegisterRequest(String email, String displayName) {}
    public record LoginRequest(String email, String password) {}
    public record LogoutRequest(String pushEndpoint) {}
    public record GoogleLoginRequest(String credential) {}
    public record EmailVerificationRequest(String email) {}
    public record EmailVerificationConfirmRequest(String token, String password) {}
    public record PasswordResetRequest(String email) {}
    public record PasswordResetConfirmRequest(String token, String password) {}
    private record DevCommuteSeed(
        String id,
        String label,
        String originStationId,
        String destinationStationId,
        boolean watchReturnTrip
    ) {}
    public record PasswordResetRequestResponse(
        boolean accepted,
        String message,
        String devResetToken,
        Instant expiresAt
    ) {}
    public record EmailVerificationRequestResponse(
        boolean accepted,
        String message,
        String devVerificationToken,
        Instant expiresAt
    ) {}
}
