# Account, Keyboard, And RSZ Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scoped saved-commute accounts, improve keyboard behavior in the menu/search flows, and recolor Reduced Speed Zones to Light Mint Green `#A6FBB2`.

**Architecture:** Keep the dashboard public and add backend-owned session auth only for account-owned saved commutes. Use Spring Boot, JPA, Flyway, BCrypt from `spring-security-crypto`, HTTP-only cookies, and a small client-side account adapter in Next.js. Frontend account state hydrates after the public dashboard renders, so fixture fallback and live dashboard reads remain unchanged.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring Web, Spring Data JPA, Flyway, PostgreSQL/PostGIS, Next.js App Router, React 19, TypeScript, Node built-in test runner, Playwright.

---

## Reference Inputs

- Approved design: `docs/superpowers/specs/2026-06-05-account-keyboard-rsz-polish-design.md`
- Agent instructions: `AGENTS.md` and `GEMINI.md`
- Frontend fixture tests: `frontend/tests/*.test.mjs`
- Smoke tests: `frontend/tests/smoke/dashboard.spec.ts`
- Backend tests: `backend/src/test/java/com/calebhabesh/linewatch/**`

Run from repository root unless the command explicitly changes directory.

Before starting implementation:

```bash
git status --short
```

Expected: either clean, or only user changes that are unrelated to this plan. Preserve unrelated changes.

## File Structure

Create backend account package:

```text
backend/src/main/java/com/calebhabesh/linewatch/account/
  AccountController.java             HTTP auth endpoints.
  AccountEntity.java                 JPA account table row.
  AccountErrorResponse.java          Error response DTO.
  AccountException.java              Service exception carrying HTTP status and error code.
  AccountRepository.java             JPA account reads.
  AccountResponses.java              Auth/user/saved-commute response records.
  AccountService.java                Register/login/demo/logout/current-user flow.
  AuthCorsConfiguration.java         Credentialed dev CORS allowlist.
  AuthCookieFactory.java             HTTP-only session cookie creation/expiry.
  PasswordHasher.java                BCrypt wrapper.
  SavedCommuteController.java        Account-owned commute endpoints.
  SavedCommuteEntity.java            JPA saved commute table row.
  SavedCommuteRepository.java        JPA commute reads.
  SavedCommuteService.java           Saved commute validation/list/create/delete.
  SessionTokenService.java           Secure random tokens and SHA-256 token hashes.
  UserSessionEntity.java             JPA session row.
  UserSessionRepository.java         JPA session reads/deletes.
```

Create backend migration and tests:

```text
backend/src/main/resources/db/migration/V18__account_auth_and_saved_commutes.sql
backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/PasswordHasherTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/SessionTokenServiceTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java
backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteControllerTest.java
```

Create frontend account seam and tests:

```text
frontend/src/app/account-data.ts
frontend/tests/account-data.test.mjs
frontend/tests/account-ui-source.test.mjs
frontend/tests/keyboard-accessibility.test.mjs
frontend/tests/rsz-color.test.mjs
```

Modify frontend UI:

```text
frontend/src/components/LineWatchShell.tsx
frontend/src/components/SavedCommutesPanel.tsx
frontend/src/components/StationSearchPanel.tsx
frontend/src/components/LineLegend.tsx
frontend/src/components/ReducedSpeedZonesPanel.tsx
frontend/src/components/StationDetailPanel.tsx
frontend/src/components/InteractiveTtcMap.tsx
frontend/src/app/globals.css
frontend/tests/drawer-layout.test.mjs
frontend/tests/map-layering.test.mjs
frontend/tests/smoke/api-stub.mjs
frontend/tests/smoke/api-stub-data.mjs
frontend/tests/smoke/dashboard.spec.ts
```

Modify docs after implementation:

```text
README.md
AGENTS.md
GEMINI.md
```

---

### Task 1: Backend Schema And BCrypt Dependency

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/main/resources/db/migration/V18__account_auth_and_saved_commutes.sql`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`

- [ ] **Step 1: Write the failing schema migration test**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class AccountSchemaMigrationTest {

    @Test
    void v18CreatesAccountsSessionsAndSavedCommutes() throws IOException {
        String sql = migrationSql("/db/migration/V18__account_auth_and_saved_commutes.sql");

        assertThat(sql).contains("create table accounts");
        assertThat(sql).contains("email varchar(320) not null unique");
        assertThat(sql).contains("password_hash varchar(255) not null");
        assertThat(sql).contains("demo boolean not null default false");
        assertThat(sql).contains("create table user_sessions");
        assertThat(sql).contains("token_hash varchar(64) not null unique");
        assertThat(sql).contains("expires_at timestamp with time zone not null");
        assertThat(sql).contains("create table saved_commutes");
        assertThat(sql).contains("origin_station_id varchar(80) not null references stations(id)");
        assertThat(sql).contains("destination_station_id varchar(80) not null references stations(id)");
        assertThat(sql).contains("unique (account_id, origin_station_id, destination_station_id)");
        assertThat(sql).contains("origin_station_id <> destination_station_id");
        assertThat(sql).contains("idx_user_sessions_expires_at");
        assertThat(sql).contains("idx_saved_commutes_account_id");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
```

- [ ] **Step 2: Run the failing schema test**

```bash
mvn -f backend/pom.xml -Dtest=AccountSchemaMigrationTest test
```

Expected: FAIL because `V18__account_auth_and_saved_commutes.sql` is missing.

- [ ] **Step 3: Add BCrypt dependency**

In `backend/pom.xml`, add this dependency near the Spring dependencies:

```xml
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-crypto</artifactId>
        </dependency>
```

Do not add `spring-boot-starter-security`.

- [ ] **Step 4: Add the Flyway migration**

Create `backend/src/main/resources/db/migration/V18__account_auth_and_saved_commutes.sql`:

```sql
create table accounts (
    id varchar(80) primary key,
    email varchar(320) not null unique,
    display_name varchar(120) not null,
    password_hash varchar(255) not null,
    demo boolean not null default false,
    created_at timestamp with time zone not null,
    last_login_at timestamp with time zone
);

create table user_sessions (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    token_hash varchar(64) not null unique,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null
);

create table saved_commutes (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    label varchar(120) not null,
    origin_station_id varchar(80) not null references stations(id),
    destination_station_id varchar(80) not null references stations(id),
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    unique (account_id, origin_station_id, destination_station_id),
    check (origin_station_id <> destination_station_id)
);

create index idx_user_sessions_account_id
    on user_sessions(account_id);

create index idx_user_sessions_expires_at
    on user_sessions(expires_at);

create index idx_saved_commutes_account_id
    on saved_commutes(account_id, created_at);
```

- [ ] **Step 5: Verify schema test passes**

```bash
mvn -f backend/pom.xml -Dtest=AccountSchemaMigrationTest test
```

Expected: PASS.

- [ ] **Step 6: Commit backend schema**

```bash
git add backend/pom.xml backend/src/main/resources/db/migration/V18__account_auth_and_saved_commutes.sql backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java
git commit -m "feat(backend): add account auth schema"
```

---

### Task 2: Password And Session Token Utilities

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordHasher.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/SessionTokenService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/PasswordHasherTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/SessionTokenServiceTest.java`

- [ ] **Step 1: Write failing password and token tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/PasswordHasherTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordHasherTest {

    @Test
    void hashesPasswordsWithBCryptAndVerifiesMatches() {
        PasswordHasher hasher = new PasswordHasher();

        String hash = hasher.hash("correct horse battery staple");

        assertThat(hash).isNotEqualTo("correct horse battery staple");
        assertThat(hash).startsWith("$2");
        assertThat(hasher.matches("correct horse battery staple", hash)).isTrue();
        assertThat(hasher.matches("wrong password", hash)).isFalse();
    }
}
```

Create `backend/src/test/java/com/calebhabesh/linewatch/account/SessionTokenServiceTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SessionTokenServiceTest {

    @Test
    void createsOpaqueTokenAndStoresOnlyDeterministicSha256Hash() {
        SessionTokenService service = new SessionTokenService();

        SessionTokenService.GeneratedSessionToken token = service.generateToken();

        assertThat(token.rawToken()).hasSizeGreaterThanOrEqualTo(43);
        assertThat(token.tokenHash()).hasSize(64);
        assertThat(token.tokenHash()).isEqualTo(service.hashToken(token.rawToken()));
        assertThat(token.tokenHash()).isNotEqualTo(token.rawToken());
    }

    @Test
    void tokenHashesAreDeterministicButGeneratedTokensAreUnique() {
        SessionTokenService service = new SessionTokenService();

        assertThat(service.hashToken("same-token")).isEqualTo(service.hashToken("same-token"));
        assertThat(service.generateToken().rawToken()).isNotEqualTo(service.generateToken().rawToken());
    }
}
```

- [ ] **Step 2: Run failing utility tests**

```bash
mvn -f backend/pom.xml -Dtest=PasswordHasherTest,SessionTokenServiceTest test
```

Expected: FAIL because `PasswordHasher` and `SessionTokenService` do not exist.

- [ ] **Step 3: Implement `PasswordHasher`**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordHasher.java`:

```java
package com.calebhabesh.linewatch.account;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class PasswordHasher {
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

    public String hash(String password) {
        return encoder.encode(password);
    }

    public boolean matches(String password, String hash) {
        return encoder.matches(password, hash);
    }
}
```

- [ ] **Step 4: Implement `SessionTokenService`**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/SessionTokenService.java`:

```java
package com.calebhabesh.linewatch.account;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class SessionTokenService {
    private static final int TOKEN_BYTES = 32;
    private final SecureRandom secureRandom = new SecureRandom();

    public GeneratedSessionToken generateToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return new GeneratedSessionToken(rawToken, hashToken(rawToken));
    }

    public String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hashed.length * 2);
            for (byte b : hashed) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    public record GeneratedSessionToken(String rawToken, String tokenHash) {}
}
```

- [ ] **Step 5: Verify utility tests pass**

```bash
mvn -f backend/pom.xml -Dtest=PasswordHasherTest,SessionTokenServiceTest test
```

Expected: PASS.

- [ ] **Step 6: Commit utility layer**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/PasswordHasher.java backend/src/main/java/com/calebhabesh/linewatch/account/SessionTokenService.java backend/src/test/java/com/calebhabesh/linewatch/account/PasswordHasherTest.java backend/src/test/java/com/calebhabesh/linewatch/account/SessionTokenServiceTest.java
git commit -m "feat(backend): add account credential utilities"
```

---

### Task 3: Account Entities, Repositories, And Service

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountException.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

- [ ] **Step 1: Write the failing account service test**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`:

```java
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
    private final PasswordHasher passwordHasher = new PasswordHasher();
    private final SessionTokenService tokenService = new SessionTokenService();
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T14:30:00Z"), ZoneOffset.UTC);
    private final AccountService service = new AccountService(
        accountRepository,
        sessionRepository,
        passwordHasher,
        tokenService,
        clock
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
            .hasMessageContaining("Email or password is incorrect");
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
}
```

- [ ] **Step 2: Run the failing account service test**

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: FAIL because account entities/service do not exist.

- [ ] **Step 3: Implement account response and exception records**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`:

```java
package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.List;

public final class AccountResponses {
    private AccountResponses() {}

    public record UserResponse(String id, String email, String displayName, boolean demo) {}

    public record AuthResponse(boolean authenticated, UserResponse user) {}

    public record AuthSession(UserResponse user, String rawSessionToken, Instant expiresAt) {}

    public record SavedCommuteResponse(
        String id,
        String label,
        String originStationId,
        String originStationName,
        String destinationStationId,
        String destinationStationName,
        String routeLabel,
        Instant createdAt,
        Instant updatedAt
    ) {}

    public record SavedCommuteListResponse(List<SavedCommuteResponse> commutes) {}
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountException.java`:

```java
package com.calebhabesh.linewatch.account;

import org.springframework.http.HttpStatus;

public class AccountException extends RuntimeException {
    private final HttpStatus status;
    private final String error;

    public AccountException(HttpStatus status, String error, String message) {
        super(message);
        this.status = status;
        this.error = error;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getError() {
        return error;
    }
}
```

- [ ] **Step 4: Implement account/session entities and repositories**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`:

```java
package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "accounts")
public class AccountEntity {
    @Id
    private String id;
    private String email;
    @Column(name = "display_name")
    private String displayName;
    @Column(name = "password_hash")
    private String passwordHash;
    private boolean demo;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected AccountEntity() {}

    private AccountEntity(String id, String email, String displayName, String passwordHash, boolean demo, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.displayName = displayName;
        this.passwordHash = passwordHash;
        this.demo = demo;
        this.createdAt = createdAt;
        this.lastLoginAt = null;
    }

    public static AccountEntity create(String id, String email, String displayName, String passwordHash, boolean demo, Instant createdAt) {
        return new AccountEntity(id, email, displayName, passwordHash, demo, createdAt);
    }

    public void markLogin(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public boolean isDemo() { return demo; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastLoginAt() { return lastLoginAt; }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionEntity.java`:

```java
package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "user_sessions")
public class UserSessionEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    @Column(name = "token_hash")
    private String tokenHash;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "expires_at")
    private Instant expiresAt;

    protected UserSessionEntity() {}

    private UserSessionEntity(String id, AccountEntity account, String tokenHash, Instant createdAt, Instant expiresAt) {
        this.id = id;
        this.account = account;
        this.tokenHash = tokenHash;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public static UserSessionEntity create(String id, AccountEntity account, String tokenHash, Instant createdAt, Instant expiresAt) {
        return new UserSessionEntity(id, account, tokenHash, createdAt, expiresAt);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getTokenHash() { return tokenHash; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountRepository.java`:

```java
package com.calebhabesh.linewatch.account;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<AccountEntity, String> {
    boolean existsByEmail(String email);
    Optional<AccountEntity> findByEmail(String email);
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionRepository.java`:

```java
package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface UserSessionRepository extends JpaRepository<UserSessionEntity, String> {
    Optional<UserSessionEntity> findByTokenHash(String tokenHash);
    void deleteByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from UserSessionEntity s where s.expiresAt < :now")
    int deleteExpiredSessions(Instant now);
}
```

- [ ] **Step 5: Implement account service**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`:

```java
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
```

- [ ] **Step 6: Verify account service test passes**

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: PASS.

- [ ] **Step 7: Commit account service**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java
git commit -m "feat(backend): add account session service"
```

---

### Task 4: Auth Controllers, Cookies, And CORS

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountErrorResponse.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AuthCookieFactory.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AuthCorsConfiguration.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`
- Modify: `backend/src/main/resources/application.yml`

- [ ] **Step 1: Write failing controller tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class AccountControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final AuthCookieFactory cookieFactory = new AuthCookieFactory(false);
    private final AccountController controller = new AccountController(accountService, cookieFactory);

    @Test
    void loginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false);
        when(accountService.login(new AccountService.LoginRequest("rider@example.com", "correct horse battery staple")))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.login(
            new AccountService.LoginRequest("rider@example.com", "correct horse battery staple")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
    }

    @Test
    void logoutExpiresSessionCookieAndDeletesServerSession() {
        ResponseEntity<AccountResponses.AuthResponse> response = controller.logout("raw-token");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=")
            .contains("Max-Age=0");
        verify(accountService).logout("raw-token");
    }

    @Test
    void accountExceptionMapsToErrorResponse() {
        AccountException ex = new AccountException(HttpStatus.CONFLICT, "email_exists", "An account with that email already exists.");

        ResponseEntity<AccountErrorResponse> response = controller.handleAccountException(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isEqualTo(new AccountErrorResponse("email_exists", "An account with that email already exists."));
    }
}
```

- [ ] **Step 2: Run failing controller tests**

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: FAIL because controller/cookie classes do not exist.

- [ ] **Step 3: Implement cookie and error helpers**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountErrorResponse.java`:

```java
package com.calebhabesh.linewatch.account;

public record AccountErrorResponse(String error, String message) {}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AuthCookieFactory.java`:

```java
package com.calebhabesh.linewatch.account;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class AuthCookieFactory {
    public static final String COOKIE_NAME = "linewatch_session";
    private final boolean secureCookie;

    public AuthCookieFactory(@Value("${linewatch.auth.secure-cookie:false}") boolean secureCookie) {
        this.secureCookie = secureCookie;
    }

    public ResponseCookie sessionCookie(String rawSessionToken, Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, rawSessionToken)
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(maxAge)
            .build();
    }

    public ResponseCookie expiredCookie() {
        return ResponseCookie.from(COOKIE_NAME, "")
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ZERO)
            .build();
    }
}
```

- [ ] **Step 4: Implement account controller**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`:

```java
package com.calebhabesh.linewatch.account;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    public AccountController(AccountService accountService, AuthCookieFactory cookieFactory) {
        this.accountService = accountService;
        this.cookieFactory = cookieFactory;
    }

    @PostMapping("/register")
    public ResponseEntity<AccountResponses.AuthResponse> register(@RequestBody AccountService.RegisterRequest request) {
        return authenticated(accountService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AccountResponses.AuthResponse> login(@RequestBody AccountService.LoginRequest request) {
        return authenticated(accountService.login(request));
    }

    @PostMapping("/demo")
    public ResponseEntity<AccountResponses.AuthResponse> demo() {
        return authenticated(accountService.demoLogin());
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
```

- [ ] **Step 5: Add credentialed dev CORS**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AuthCorsConfiguration.java`:

```java
package com.calebhabesh.linewatch.account;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AuthCorsConfiguration implements WebMvcConfigurer {
    private final List<String> allowedOrigins;

    public AuthCorsConfiguration(
        @Value("${linewatch.auth.allowed-origins:http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4173}") List<String> allowedOrigins
    ) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/auth/**")
            .allowedOrigins(allowedOrigins.toArray(String[]::new))
            .allowedMethods("GET", "POST", "OPTIONS")
            .allowedHeaders("content-type")
            .allowCredentials(true);

        registry.addMapping("/api/account/**")
            .allowedOrigins(allowedOrigins.toArray(String[]::new))
            .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
            .allowedHeaders("content-type")
            .allowCredentials(true);
    }
}
```

Add to `backend/src/main/resources/application.yml` under `linewatch:`:

```yaml
  auth:
    secure-cookie: ${LINEWATCH_AUTH_SECURE_COOKIE:false}
    allowed-origins: ${LINEWATCH_AUTH_ALLOWED_ORIGINS:http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4173}
```

- [ ] **Step 6: Verify controller tests pass**

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: PASS.

- [ ] **Step 7: Commit auth controller**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java backend/src/main/java/com/calebhabesh/linewatch/account/AccountErrorResponse.java backend/src/main/java/com/calebhabesh/linewatch/account/AuthCookieFactory.java backend/src/main/java/com/calebhabesh/linewatch/account/AuthCorsConfiguration.java backend/src/main/resources/application.yml backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java
git commit -m "feat(backend): expose account auth endpoints"
```

---

### Task 5: Saved Commute Backend Service And Controller

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteController.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteControllerTest.java`

- [ ] **Step 1: Write failing saved commute service test**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class SavedCommuteServiceTest {
    private final SavedCommuteRepository commuteRepository = mock(SavedCommuteRepository.class);
    private final StationRepository stationRepository = mock(StationRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T14:30:00Z"), ZoneOffset.UTC);
    private final SavedCommuteService service = new SavedCommuteService(commuteRepository, stationRepository, clock);
    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void createsSavedCommuteWithResolvedStationNames() {
        StationEntity finch = new StationEntity("finch", "Finch", 0, 0, false, 10, null);
        StationEntity union = new StationEntity("union", "Union", 0, 0, true, 20, null);
        when(stationRepository.findById("finch")).thenReturn(Optional.of(finch));
        when(stationRepository.findById("union")).thenReturn(Optional.of(union));
        when(commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId("user_1", "finch", "union")).thenReturn(false);
        when(commuteRepository.save(any(SavedCommuteEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.SavedCommuteResponse response = service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("Morning commute", "finch", "union")
        );

        assertThat(response.label()).isEqualTo("Morning commute");
        assertThat(response.originStationName()).isEqualTo("Finch");
        assertThat(response.destinationStationName()).isEqualTo("Union");
        assertThat(response.routeLabel()).isEqualTo("Finch -> Union");
    }

    @Test
    void rejectsSameOriginAndDestination() {
        assertThatThrownBy(() -> service.create(
            account,
            new SavedCommuteService.CreateSavedCommuteRequest("Loop", "union", "union")
        ))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void listsCommutesForCurrentAccountOnly() {
        StationEntity finch = new StationEntity("finch", "Finch", 0, 0, false, 10, null);
        StationEntity union = new StationEntity("union", "Union", 0, 0, true, 20, null);
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            Instant.parse("2026-06-05T14:30:00Z")
        );
        when(commuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(stationRepository.findAllById(List.of("finch", "union"))).thenReturn(List.of(finch, union));

        AccountResponses.SavedCommuteListResponse response = service.list(account);

        assertThat(response.commutes()).singleElement().satisfies(item -> {
            assertThat(item.id()).isEqualTo("commute_1");
            assertThat(item.routeLabel()).isEqualTo("Finch -> Union");
        });
    }
}
```

- [ ] **Step 2: Write failing saved commute controller test**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteControllerTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class SavedCommuteControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final SavedCommuteService savedCommuteService = mock(SavedCommuteService.class);
    private final SavedCommuteController controller = new SavedCommuteController(accountService, savedCommuteService);
    private final AccountEntity account = AccountEntity.create("user_1", "rider@example.com", "Rider", "$2a$hash", false, Instant.parse("2026-06-05T14:00:00Z"));

    @Test
    void listUsesCurrentSessionAccount() {
        AccountResponses.SavedCommuteListResponse expected = new AccountResponses.SavedCommuteListResponse(List.of());
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(savedCommuteService.list(account)).thenReturn(expected);

        AccountResponses.SavedCommuteListResponse response = controller.list("raw-token");

        assertThat(response).isEqualTo(expected);
    }

    @Test
    void deleteUsesCurrentSessionAccount() {
        when(accountService.requireAccount("raw-token")).thenReturn(account);

        controller.delete("raw-token", "commute_1");

        verify(savedCommuteService).delete(account, "commute_1");
    }
}
```

- [ ] **Step 3: Run failing saved commute tests**

```bash
mvn -f backend/pom.xml -Dtest=SavedCommuteServiceTest,SavedCommuteControllerTest test
```

Expected: FAIL because saved commute classes do not exist.

- [ ] **Step 4: Implement saved commute entity/repository**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteEntity.java`:

```java
package com.calebhabesh.linewatch.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "saved_commutes")
public class SavedCommuteEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    private String label;
    @Column(name = "origin_station_id")
    private String originStationId;
    @Column(name = "destination_station_id")
    private String destinationStationId;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;

    protected SavedCommuteEntity() {}

    private SavedCommuteEntity(String id, AccountEntity account, String label, String originStationId, String destinationStationId, Instant now) {
        this.id = id;
        this.account = account;
        this.label = label;
        this.originStationId = originStationId;
        this.destinationStationId = destinationStationId;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static SavedCommuteEntity create(String id, AccountEntity account, String label, String originStationId, String destinationStationId, Instant now) {
        return new SavedCommuteEntity(id, account, label, originStationId, destinationStationId, now);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getLabel() { return label; }
    public String getOriginStationId() { return originStationId; }
    public String getDestinationStationId() { return destinationStationId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteRepository.java`:

```java
package com.calebhabesh.linewatch.account;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedCommuteRepository extends JpaRepository<SavedCommuteEntity, String> {
    List<SavedCommuteEntity> findByAccountIdOrderByCreatedAtAsc(String accountId);
    Optional<SavedCommuteEntity> findByIdAndAccountId(String id, String accountId);
    boolean existsByAccountIdAndOriginStationIdAndDestinationStationId(String accountId, String originStationId, String destinationStationId);
}
```

- [ ] **Step 5: Implement saved commute service**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java`:

```java
package com.calebhabesh.linewatch.account;

import com.calebhabesh.linewatch.station.StationEntity;
import com.calebhabesh.linewatch.station.StationRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedCommuteService {
    private final SavedCommuteRepository commuteRepository;
    private final StationRepository stationRepository;
    private final Clock clock;

    public SavedCommuteService(SavedCommuteRepository commuteRepository, StationRepository stationRepository) {
        this(commuteRepository, stationRepository, Clock.systemUTC());
    }

    SavedCommuteService(SavedCommuteRepository commuteRepository, StationRepository stationRepository, Clock clock) {
        this.commuteRepository = commuteRepository;
        this.stationRepository = stationRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AccountResponses.SavedCommuteListResponse list(AccountEntity account) {
        List<SavedCommuteEntity> commutes = commuteRepository.findByAccountIdOrderByCreatedAtAsc(account.getId());
        List<String> stationIds = commutes.stream()
            .flatMap(commute -> List.of(commute.getOriginStationId(), commute.getDestinationStationId()).stream())
            .distinct()
            .toList();
        Map<String, StationEntity> stationsById = stationRepository.findAllById(stationIds)
            .stream()
            .collect(Collectors.toMap(StationEntity::getId, Function.identity()));
        return new AccountResponses.SavedCommuteListResponse(
            commutes.stream()
                .map(commute -> toResponse(commute, stationsById))
                .toList()
        );
    }

    @Transactional
    public AccountResponses.SavedCommuteResponse create(AccountEntity account, CreateSavedCommuteRequest request) {
        String originId = normalizeStationId(request.originStationId());
        String destinationId = normalizeStationId(request.destinationStationId());
        if (originId.equals(destinationId)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "same_station", "Choose two different stations for a saved commute.");
        }
        StationEntity origin = stationRepository.findById(originId)
            .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, "unknown_origin_station", "Origin station is not mapped."));
        StationEntity destination = stationRepository.findById(destinationId)
            .orElseThrow(() -> new AccountException(HttpStatus.BAD_REQUEST, "unknown_destination_station", "Destination station is not mapped."));
        if (commuteRepository.existsByAccountIdAndOriginStationIdAndDestinationStationId(account.getId(), originId, destinationId)) {
            throw new AccountException(HttpStatus.CONFLICT, "commute_exists", "That commute is already saved.");
        }

        Instant now = clock.instant();
        String label = normalizeLabel(request.label(), origin.getName(), destination.getName());
        SavedCommuteEntity commute = commuteRepository.save(SavedCommuteEntity.create(
            nextId(),
            account,
            label,
            originId,
            destinationId,
            now
        ));
        return toResponse(commute, Map.of(originId, origin, destinationId, destination));
    }

    @Transactional
    public void delete(AccountEntity account, String commuteId) {
        SavedCommuteEntity commute = commuteRepository.findByIdAndAccountId(commuteId, account.getId())
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "commute_not_found", "Saved commute was not found."));
        commuteRepository.delete(commute);
    }

    private AccountResponses.SavedCommuteResponse toResponse(SavedCommuteEntity commute, Map<String, StationEntity> stationsById) {
        StationEntity origin = stationsById.get(commute.getOriginStationId());
        StationEntity destination = stationsById.get(commute.getDestinationStationId());
        String originName = origin == null ? commute.getOriginStationId() : origin.getName();
        String destinationName = destination == null ? commute.getDestinationStationId() : destination.getName();
        return new AccountResponses.SavedCommuteResponse(
            commute.getId(),
            commute.getLabel(),
            commute.getOriginStationId(),
            originName,
            commute.getDestinationStationId(),
            destinationName,
            originName + " -> " + destinationName,
            commute.getCreatedAt(),
            commute.getUpdatedAt()
        );
    }

    private String normalizeLabel(String label, String originName, String destinationName) {
        String normalized = label == null ? "" : label.trim();
        return normalized.isBlank() ? originName + " to " + destinationName : normalized;
    }

    private String normalizeStationId(String stationId) {
        if (stationId == null || stationId.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "missing_station", "Choose an origin and destination station.");
        }
        return stationId.trim();
    }

    private String nextId() {
        return "commute_" + UUID.randomUUID().toString().replace("-", "");
    }

    public record CreateSavedCommuteRequest(String label, String originStationId, String destinationStationId) {}
}
```

- [ ] **Step 6: Implement saved commute controller**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteController.java`:

```java
package com.calebhabesh.linewatch.account;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/account/commutes")
public class SavedCommuteController {
    private final AccountService accountService;
    private final SavedCommuteService savedCommuteService;

    public SavedCommuteController(AccountService accountService, SavedCommuteService savedCommuteService) {
        this.accountService = accountService;
        this.savedCommuteService = savedCommuteService;
    }

    @GetMapping
    public AccountResponses.SavedCommuteListResponse list(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return savedCommuteService.list(account);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccountResponses.SavedCommuteResponse create(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody SavedCommuteService.CreateSavedCommuteRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return savedCommuteService.create(account, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @PathVariable String id
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        savedCommuteService.delete(account, id);
    }

    @ExceptionHandler(AccountException.class)
    public ResponseEntity<AccountErrorResponse> handleAccountException(AccountException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new AccountErrorResponse(ex.getError(), ex.getMessage()));
    }
}
```

- [ ] **Step 7: Verify saved commute tests pass**

```bash
mvn -f backend/pom.xml -Dtest=SavedCommuteServiceTest,SavedCommuteControllerTest test
```

Expected: PASS.

- [ ] **Step 8: Run all backend tests**

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 9: Commit saved commute backend**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account backend/src/test/java/com/calebhabesh/linewatch/account
git commit -m "feat(backend): add account saved commutes"
```

---

### Task 6: Frontend Account Data Adapter

**Files:**
- Create: `frontend/src/app/account-data.ts`
- Create: `frontend/tests/account-data.test.mjs`

- [ ] **Step 1: Write failing account adapter tests**

Create `frontend/tests/account-data.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSavedCommute,
  getCurrentAccount,
  getSavedCommutes,
  loginDemoAccount,
  logoutAccount,
} from "../src/app/account-data.ts";

describe("account data adapter", () => {
  it("maps signed-out current account responses", async () => {
    const result = await getCurrentAccount({
      fetcher: async () =>
        new Response(JSON.stringify({ authenticated: false, user: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.authenticated, false);
    assert.equal(result.user, null);
  });

  it("falls back to unavailable account state when backend cannot be reached", async () => {
    const result = await getCurrentAccount({
      fetcher: async () => {
        throw new Error("offline");
      },
    });

    assert.equal(result.source, "unavailable");
    assert.equal(result.authenticated, false);
    assert.equal(result.user, null);
  });

  it("posts demo login with credentials included", async () => {
    const requests = [];
    const result = await loginDemoAccount({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: { id: "user_demo", email: "demo@linewatch.local", displayName: "Demo Rider", demo: true },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.user.email, "demo@linewatch.local");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("loads account saved commutes", async () => {
    const result = await getSavedCommutes({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            commutes: [
              {
                id: "commute_1",
                label: "Morning commute",
                originStationId: "finch",
                originStationName: "Finch",
                destinationStationId: "union",
                destinationStationName: "Union",
                routeLabel: "Finch -> Union",
                createdAt: "2026-06-05T14:30:00Z",
                updatedAt: "2026-06-05T14:30:00Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.commutes[0].routeLabel, "Finch -> Union");
  });

  it("creates and logs out through account endpoints", async () => {
    const requests = [];
    await createSavedCommute(
      { label: "Home", originStationId: "finch", destinationStationId: "union" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              id: "commute_1",
              label: "Home",
              originStationId: "finch",
              originStationName: "Finch",
              destinationStationId: "union",
              destinationStationName: "Union",
              routeLabel: "Finch -> Union",
              createdAt: "2026-06-05T14:30:00Z",
              updatedAt: "2026-06-05T14:30:00Z",
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        },
      }
    );
    await logoutAccount({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ authenticated: false, user: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.credentials, "include");
  });
});
```

- [ ] **Step 2: Run failing adapter test**

```bash
npm --prefix frontend exec -- node --test tests/account-data.test.mjs
```

Expected: FAIL because `frontend/src/app/account-data.ts` does not exist.

- [ ] **Step 3: Implement account data adapter**

Create `frontend/src/app/account-data.ts`:

```ts
const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL ?? "http://localhost:8080";

type Fetcher = typeof fetch;

type AdapterOptions = {
  fetcher?: Fetcher;
  apiBaseUrl?: string;
};

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  demo: boolean;
};

export type AccountState = {
  source: "backend" | "unavailable";
  authenticated: boolean;
  user: AccountUser | null;
  message?: string;
};

export type AuthResponse = {
  authenticated: boolean;
  user: AccountUser | null;
};

export type AccountSavedCommute = {
  id: string;
  label: string;
  originStationId: string;
  originStationName: string;
  destinationStationId: string;
  destinationStationName: string;
  routeLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountSavedCommuteResult = {
  source: "backend" | "unavailable";
  commutes: AccountSavedCommute[];
  message?: string;
};

export type CreateSavedCommuteInput = {
  label: string;
  originStationId: string;
  destinationStationId: string;
};

function apiUrl(path: string, options: AdapterOptions = {}) {
  return `${options.apiBaseUrl ?? DEFAULT_API_BASE_URL}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function authRequest(path: string, init: RequestInit = {}, options: AdapterOptions = {}): Promise<AuthResponse> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(path, options), {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Account request failed with ${response.status}`);
  }
  return readJson<AuthResponse>(response);
}

export async function getCurrentAccount(options: AdapterOptions = {}): Promise<AccountState> {
  try {
    const response = await authRequest("/api/auth/me", { method: "GET", headers: {} }, options);
    return { source: "backend", authenticated: response.authenticated, user: response.user };
  } catch {
    return {
      source: "unavailable",
      authenticated: false,
      user: null,
      message: "Account service unavailable.",
    };
  }
}

export async function registerAccount(input: { email: string; password: string; displayName: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/register", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function loginAccount(input: { email: string; password: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/login", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function loginDemoAccount(options: AdapterOptions = {}) {
  return authRequest("/api/auth/demo", { method: "POST" }, options);
}

export async function logoutAccount(options: AdapterOptions = {}) {
  return authRequest("/api/auth/logout", { method: "POST" }, options);
}

export async function getSavedCommutes(options: AdapterOptions = {}): Promise<AccountSavedCommuteResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/commutes", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Saved commutes request failed with ${response.status}`);
    }
    const body = await readJson<{ commutes: AccountSavedCommute[] }>(response);
    return { source: "backend", commutes: body.commutes };
  } catch {
    return {
      source: "unavailable",
      commutes: [],
      message: "Saved commutes are unavailable.",
    };
  }
}

export async function createSavedCommute(input: CreateSavedCommuteInput, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl("/api/account/commutes", options), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Create saved commute failed with ${response.status}`);
  }
  return readJson<AccountSavedCommute>(response);
}

export async function deleteSavedCommute(id: string, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(`/api/account/commutes/${encodeURIComponent(id)}`, options), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Delete saved commute failed with ${response.status}`);
  }
}
```

- [ ] **Step 4: Verify adapter tests pass**

```bash
npm --prefix frontend exec -- node --test tests/account-data.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit frontend adapter**

```bash
git add frontend/src/app/account-data.ts frontend/tests/account-data.test.mjs
git commit -m "feat(frontend): add account data adapter"
```

---

### Task 7: Account-Aware Menu And Saved Commutes UI

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Create: `frontend/tests/account-ui-source.test.mjs`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Write failing source tests for account UI**

Create `frontend/tests/account-ui-source.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("account UI source", () => {
  it("loads account state and exposes sign-in, create-account, demo, and sign-out actions", () => {
    assert.match(shellSource, /getCurrentAccount/);
    assert.match(shellSource, /loginAccount/);
    assert.match(shellSource, /registerAccount/);
    assert.match(shellSource, /loginDemoAccount/);
    assert.match(shellSource, /logoutAccount/);
    assert.match(shellSource, /Sign in/);
    assert.match(shellSource, /Create account/);
    assert.match(shellSource, /Demo account/);
    assert.match(shellSource, /Sign out/);
    assert.match(shellSource, /account-dialog/);
  });

  it("renders signed-out, demo, and account-backed saved commute states", () => {
    assert.match(savedCommutesSource, /accountState/);
    assert.match(savedCommutesSource, /accountCommutes/);
    assert.match(savedCommutesSource, /Saved to account/);
    assert.match(savedCommutesSource, /Demo examples/);
    assert.match(savedCommutesSource, /Impact matching pending/);
    assert.match(savedCommutesSource, /createSavedCommute/);
    assert.match(savedCommutesSource, /deleteSavedCommute/);
  });

  it("adds compact account styling without creating a landing page", () => {
    assert.match(globalCss, /\.account-dialog/);
    assert.match(globalCss, /\.account-action-row/);
    assert.match(globalCss, /\.saved-commute-form/);
    assert.doesNotMatch(shellSource, /hero|landing/i);
  });
});
```

- [ ] **Step 2: Run failing account UI test**

```bash
npm --prefix frontend exec -- node --test tests/account-ui-source.test.mjs
```

Expected: FAIL because account UI code is not present.

- [ ] **Step 3: Add account state to `LineWatchShell`**

Modify `frontend/src/components/LineWatchShell.tsx`:

Add imports:

```ts
import { LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import {
  getCurrentAccount,
  loginAccount,
  loginDemoAccount,
  logoutAccount,
  registerAccount,
  type AccountState,
  type AccountSavedCommute,
} from "../app/account-data";
```

Add state near other `useState` declarations:

```ts
  const [accountState, setAccountState] = useState<AccountState>({
    source: "unavailable",
    authenticated: false,
    user: null,
  });
  const [accountDialogMode, setAccountDialogMode] = useState<"login" | "register" | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountCommutes, setAccountCommutes] = useState<AccountSavedCommute[]>([]);
```

Add an account refresh effect:

```ts
  useEffect(() => {
    let cancelled = false;
    getCurrentAccount().then((state) => {
      if (!cancelled) {
        setAccountState(state);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
```

Add handlers before `return`:

```ts
  const resetAccountForm = () => {
    setAccountEmail("");
    setAccountPassword("");
    setAccountDisplayName("");
    setAccountError(null);
  };

  const refreshAccountState = async () => {
    const next = await getCurrentAccount();
    setAccountState(next);
    return next;
  };

  const handleSubmitAccount = async () => {
    if (!accountDialogMode) return;
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = accountDialogMode === "login"
        ? await loginAccount({ email: accountEmail, password: accountPassword })
        : await registerAccount({ email: accountEmail, password: accountPassword, displayName: accountDisplayName });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountDialogMode(null);
      resetAccountForm();
    } catch {
      setAccountError(accountDialogMode === "login" ? "Could not sign in with those credentials." : "Could not create that account.");
    } finally {
      setAccountBusy(false);
    }
  };

  const handleDemoAccount = async () => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await loginDemoAccount();
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setActiveView("commutes");
    } catch {
      setAccountError("Demo account is unavailable.");
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAccountBusy(true);
    try {
      await logoutAccount();
      setAccountState({ source: "backend", authenticated: false, user: null });
      setAccountCommutes([]);
    } finally {
      setAccountBusy(false);
    }
  };
```

Add account menu rows after the branding block and before nav links:

```tsx
               <div className="account-menu-block border-b border-black/10 dark:border-white/10 p-2">
                 {accountState.authenticated && accountState.user ? (
                   <div className="flex flex-col gap-2 px-2 py-2">
                     <div className="flex items-center gap-2 min-w-0 text-sm text-slate-700 dark:text-slate-200">
                       <UserRound size={17} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                       <span className="min-w-0 truncate font-bold">{accountState.user.displayName || accountState.user.email}</span>
                       {accountState.user.demo ? (
                         <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                           Demo
                         </span>
                       ) : null}
                     </div>
                     <button
                       type="button"
                       onClick={handleSignOut}
                       className="menu-action-row"
                       disabled={accountBusy}
                     >
                       <LogOut size={17} className="text-slate-500 dark:text-slate-400" />
                       Sign out
                     </button>
                   </div>
                 ) : (
                   <div className="account-action-row">
                     <button type="button" onClick={() => { resetAccountForm(); setAccountDialogMode("login"); }} className="menu-action-row">
                       <LogIn size={17} className="text-slate-500 dark:text-slate-400" />
                       Sign in
                     </button>
                     <button type="button" onClick={() => { resetAccountForm(); setAccountDialogMode("register"); }} className="menu-action-row">
                       <UserPlus size={17} className="text-slate-500 dark:text-slate-400" />
                       Create account
                     </button>
                     <button type="button" onClick={handleDemoAccount} className="menu-action-row" disabled={accountBusy}>
                       <UserRound size={17} className="text-emerald-600 dark:text-emerald-400" />
                       Demo account
                     </button>
                   </div>
                 )}
                 {accountError ? <p className="px-2 pb-2 text-xs font-semibold text-red-600 dark:text-red-300">{accountError}</p> : null}
               </div>
```

Replace the `SavedCommutesPanel` call with:

```tsx
           <SavedCommutesPanel
             accountState={accountState}
             accountCommutes={accountCommutes}
             setAccountCommutes={setAccountCommutes}
             stationSummaries={stationSummaries}
             onBack={() => setActiveView("menu")}
             onRequestSignIn={() => setAccountDialogMode("login")}
             onRequestCreateAccount={() => setAccountDialogMode("register")}
             onRequestDemo={handleDemoAccount}
           />
```

Add the account dialog near `<OpeningDisclaimer />`:

```tsx
      {accountDialogMode ? (
        <div className="account-dialog-backdrop" role="presentation" onMouseDown={() => setAccountDialogMode(null)}>
          <section
            className="account-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={accountDialogMode === "login" ? "Sign in to LineWatchTO" : "Create LineWatchTO account"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/10 p-3 dark:border-white/10">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  {accountDialogMode === "login" ? "Sign in" : "Create account"}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Save commute preferences across demos.</p>
              </div>
              <button type="button" className="station-search-clear" onClick={() => setAccountDialogMode(null)} aria-label="Close account dialog">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-3">
              {accountDialogMode === "register" ? (
                <label className="account-field">
                  <span>Display name</span>
                  <input value={accountDisplayName} onChange={(event) => setAccountDisplayName(event.target.value)} />
                </label>
              ) : null}
              <label className="account-field">
                <span>Email</span>
                <input type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} />
              </label>
              <label className="account-field">
                <span>Password</span>
                <input type="password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} />
              </label>
              {accountError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{accountError}</p> : null}
              <button type="button" className="account-primary-button" onClick={handleSubmitAccount} disabled={accountBusy}>
                {accountDialogMode === "login" ? "Sign in" : "Create account"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
```

- [ ] **Step 4: Update `SavedCommutesPanel` props and account states**

Modify `frontend/src/components/SavedCommutesPanel.tsx`:

Add imports:

```ts
import { useEffect, useMemo, useState } from "react";
import {
  createSavedCommute,
  deleteSavedCommute,
  getSavedCommutes,
  type AccountSavedCommute,
  type AccountState,
} from "../app/account-data";
import type { StationSummary } from "../app/station-data";
```

Replace props with:

```ts
interface Props {
  onBack?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationSummaries: StationSummary[];
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onRequestDemo: () => void;
}
```

Inside the component, load account commutes when authenticated:

```ts
  const [newLabel, setNewLabel] = useState("");
  const [originStationId, setOriginStationId] = useState("");
  const [destinationStationId, setDestinationStationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!accountState.authenticated) {
      setAccountCommutes([]);
      return () => {
        cancelled = true;
      };
    }
    getSavedCommutes().then((result) => {
      if (!cancelled && result.source === "backend") {
        setAccountCommutes(result.commutes);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accountState.authenticated, setAccountCommutes]);

  const stationOptions = useMemo(() => {
    return [...stationSummaries].sort((a, b) => a.name.localeCompare(b.name));
  }, [stationSummaries]);
```

Add submit/delete handlers:

```ts
  const handleCreateCommute = async () => {
    if (!originStationId || !destinationStationId) {
      setCommuteError("Choose an origin and destination station.");
      return;
    }
    setSaving(true);
    setCommuteError(null);
    try {
      const created = await createSavedCommute({
        label: newLabel,
        originStationId,
        destinationStationId,
      });
      setAccountCommutes([...accountCommutes, created]);
      setNewLabel("");
      setOriginStationId("");
      setDestinationStationId("");
    } catch {
      setCommuteError("Could not save that commute.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCommute = async (id: string) => {
    try {
      await deleteSavedCommute(id);
      setAccountCommutes(accountCommutes.filter((commute) => commute.id !== id));
    } catch {
      setCommuteError("Could not delete that commute.");
    }
  };
```

Render signed-out prompt above fixture cards:

```tsx
        {!accountState.authenticated ? (
          <div className="saved-commute-account-prompt">
            <strong>Demo examples</strong>
            <span>Sign in to save your own rapid-transit commute preferences.</span>
            <div className="account-action-row">
              <button type="button" onClick={onRequestSignIn}>Sign in</button>
              <button type="button" onClick={onRequestCreateAccount}>Create account</button>
              <button type="button" onClick={onRequestDemo}>Demo account</button>
            </div>
          </div>
        ) : null}
```

Render account form and account commute cards before fixture cards when signed in:

```tsx
        {accountState.authenticated ? (
          <div className="saved-commute-form">
            <div className="flex items-center justify-between gap-2">
              <strong>{accountState.user?.demo ? "Demo account" : "Saved to account"}</strong>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Impact matching pending</span>
            </div>
            <input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Commute label" aria-label="Saved commute label" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select value={originStationId} onChange={(event) => setOriginStationId(event.target.value)} aria-label="Origin station">
                <option value="">Origin station</option>
                {stationOptions.map((station) => <option key={`origin-${station.id}`} value={station.id}>{station.name}</option>)}
              </select>
              <select value={destinationStationId} onChange={(event) => setDestinationStationId(event.target.value)} aria-label="Destination station">
                <option value="">Destination station</option>
                {stationOptions.map((station) => <option key={`destination-${station.id}`} value={station.id}>{station.name}</option>)}
              </select>
            </div>
            <button type="button" onClick={handleCreateCommute} disabled={saving}>Save commute</button>
            {commuteError ? <p className="text-xs font-semibold text-red-600 dark:text-red-300">{commuteError}</p> : null}
            {accountCommutes.map((commute) => (
              <div key={commute.id} className="commute-card ok min-w-0 rounded-lg border border-black/10 border-l-4 border-l-green-500 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="min-w-0 text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{commute.label}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1 whitespace-normal break-words">{commute.routeLabel}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">Impact matching pending.</p>
                  </div>
                  <button type="button" onClick={() => handleDeleteCommute(commute.id)} aria-label={`Delete saved commute ${commute.label}`}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
```

Keep the existing fixture commute cards below this block for signed-out mode and for demo examples. When signed in, hide fixture cards unless `accountCommutes.length === 0`; in that empty state show a small message: `No saved account commutes yet.`

- [ ] **Step 5: Add account CSS**

Append to `frontend/src/app/globals.css`:

```css
.menu-action-row {
  align-items: center;
  border-radius: 8px;
  color: rgb(51, 65, 85);
  display: flex;
  font-size: 0.875rem;
  font-weight: 700;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
  width: 100%;
}

.menu-action-row:hover,
.menu-action-row:focus-visible {
  background: rgba(15, 23, 42, 0.06);
  outline: none;
}

.dark .menu-action-row,
.high-contrast .menu-action-row {
  color: rgb(226, 232, 240);
}

.dark .menu-action-row:hover,
.dark .menu-action-row:focus-visible,
.high-contrast .menu-action-row:hover,
.high-contrast .menu-action-row:focus-visible {
  background: rgba(255, 255, 255, 0.08);
}

.account-action-row {
  display: grid;
  gap: 0.375rem;
}

.account-dialog-backdrop {
  align-items: center;
  background: rgba(2, 6, 23, 0.44);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 1rem;
  position: fixed;
  z-index: 70;
}

.account-dialog {
  background: rgba(248, 250, 252, 0.98);
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.28);
  max-width: 380px;
  overflow: hidden;
  width: 100%;
}

.dark .account-dialog,
.high-contrast .account-dialog {
  background: rgba(15, 23, 42, 0.98);
  border-color: rgba(255, 255, 255, 0.14);
}

.account-field {
  display: grid;
  gap: 0.375rem;
}

.account-field span {
  color: rgb(71, 85, 105);
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}

.dark .account-field span,
.high-contrast .account-field span {
  color: rgb(203, 213, 225);
}

.account-field input,
.saved-commute-form input,
.saved-commute-form select {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 8px;
  color: rgb(15, 23, 42);
  min-height: 40px;
  padding: 0.5rem 0.625rem;
}

.dark .account-field input,
.high-contrast .account-field input,
.dark .saved-commute-form input,
.dark .saved-commute-form select,
.high-contrast .saved-commute-form input,
.high-contrast .saved-commute-form select {
  background: rgba(15, 23, 42, 0.82);
  border-color: rgba(255, 255, 255, 0.14);
  color: rgb(248, 250, 252);
}

.account-primary-button,
.saved-commute-form button,
.saved-commute-account-prompt button {
  border-radius: 8px;
  background: rgb(15, 23, 42);
  color: white;
  font-size: 0.75rem;
  font-weight: 900;
  min-height: 38px;
  padding: 0.5rem 0.75rem;
  text-transform: uppercase;
}

.dark .account-primary-button,
.dark .saved-commute-form button,
.dark .saved-commute-account-prompt button,
.high-contrast .account-primary-button,
.high-contrast .saved-commute-form button,
.high-contrast .saved-commute-account-prompt button {
  background: rgb(226, 232, 240);
  color: rgb(15, 23, 42);
}

.saved-commute-account-prompt,
.saved-commute-form {
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  display: grid;
  gap: 0.625rem;
  padding: 0.75rem;
}

.saved-commute-account-prompt {
  background: rgba(16, 185, 129, 0.08);
}

.saved-commute-form {
  background: rgba(248, 250, 252, 0.88);
}

.dark .saved-commute-account-prompt,
.high-contrast .saved-commute-account-prompt,
.dark .saved-commute-form,
.high-contrast .saved-commute-form {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(15, 23, 42, 0.62);
}
```

- [ ] **Step 6: Update existing drawer layout test expectations**

In `frontend/tests/drawer-layout.test.mjs`, add assertions in the first test:

```js
    assert.match(shellSource, /Demo account/);
    assert.match(shellSource, /Create account/);
    assert.match(shellSource, /Sign in/);
    assert.match(savedCommutesSource, /Impact matching pending/);
```

- [ ] **Step 7: Verify account UI source tests pass**

```bash
npm --prefix frontend exec -- node --test tests/account-ui-source.test.mjs tests/drawer-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit account UI**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/src/components/SavedCommutesPanel.tsx frontend/src/app/globals.css frontend/tests/account-ui-source.test.mjs frontend/tests/drawer-layout.test.mjs
git commit -m "feat(frontend): add account saved commute UI"
```

---

### Task 8: Hamburger Menu Keyboard Behavior

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Create: `frontend/tests/keyboard-accessibility.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Write failing keyboard source test**

Create `frontend/tests/keyboard-accessibility.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const stationSearchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const lineLegendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");

describe("keyboard accessibility source", () => {
  it("manages hamburger menu focus and arrow-key movement", () => {
    assert.match(shellSource, /menuButtonRef/);
    assert.match(shellSource, /menuPanelRef/);
    assert.match(shellSource, /menuActionRefs/);
    assert.match(shellSource, /aria-controls="linewatch-main-menu"/);
    assert.match(shellSource, /aria-expanded=\{activeView === "menu"\}/);
    assert.match(shellSource, /handleMenuKeyDown/);
    assert.match(shellSource, /event\.key === "Escape"/);
    assert.match(shellSource, /event\.key === "ArrowDown"/);
    assert.match(shellSource, /event\.key === "ArrowUp"/);
    assert.match(shellSource, /event\.key === "Home"/);
    assert.match(shellSource, /event\.key === "End"/);
    assert.match(shellSource, /aria-current=\{activeView === "alerts" \? "page" : undefined\}/);
    assert.match(shellSource, /aria-pressed=\{highContrast\}/);
    assert.match(shellSource, /aria-pressed=\{reducedMotion\}/);
  });

  it("keeps station search and legend controls explicitly keyboard accessible", () => {
    assert.match(stationSearchSource, /handleInputKeyDown/);
    assert.match(stationSearchSource, /focusStationSearchItem/);
    assert.match(stationSearchSource, /ArrowDown/);
    assert.match(stationSearchSource, /ArrowUp/);
    assert.match(lineLegendSource, /aria-label=\{`View reduced speed zone for \$\{line\.name\}`\}/);
  });
});
```

- [ ] **Step 2: Run failing keyboard source test**

```bash
npm --prefix frontend exec -- node --test tests/keyboard-accessibility.test.mjs
```

Expected: FAIL because focus refs and handlers do not exist.

- [ ] **Step 3: Add refs and focus helpers to `LineWatchShell`**

Modify import:

```ts
import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
```

Add refs:

```ts
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuActionRefs = useRef<Array<HTMLButtonElement | null>>([]);
```

Add helper:

```ts
  const registerMenuAction = (index: number) => (element: HTMLButtonElement | null) => {
    menuActionRefs.current[index] = element;
  };

  const focusMenuAction = (index: number) => {
    const actions = menuActionRefs.current.filter((element): element is HTMLButtonElement => Boolean(element) && !element.disabled);
    if (actions.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, actions.length - 1));
    actions[nextIndex]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const actions = menuActionRefs.current.filter((element): element is HTMLButtonElement => Boolean(element) && !element.disabled);
    const currentIndex = actions.findIndex((element) => element === document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      setActiveView("map");
      menuButtonRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuAction(currentIndex < 0 ? 0 : (currentIndex + 1) % actions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuAction(currentIndex < 0 ? actions.length - 1 : (currentIndex - 1 + actions.length) % actions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusMenuAction(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusMenuAction(actions.length - 1);
    }
  };
```

Add menu open focus effect:

```ts
  useEffect(() => {
    if (activeView === "menu") {
      const timer = window.setTimeout(() => focusMenuAction(0), 40);
      return () => window.clearTimeout(timer);
    }
  }, [activeView]);
```

- [ ] **Step 4: Add ARIA and refs to menu toggle/panel/actions**

Menu toggle button:

```tsx
          <button
            ref={menuButtonRef}
            onClick={handleToggleMenu}
            className="..."
            aria-label="Toggle menu"
            aria-controls="linewatch-main-menu"
            aria-expanded={activeView === "menu"}
          >
```

Menu panel:

```tsx
          <div
            ref={menuPanelRef}
            id="linewatch-main-menu"
            role="menu"
            onKeyDown={handleMenuKeyDown}
            className={`panel-strong ...`}
            aria-hidden={activeView !== "menu"}
          >
```

Add `ref={registerMenuAction(N)}` and `role="menuitem"` to menu action buttons. Use increasing indexes across account actions, nav actions, and toggles. Examples:

```tsx
                 <button
                   ref={registerMenuAction(10)}
                   role="menuitem"
                   onClick={() => { setActiveView("map"); setSelection(null); }}
                   aria-current={activeView === "map" ? "page" : undefined}
                   className="..."
                 >
```

For high contrast and reduced motion toggles:

```tsx
                   <button
                      ref={registerMenuAction(30)}
                      role="menuitem"
                      aria-pressed={highContrast}
                      aria-label="Toggle high contrast mode"
                      onClick={() => setHighContrast(!highContrast)}
                      className="..."
                   >
```

```tsx
                   <button
                      ref={registerMenuAction(31)}
                      role="menuitem"
                      aria-pressed={reducedMotion}
                      aria-label="Toggle reduced motion"
                      onClick={() => setReducedMotion(!reducedMotion)}
                      className="..."
                   >
```

- [ ] **Step 5: Add smoke test for keyboard menu**

In `frontend/tests/smoke/dashboard.spec.ts`, add:

```ts
test("keyboard opens and closes the main menu", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toBeFocused();
});
```

- [ ] **Step 6: Verify menu keyboard tests pass**

```bash
npm --prefix frontend exec -- node --test tests/keyboard-accessibility.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit menu keyboard work**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/tests/keyboard-accessibility.test.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "feat(frontend): improve menu keyboard navigation"
```

---

### Task 9: Station Search Keyboard Behavior

**Files:**
- Modify: `frontend/src/components/StationSearchPanel.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/keyboard-accessibility.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Extend failing station search keyboard source test**

In `frontend/tests/keyboard-accessibility.test.mjs`, add assertions:

```js
  it("returns focus from station search and supports result cycling", () => {
    assert.match(shellSource, /searchButtonRef/);
    assert.match(shellSource, /aria-controls="station-search-panel"/);
    assert.match(shellSource, /onClosedFocusTarget/);
    assert.match(stationSearchSource, /resultButtonRefs/);
    assert.match(stationSearchSource, /lineTriggerRefs/);
    assert.match(stationSearchSource, /stationButtonRefs/);
    assert.match(stationSearchSource, /handleResultKeyDown/);
    assert.match(stationSearchSource, /handleLineTriggerKeyDown/);
    assert.match(stationSearchSource, /handleStationButtonKeyDown/);
  });
```

- [ ] **Step 2: Run failing station search keyboard source test**

```bash
npm --prefix frontend exec -- node --test tests/keyboard-accessibility.test.mjs
```

Expected: FAIL because the new focus refs/props are not present.

- [ ] **Step 3: Add search button ref and return-focus prop in `LineWatchShell`**

Add ref:

```ts
  const searchButtonRef = useRef<HTMLButtonElement>(null);
```

Update search toggle:

```tsx
          <button
            ref={searchButtonRef}
            onClick={handleToggleSearch}
            className="..."
            aria-label="Search stations"
            aria-controls="station-search-panel"
            aria-expanded={activeView === "search"}
          >
```

Update `StationSearchPanel` call:

```tsx
          <StationSearchPanel
            open={activeView === "search"}
            stations={stationSummaries}
            selectedStationId={selectedStationId}
            onSelectStation={(id) => handleSelectStationId(id)}
            onClose={() => setActiveView("map")}
            onClosedFocusTarget={() => searchButtonRef.current?.focus()}
          />
```

- [ ] **Step 4: Update station search props and refs**

In `frontend/src/components/StationSearchPanel.tsx`, update props:

```ts
type Props = {
  open: boolean;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  onClose: () => void;
  onClosedFocusTarget?: () => void;
};
```

Update component signature:

```ts
export function StationSearchPanel({ open, stations, selectedStationId, onSelectStation, onClose, onClosedFocusTarget }: Props) {
```

Add refs:

```ts
  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lineTriggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stationButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
```

Change `StationButton` props:

```ts
function StationButton({
  station,
  selected,
  onSelect,
  buttonRef,
  onKeyDown,
}: {
  station: StationSummary;
  selected: boolean;
  onSelect: (stationId: string) => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
```

Add to its `<button>`:

```tsx
      ref={buttonRef}
      onKeyDown={onKeyDown}
```

Add focus helper:

```ts
  function focusItem(refs: React.MutableRefObject<Array<HTMLButtonElement | null>>, index: number) {
    const buttons = refs.current.filter((button): button is HTMLButtonElement => Boolean(button));
    if (buttons.length === 0) return;
    buttons[((index % buttons.length) + buttons.length) % buttons.length]?.focus();
  }
```

If TypeScript requires `React.MutableRefObject`, import `MutableRefObject`:

```ts
import type { KeyboardEvent, MutableRefObject } from "react";
```

Then use `MutableRefObject<Array<HTMLButtonElement | null>>` in the helper.

- [ ] **Step 5: Add input/result/browse key handlers**

Rename existing `handleKeyDown` to `handleInputKeyDown`. Keep Escape/Enter behavior and add ArrowDown:

```ts
  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query.trim()) {
        setQuery("");
      } else {
        onClose();
        onClosedFocusTarget?.();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (query.trim()) {
        focusItem(resultButtonRefs, 0);
      } else {
        focusItem(lineTriggerRefs, 0);
      }
      return;
    }

    if (event.key === "Enter" && query.trim() && results[0]) {
      event.preventDefault();
      chooseStation(results[0].station.id);
    }
  }
```

Update input:

```tsx
          onKeyDown={handleInputKeyDown}
```

Update clear/close button:

```tsx
          onClick={() => {
            if (query) {
              setQuery("");
            } else {
              onClose();
              onClosedFocusTarget?.();
            }
          }}
```

Update `chooseStation`:

```ts
  function chooseStation(stationId: string) {
    onSelectStation(stationId);
    onClose();
    onClosedFocusTarget?.();
  }
```

Add result handler:

```ts
  function handleResultKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      onClosedFocusTarget?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(resultButtonRefs, index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        inputRef.current?.focus();
      } else {
        focusItem(resultButtonRefs, index - 1);
      }
    }
  }
```

Add line/station browse handlers:

```ts
  function handleLineTriggerKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      onClosedFocusTarget?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(lineTriggerRefs, index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        inputRef.current?.focus();
      } else {
        focusItem(lineTriggerRefs, index - 1);
      }
      return;
    }
    if (event.key === "ArrowRight" && !expandedLineId) {
      event.preventDefault();
      setExpandedLineId(lineGroups[index]?.line.id ?? null);
      window.setTimeout(() => focusItem(stationButtonRefs, 0), 0);
    }
  }

  function handleStationButtonKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      onClosedFocusTarget?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(stationButtonRefs, index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) {
        focusItem(lineTriggerRefs, Math.max(0, lineGroups.findIndex((group) => group.line.id === activeLineGroup?.line.id)));
      } else {
        focusItem(stationButtonRefs, index - 1);
      }
    }
  }
```

When rendering result `StationButton`, pass refs:

```tsx
              results.map((result, index) => (
                <StationButton
                   key={result.station.id}
                   station={result.station}
                   selected={selectedStationId === result.station.id}
                   onSelect={chooseStation}
                   buttonRef={(element) => { resultButtonRefs.current[index] = element; }}
                   onKeyDown={(event) => handleResultKeyDown(index, event)}
                />
              ))
```

When rendering line triggers:

```tsx
                      ref={(element) => { lineTriggerRefs.current[index] = element; }}
                      onKeyDown={(event) => handleLineTriggerKeyDown(index, event)}
```

When rendering station list:

```tsx
                    {activeLineGroup.stations.map((station, index) => (
                      <StationButton
                        key={`${activeLineGroup.line.id}-${station.id}`}
                        station={station}
                        selected={selectedStationId === station.id}
                        onSelect={chooseStation}
                        buttonRef={(element) => { stationButtonRefs.current[index] = element; }}
                        onKeyDown={(event) => handleStationButtonKeyDown(index, event)}
                      />
                    ))}
```

Set panel id:

```tsx
      id="station-search-panel"
```

- [ ] **Step 6: Add smoke test for station search keyboard**

In `frontend/tests/smoke/dashboard.spec.ts`, add:

```ts
test("keyboard searches and selects a station", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Search stations" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search mapped stations" })).toBeFocused();

  await page.keyboard.type("Stub");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search stations" })).toBeFocused();
});
```

- [ ] **Step 7: Verify station search source test passes**

```bash
npm --prefix frontend exec -- node --test tests/keyboard-accessibility.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit station search keyboard work**

```bash
git add frontend/src/components/StationSearchPanel.tsx frontend/src/components/LineWatchShell.tsx frontend/tests/keyboard-accessibility.test.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "feat(frontend): improve station search keyboard navigation"
```

---

### Task 10: Reduced Speed Zone Mint Color Migration

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/LineLegend.tsx`
- Modify: `frontend/src/components/StationDetailPanel.tsx`
- Create: `frontend/tests/rsz-color.test.mjs`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Write failing RSZ color test**

Create `frontend/tests/rsz-color.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const rszPanelSource = readFileSync(new URL("../src/components/ReducedSpeedZonesPanel.tsx", import.meta.url), "utf8");
const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const legendSource = readFileSync(new URL("../src/components/LineLegend.tsx", import.meta.url), "utf8");
const stationDetailSource = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");

describe("Reduced Speed Zone mint color", () => {
  it("defines shared mint tokens and applies them to reduced-speed-zone selectors", () => {
    assert.match(globalCss, /--impact-rsz:\s*#A6FBB2;/);
    assert.match(globalCss, /--impact-rsz-ink:\s*#14532d;/);
    assert.match(globalCss, /\.asset-alert-path-glow\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.rsz-chevron\s*\{[^}]*stroke:\s*var\(--impact-rsz-ink\)/s);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.impact-type-icon\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.overlap-impact-ref\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz-border\)/s);
  });

  it("keeps delays amber while RSZ references use mint classes or tokens", () => {
    assert.match(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*#f59e0b/s);
    assert.match(mapSource, /RSZ_IMPACT_COLOR/);
    assert.match(rszPanelSource, /rsz-tone/);
    assert.match(shellSource, /rsz-tone/);
    assert.match(legendSource, /legend-rsz-button/);
    assert.match(stationDetailSource, /rsz-tone/);
    assert.doesNotMatch(rszPanelSource, /border-l-amber-500/);
    assert.doesNotMatch(rszPanelSource, /!bg-amber-50/);
  });
});
```

- [ ] **Step 2: Run failing RSZ color test**

```bash
npm --prefix frontend exec -- node --test tests/rsz-color.test.mjs
```

Expected: FAIL because RSZ tokens/classes are not present.

- [ ] **Step 3: Add shared CSS tokens and RSZ classes**

In `frontend/src/app/globals.css`, add tokens inside the top-level `:root` block. If there is no existing `:root`, create one near the top:

```css
:root {
  --impact-rsz: #A6FBB2;
  --impact-rsz-ink: #14532d;
  --impact-rsz-soft: rgba(166, 251, 178, 0.14);
  --impact-rsz-border: rgba(166, 251, 178, 0.55);
  --impact-rsz-active: rgba(166, 251, 178, 0.22);
}
```

Split RSZ from delay in overlay CSS:

```css
.asset-alert-path-glow.delay {
  stroke: rgba(245, 158, 11, 0.7);
  animation: aura-pulse 1.2s infinite alternate ease-in-out;
}

.asset-alert-path-glow.reduced-speed-zone {
  stroke: var(--impact-rsz);
  animation: aura-pulse 1.2s infinite alternate ease-in-out;
}
```

Update `.rsz-chevron`:

```css
.rsz-chevron {
  fill: none;
  stroke: var(--impact-rsz-ink);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

Update overlap and icon selectors:

```css
.overlap-indicator-badge.reduced-speed-zone {
  fill: var(--impact-rsz-soft);
  stroke: var(--impact-rsz);
}

.impact-type-icon.reduced-speed-zone {
  color: var(--impact-rsz);
}

.overlap-indicator-type-icon.reduced-speed-zone {
  color: var(--impact-rsz);
}

.overlap-impact-ref.reduced-speed-zone {
  border-color: var(--impact-rsz-border);
  background: var(--impact-rsz-soft);
}

.dark .overlap-impact-ref.reduced-speed-zone,
.high-contrast .overlap-impact-ref.reduced-speed-zone {
  background: rgba(20, 83, 45, 0.32);
}
```

Add utility classes:

```css
.rsz-tone {
  color: var(--impact-rsz-ink);
}

.dark .rsz-tone,
.high-contrast .rsz-tone {
  color: var(--impact-rsz);
}

.rsz-count-badge {
  background: var(--impact-rsz-soft);
  color: var(--impact-rsz-ink);
}

.dark .rsz-count-badge,
.high-contrast .rsz-count-badge {
  color: var(--impact-rsz);
}

.rsz-card-border {
  border-left-color: var(--impact-rsz);
}

.rsz-card-active {
  background: var(--impact-rsz-active) !important;
}

.legend-rsz-button {
  color: var(--impact-rsz-ink);
  border-color: var(--impact-rsz-border);
}

.legend-rsz-button:hover,
.legend-rsz-button:focus-visible {
  background: var(--impact-rsz-soft);
}

.dark .legend-rsz-button,
.high-contrast .legend-rsz-button {
  color: var(--impact-rsz);
}
```

- [ ] **Step 4: Update map hard-coded chevron color**

In `frontend/src/components/InteractiveTtcMap.tsx`, add near constants:

```ts
const RSZ_IMPACT_COLOR = "#A6FBB2";
```

Replace:

```ts
  const chevronBg = "#f59e0b";
```

with:

```ts
  const chevronBg = RSZ_IMPACT_COLOR;
```

- [ ] **Step 5: Update RSZ panel classes**

In `frontend/src/components/ReducedSpeedZonesPanel.tsx`, replace:

```tsx
<Construction className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-amber-500 shrink-0" />
```

with:

```tsx
<Construction className="rsz-tone w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] shrink-0" />
```

Replace count badge class:

```tsx
className="rsz-count-badge shrink-0 text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold"
```

Replace card classes:

```tsx
className={`alert-card rsz-card-border min-w-0 w-full text-left p-3 rounded-lg border border-black/10 dark:border-white/10 border-l-4 !bg-slate-50 dark:!bg-[#12151c] transition-all ${
  isActive ? "rsz-card-active" : ""
}`}
```

- [ ] **Step 6: Update menu, legend, and station detail RSZ classes**

In `frontend/src/components/LineWatchShell.tsx`, replace the RSZ menu badge:

```tsx
<span className="flex h-5 items-center justify-center rounded-full rsz-count-badge px-2 text-[10px] font-bold">
```

Replace line-status RSZ icon:

```tsx
{hasRSZ && <Construction size={14} className="rsz-tone" />}
```

In `frontend/src/components/LineLegend.tsx`, replace the RSZ button class with:

```tsx
className="legend-rsz-button pointer-events-auto cursor-pointer bg-white/95 dark:bg-[#12151c] p-2 rounded-full shadow-lg border hover:scale-110 transition-all"
aria-label={`View reduced speed zone for ${line.name}`}
```

Also add `aria-label` to the alert, delay, and closure legend buttons:

```tsx
aria-label={`View alert for ${line.name}`}
aria-label={`View delay for ${line.name}`}
aria-label={`View closure for ${line.name}`}
```

In `frontend/src/components/StationDetailPanel.tsx`, update the reduced-speed-zone icon and card tone branches:

```tsx
return <Construction size={14} className="rsz-tone shrink-0" />;
```

Where reduced-speed-zone impact card tone currently returns amber classes, return:

```ts
return `${base} border-[var(--impact-rsz-border)] bg-[var(--impact-rsz-soft)]`;
```

Where reduced-speed-zone title class currently returns amber text, return:

```ts
return "rsz-tone block";
```

- [ ] **Step 7: Update map-layering test expectations**

In `frontend/tests/map-layering.test.mjs`, keep delay amber assertions and add RSZ mint assertions:

```js
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.overlap-indicator-type-icon\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(interactiveMapSource, /const RSZ_IMPACT_COLOR = "#A6FBB2";/);
```

Remove any expectation that RSZ uses `#f59e0b`.

- [ ] **Step 8: Verify RSZ color tests pass**

```bash
npm --prefix frontend exec -- node --test tests/rsz-color.test.mjs tests/map-layering.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit RSZ recolor**

```bash
git add frontend/src/app/globals.css frontend/src/components/InteractiveTtcMap.tsx frontend/src/components/ReducedSpeedZonesPanel.tsx frontend/src/components/LineWatchShell.tsx frontend/src/components/LineLegend.tsx frontend/src/components/StationDetailPanel.tsx frontend/tests/rsz-color.test.mjs frontend/tests/map-layering.test.mjs
git commit -m "feat(frontend): recolor reduced speed zones mint"
```

---

### Task 11: Smoke Stub Account Endpoints And Browser Smoke Coverage

**Files:**
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Write failing smoke test for demo account**

In `frontend/tests/smoke/dashboard.spec.ts`, add:

```ts
test("demo account shows account-backed saved commutes", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await openDashboardMenu(page);

  await page.getByRole("button", { name: "Demo account" }).click();
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("button", { name: "Saved Commutes" }).click();

  await expect(page.getByText("Demo account")).toBeVisible();
  await expect(page.getByText("Saved to account")).toBeVisible();
  await expect(page.getByText("Finch -> Union")).toBeVisible();
  await expect(page.getByText("Impact matching pending")).toBeVisible();
});
```

- [ ] **Step 2: Run failing smoke test**

```bash
npm --prefix frontend run test:smoke -- --grep "demo account"
```

Expected: FAIL because smoke stub has no `/api/auth/demo`, `/api/auth/me`, or `/api/account/commutes`.

- [ ] **Step 3: Update smoke stub CORS helpers**

In `frontend/tests/smoke/api-stub.mjs`, change `sendJson` to accept headers and echo credentialed origins:

```js
function corsHeaders(request, extra = {}) {
  const origin = request.headers.origin;
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    ...extra,
  };
}

function sendJson(request, response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(request, extraHeaders),
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}
```

Update all existing calls from:

```js
sendJson(response, 200, mapResponse);
```

to:

```js
sendJson(request, response, 200, mapResponse);
```

Update the OPTIONS block:

```js
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }
```

- [ ] **Step 4: Add in-memory account stub routes**

In `frontend/tests/smoke/api-stub.mjs`, add top-level state:

```js
let demoSessionActive = false;

const demoUser = {
  id: "user_demo",
  email: "demo@linewatch.local",
  displayName: "Demo Rider",
  demo: true,
};

const demoCommutes = [
  {
    id: "commute_demo_finch_union",
    label: "Morning commute",
    originStationId: "finch",
    originStationName: "Finch",
    destinationStationId: "union",
    destinationStationName: "Union",
    routeLabel: "Finch -> Union",
    createdAt: "2026-06-05T14:30:00Z",
    updatedAt: "2026-06-05T14:30:00Z",
  },
];
```

Add routes before public dashboard routes:

```js
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    sendJson(request, response, 200, demoSessionActive
      ? { authenticated: true, user: demoUser }
      : { authenticated: false, user: null }
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/demo") {
    demoSessionActive = true;
    sendJson(request, response, 200, { authenticated: true, user: demoUser }, {
      "set-cookie": "linewatch_session=smoke-demo-session; Path=/; HttpOnly; SameSite=Lax",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    demoSessionActive = false;
    sendJson(request, response, 200, { authenticated: false, user: null }, {
      "set-cookie": "linewatch_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/account/commutes") {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use saved commute preferences." });
      return;
    }
    sendJson(request, response, 200, { commutes: demoCommutes });
    return;
  }
```

- [ ] **Step 5: Verify smoke demo account test passes**

```bash
npm --prefix frontend run test:smoke -- --grep "demo account"
```

Expected: PASS.

- [ ] **Step 6: Commit smoke account coverage**

```bash
git add frontend/tests/smoke/api-stub.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "test(frontend): cover demo account smoke flow"
```

---

### Task 12: Documentation And Agent Instructions

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README current status**

In `README.md`, add implemented account bullets only after the code exists and tests pass:

```md
- Backend-owned email/password account slice for saved commute preferences.
- HTTP-only session-cookie auth with BCrypt password hashing.
- Demo account flow for portfolio reviewers.
- Account-owned saved commute preferences with conservative impact labeling.
- Keyboard-friendly hamburger menu and station search flows.
- Reduced Speed Zones use Light Mint Green `#A6FBB2` across map, cards, legend, and overlap indicators.
```

In the current backend scope table, add:

```md
| `POST` | `/api/auth/register` | Create an account for saved commute preferences. |
| `POST` | `/api/auth/login` | Start an HTTP-only session-cookie login. |
| `POST` | `/api/auth/demo` | Start a seeded demo account session for portfolio review. |
| `POST` | `/api/auth/logout` | End the current account session. |
| `GET` | `/api/auth/me` | Return the current account session state. |
| `GET/POST/DELETE` | `/api/account/commutes` | Manage account-owned saved commute preferences. |
```

Move `User accounts and passwords` out of the out-of-scope list. Replace it with:

```md
- Production account recovery, OAuth, email verification, and notifications.
```

Keep `Backend commute-impact endpoint` in planned scope unless the implementation actually completes that endpoint.

- [ ] **Step 2: Update AGENTS.md and GEMINI.md together**

In both files, add current reality bullets:

```md
- The app includes a scoped account system for saved commute preferences only.
- Account auth uses backend-owned email/password records, BCrypt hashes, HTTP-only session cookies, and a demo account path for portfolio review.
- Saved commute preferences are account-backed, but full production commute-impact matching remains planned unless implemented separately.
- Reduced Speed Zones use Light Mint Green `#A6FBB2` throughout the frontend.
- The hamburger menu and station search are intentionally keyboard-friendly with Escape close behavior, focus return, and arrow-key movement.
```

Update out-of-scope/guardrail language:

```md
Do not claim OAuth, password reset, email verification, push/email notifications, or full commute-impact matching.
```

- [ ] **Step 3: Run docs alignment checks**

```bash
rg -n "User accounts and passwords|Reduced Speed Zone|#A6FBB2|OAuth|password reset|full commute-impact" README.md AGENTS.md GEMINI.md
```

Expected: README/AGENTS/GEMINI mention the scoped account slice and do not claim OAuth/password reset/full commute-impact matching as implemented.

- [ ] **Step 4: Commit docs**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document account and rsz polish"
```

---

### Task 13: Full Verification And Final Cleanup

**Files:**
- No planned edits. This task verifies the whole slice.

- [ ] **Step 1: Check working tree**

```bash
git status --short
```

Expected: clean, or only intentional uncommitted files from the current task. Do not revert unrelated user files.

- [ ] **Step 2: Run frontend fixture tests**

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Run frontend smoke tests**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If Playwright browser dependencies are missing, report the exact error and run `npm --prefix frontend run test:smoke:install` only with user approval if the environment requires network or external writes.

- [ ] **Step 7: Run backend tests**

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 8: Inspect final diff**

```bash
git diff --stat HEAD
git status --short
```

Expected: no uncommitted changes if every task committed. If changes remain, inspect them with `git diff` and `git status --short`; commit only explicit paths that belong to this slice, and leave unrelated user files untouched.

- [ ] **Step 9: Final implementation summary**

Report:

```text
Implemented:
- Scoped saved-commute account auth with HTTP-only sessions and BCrypt password hashing.
- Account-aware Saved Commutes UI with demo account path.
- Keyboard-friendly hamburger menu and station search flows.
- Reduced Speed Zone mint color migration to #A6FBB2.
- Documentation updates aligned with implemented behavior.

Verification:
- npm --prefix frontend run test:fixtures
- npm --prefix frontend run typecheck
- npm --prefix frontend run lint
- npm --prefix frontend run build
- npm --prefix frontend run test:smoke
- mvn -f backend/pom.xml test
```

If any command fails, include the exact command, exit reason, and the most relevant error lines.

---

## Self-Review Checklist For The Implementer

- Public dashboard APIs still work signed out.
- No OAuth, password reset, email verification, JWT, notification, or full commute-impact claims were added.
- `linewatch_session` is HTTP-only and server sessions store only token hashes.
- Demo account is clearly labeled as demo.
- Account saved commutes do not overclaim accurate route impact matching.
- Reduced Speed Zones are visually distinct from delays everywhere.
- Menu/search keyboard flows return focus to their trigger controls after closing.
- `AGENTS.md` and `GEMINI.md` were updated together.
- All relevant verification commands were run and read.
