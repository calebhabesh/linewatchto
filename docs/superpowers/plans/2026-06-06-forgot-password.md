# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple, testable password-reset flow to the existing LineWatchTO account dialog, starting from a `Forgot password?` action on the Sign In view.

**Architecture:** Add short-lived password-reset tokens to the Spring account backend, expose request/confirm auth endpoints, and keep the UI inside the existing account dialog rather than adding a new page. The request endpoint must return neutral copy so the UI does not reveal whether an email exists; a development-only reset token/link can be returned when explicitly enabled so local demos remain testable without email infrastructure.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway, BCrypt via existing `PasswordHasher`, Next.js App Router, React, TypeScript, Node built-in test runner, Playwright smoke tests.

---

## Gemini 3.5 Flash High Handoff Prompt

Use this exact prompt if starting a fresh Gemini session:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatchTO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, and docs/superpowers/plans/2026-06-06-forgot-password.md before editing. Implement the plan task-by-task using TDD. Preserve existing user changes, do not revert unrelated dirty files, do not claim live TTC status unless fresh ingestion is active, and run the verification commands at the end before saying work is complete.
```

## Current State

- The account dialog is embedded in `frontend/src/components/LineWatchShell.tsx`.
- `accountDialogMode` currently supports `"login" | "register" | null`.
- The sign-in dialog has Email, Password, and Sign in controls only.
- Frontend account API helpers live in `frontend/src/app/account-data.ts`.
- Backend auth endpoints are in `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`.
- Backend account behavior is in `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`.
- Account persistence exists via `accounts`, `user_sessions`, and `saved_commutes` from `backend/src/main/resources/db/migration/V18__account_auth_and_saved_commutes.sql`.
- Sessions already behave like “remember me” by default: `AccountService.SESSION_TTL` is 14 days and `AuthCookieFactory` writes a persistent HttpOnly cookie.

## Target UX

- On Sign in, show a small `Forgot password?` text button directly below the password field and above the primary action.
- Clicking it switches the same dialog to `Reset password`.
- The reset-request view asks for Email and has actions:
  - `Send reset link`
  - `Back to sign in`
- After request, show neutral success copy:
  - `If an account exists for that email, a password reset link is available.`
- In local/dev mode, if the backend returns a `devResetToken`, show a compact development-only action:
  - `Open reset form`
- The reset-confirm view asks for:
  - Reset token
  - New password
  - Confirm password
- Successful reset should sign the user in by setting the normal session cookie and closing the dialog.
- Do not add a marketing page or separate landing flow.

## Security And Scope

- Do not send real email in this slice.
- Do not reveal account existence in user-facing copy.
- Token TTL: 30 minutes.
- Store only token hashes, never raw reset tokens.
- Mark tokens used after successful reset.
- Invalidate existing sessions for the account after password reset.
- Return development reset tokens only when a backend property enables it. Suggested property:
  - `linewatch.auth.password-reset.dev-links=true` for local/dev.
  - Keep default `false` if you prefer stricter production-safe behavior; tests can instantiate the service with `true`.

## File Structure

- Create `backend/src/main/resources/db/migration/V19__password_reset_tokens.sql`
  - Owns the password-reset token table and indexes.
- Create `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenEntity.java`
  - JPA entity for hashed reset tokens.
- Create `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenRepository.java`
  - Lookup by token hash and cleanup/delete helpers.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`
  - Add a method to replace the stored password hash.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionRepository.java`
  - Add account session invalidation for reset.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
  - Add request/confirm reset service methods and records.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
  - Add request/confirm endpoints.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`
  - Assert the migration contains the reset-token schema.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`
  - Add request/confirm reset service coverage.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`
  - Add endpoint and cookie coverage.
- Modify `frontend/src/app/account-data.ts`
  - Add password-reset request and confirm API helpers.
- Modify `frontend/src/components/LineWatchShell.tsx`
  - Add dialog modes and UI.
- Modify `frontend/src/app/globals.css`
  - Add compact account link/status styling.
- Modify `frontend/tests/account-data.test.mjs`
  - Add adapter tests.
- Modify `frontend/tests/account-ui-source.test.mjs`
  - Add source-level UI guardrails.
- Modify `frontend/tests/smoke/api-stub.mjs`
  - Stub reset request and confirm endpoints.
- Modify `frontend/tests/smoke/dashboard.spec.ts`
  - Add a browser smoke path for forgot password.

---

### Task 1: Schema, Entity, And Repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__password_reset_tokens.sql`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionRepository.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`

- [ ] **Step 1: Write the failing migration test**

Add this test to `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`:

```java
@Test
void passwordResetMigrationStoresOnlyHashedTokens() throws Exception {
    String sql = Files.readString(Path.of("src/main/resources/db/migration/V19__password_reset_tokens.sql"));

    assertThat(sql).contains("create table password_reset_tokens");
    assertThat(sql).contains("token_hash varchar(64) not null unique");
    assertThat(sql).contains("account_id varchar(80) not null references accounts(id) on delete cascade");
    assertThat(sql).contains("expires_at timestamp with time zone not null");
    assertThat(sql).contains("used_at timestamp with time zone");
    assertThat(sql).contains("idx_password_reset_tokens_account_id");
    assertThat(sql).contains("idx_password_reset_tokens_expires_at");
    assertThat(sql).doesNotContain("raw_token");
}
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountSchemaMigrationTest#passwordResetMigrationStoresOnlyHashedTokens test
```

Expected: failure because `V19__password_reset_tokens.sql` does not exist yet.

- [ ] **Step 3: Add the Flyway migration**

Create `backend/src/main/resources/db/migration/V19__password_reset_tokens.sql`:

```sql
create table password_reset_tokens (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    token_hash varchar(64) not null unique,
    requested_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    used_at timestamp with time zone
);

create index idx_password_reset_tokens_account_id
    on password_reset_tokens(account_id);

create index idx_password_reset_tokens_expires_at
    on password_reset_tokens(expires_at);
```

- [ ] **Step 4: Add the password reset token entity**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenEntity.java`:

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
@Table(name = "password_reset_tokens")
public class PasswordResetTokenEntity {
    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    @Column(name = "token_hash")
    private String tokenHash;
    @Column(name = "requested_at")
    private Instant requestedAt;
    @Column(name = "expires_at")
    private Instant expiresAt;
    @Column(name = "used_at")
    private Instant usedAt;

    protected PasswordResetTokenEntity() {}

    private PasswordResetTokenEntity(String id, AccountEntity account, String tokenHash, Instant requestedAt, Instant expiresAt) {
        this.id = id;
        this.account = account;
        this.tokenHash = tokenHash;
        this.requestedAt = requestedAt;
        this.expiresAt = expiresAt;
        this.usedAt = null;
    }

    public static PasswordResetTokenEntity create(String id, AccountEntity account, String tokenHash, Instant requestedAt, Instant expiresAt) {
        return new PasswordResetTokenEntity(id, account, tokenHash, requestedAt, expiresAt);
    }

    public void markUsed(Instant usedAt) {
        this.usedAt = usedAt;
    }

    public boolean isUsableAt(Instant now) {
        return usedAt == null && expiresAt.isAfter(now);
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getTokenHash() { return tokenHash; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public Instant getUsedAt() { return usedAt; }
}
```

- [ ] **Step 5: Add the repository**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenRepository.java`:

```java
package com.calebhabesh.linewatch.account;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetTokenEntity, String> {
    Optional<PasswordResetTokenEntity> findByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from PasswordResetTokenEntity t where t.account.id = :accountId and t.usedAt is null")
    int deleteUnusedByAccountId(String accountId);

    @Modifying
    @Query("delete from PasswordResetTokenEntity t where t.expiresAt < :now")
    int deleteExpiredTokens(Instant now);
}
```

- [ ] **Step 6: Add password replacement to the account entity**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`, add this method below `markLogin`:

```java
public void replacePasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
}
```

- [ ] **Step 7: Add session invalidation by account**

In `backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionRepository.java`, add:

```java
@Modifying
@Query("delete from UserSessionEntity s where s.account.id = :accountId")
int deleteByAccountId(String accountId);
```

- [ ] **Step 8: Run the migration test and verify it passes**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountSchemaMigrationTest test
```

Expected: all `AccountSchemaMigrationTest` tests pass.

- [ ] **Step 9: Commit the schema slice**

```bash
git add backend/src/main/resources/db/migration/V19__password_reset_tokens.sql \
  backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenEntity.java \
  backend/src/main/java/com/calebhabesh/linewatch/account/PasswordResetTokenRepository.java \
  backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java \
  backend/src/main/java/com/calebhabesh/linewatch/account/UserSessionRepository.java \
  backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java
git commit -m "feat: add password reset token persistence"
```

---

### Task 2: Backend Reset Service

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

- [ ] **Step 1: Add failing service tests**

Modify `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`:

Add a mock field:

```java
private final PasswordResetTokenRepository passwordResetTokenRepository = mock(PasswordResetTokenRepository.class);
```

Update service construction to include the new repository and dev-link flag:

```java
private final AccountService service = new AccountService(
    accountRepository,
    sessionRepository,
    passwordResetTokenRepository,
    passwordHasher,
    tokenService,
    clock,
    true
);
```

Add these tests:

```java
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
```

- [ ] **Step 2: Run the service tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: compilation failures for missing repository constructor argument and missing request/confirm records/methods.

- [ ] **Step 3: Update `AccountService` constructor fields**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`, add:

```java
private static final Duration PASSWORD_RESET_TTL = Duration.ofMinutes(30);
private static final String PASSWORD_RESET_MESSAGE = "If an account exists for that email, a password reset link is available.";
```

Add a repository field:

```java
private final PasswordResetTokenRepository passwordResetTokenRepository;
private final boolean passwordResetDevLinks;
```

Update the public constructor:

```java
@Autowired
public AccountService(
    AccountRepository accountRepository,
    UserSessionRepository sessionRepository,
    PasswordResetTokenRepository passwordResetTokenRepository,
    PasswordHasher passwordHasher,
    SessionTokenService tokenService,
    @org.springframework.beans.factory.annotation.Value("${linewatch.auth.password-reset.dev-links:false}") boolean passwordResetDevLinks
) {
    this(accountRepository, sessionRepository, passwordResetTokenRepository, passwordHasher, tokenService, Clock.systemUTC(), passwordResetDevLinks);
}
```

Update the package-private test constructor:

```java
AccountService(
    AccountRepository accountRepository,
    UserSessionRepository sessionRepository,
    PasswordResetTokenRepository passwordResetTokenRepository,
    PasswordHasher passwordHasher,
    SessionTokenService tokenService,
    Clock clock,
    boolean passwordResetDevLinks
) {
    this.accountRepository = accountRepository;
    this.sessionRepository = sessionRepository;
    this.passwordResetTokenRepository = passwordResetTokenRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
    this.clock = clock;
    this.passwordResetDevLinks = passwordResetDevLinks;
}
```

- [ ] **Step 4: Add request password reset service method**

In `AccountService`, add:

```java
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
            passwordResetTokenRepository.save(PasswordResetTokenEntity.create(
                nextId("reset"),
                account,
                token.tokenHash(),
                now,
                expiresAt
            ));
            return new PasswordResetRequestResponse(
                true,
                PASSWORD_RESET_MESSAGE,
                passwordResetDevLinks ? token.rawToken() : null,
                expiresAt
            );
        })
        .orElseGet(() -> new PasswordResetRequestResponse(true, PASSWORD_RESET_MESSAGE, null, null));
}
```

- [ ] **Step 5: Add confirm password reset service method**

In `AccountService`, add:

```java
@Transactional
public AccountResponses.AuthSession confirmPasswordReset(PasswordResetConfirmRequest request) {
    String rawToken = request.token() == null ? "" : request.token().trim();
    if (rawToken.isBlank()) {
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
```

- [ ] **Step 6: Add service records**

At the bottom of `AccountService`, near existing request records, add:

```java
public record PasswordResetRequest(String email) {}
public record PasswordResetConfirmRequest(String token, String password) {}
public record PasswordResetRequestResponse(
    boolean accepted,
    String message,
    String devResetToken,
    Instant expiresAt
) {}
```

- [ ] **Step 7: Update other backend tests that construct AccountService**

Search:

```bash
rg -n "new AccountService\\(" backend/src/test/java
```

For each direct construction, add a mocked `PasswordResetTokenRepository` and `false` or `true` as the final constructor argument. Do not change behavior unrelated to account tests.

- [ ] **Step 8: Run backend account service tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: `AccountServiceTest` passes.

- [ ] **Step 9: Commit the service slice**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java \
  backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java
git commit -m "feat: add password reset service flow"
```

---

### Task 3: Backend Auth Endpoints

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`

- [ ] **Step 1: Add failing controller tests**

Add to `AccountControllerTest`:

```java
@Test
void passwordResetRequestReturnsNeutralMessage() {
    AccountService.PasswordResetRequest request = new AccountService.PasswordResetRequest("rider@example.com");
    AccountService.PasswordResetRequestResponse serviceResponse = new AccountService.PasswordResetRequestResponse(
        true,
        "If an account exists for that email, a password reset link is available.",
        "dev-token",
        Instant.parse("2026-06-05T15:00:00Z")
    );
    when(accountService.requestPasswordReset(request)).thenReturn(serviceResponse);

    ResponseEntity<AccountService.PasswordResetRequestResponse> response = controller.requestPasswordReset(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(serviceResponse);
}

@Test
void passwordResetConfirmSetsSessionCookie() {
    AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false);
    AccountService.PasswordResetConfirmRequest request = new AccountService.PasswordResetConfirmRequest("dev-token", "new correct horse 2");
    when(accountService.confirmPasswordReset(request))
        .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

    ResponseEntity<AccountResponses.AuthResponse> response = controller.confirmPasswordReset(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
    assertThat(response.getHeaders().getFirst("Set-Cookie"))
        .contains("linewatch_session=raw-token")
        .contains("HttpOnly")
        .contains("SameSite=Lax")
        .contains("Path=/");
}
```

- [ ] **Step 2: Run controller tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: compilation failure for missing controller methods.

- [ ] **Step 3: Add controller endpoints**

In `AccountController`, add these methods after `login`:

```java
@PostMapping("/password-reset/request")
public ResponseEntity<AccountService.PasswordResetRequestResponse> requestPasswordReset(
    @RequestBody AccountService.PasswordResetRequest request
) {
    return ResponseEntity.ok(accountService.requestPasswordReset(request));
}

@PostMapping("/password-reset/confirm")
public ResponseEntity<AccountResponses.AuthResponse> confirmPasswordReset(
    @RequestBody AccountService.PasswordResetConfirmRequest request
) {
    return authenticated(accountService.confirmPasswordReset(request));
}
```

- [ ] **Step 4: Run controller tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: `AccountControllerTest` passes.

- [ ] **Step 5: Run all account backend tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest='com.calebhabesh.linewatch.account.*Test' test
```

Expected: all account package tests pass.

- [ ] **Step 6: Commit endpoint slice**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java \
  backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java
git commit -m "feat: expose password reset auth endpoints"
```

---

### Task 4: Frontend Account API Adapter

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/tests/account-data.test.mjs`

- [ ] **Step 1: Add failing adapter tests**

Modify the import in `frontend/tests/account-data.test.mjs` to include:

```js
  confirmPasswordReset,
  requestPasswordReset,
```

Add tests:

```js
it("requests password reset with credentials included", async () => {
  const requests = [];
  const result = await requestPasswordReset(
    { email: "rider@example.com" },
    {
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            accepted: true,
            message: "If an account exists for that email, a password reset link is available.",
            devResetToken: "dev-token",
            expiresAt: "2026-06-05T15:00:00Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    }
  );

  assert.equal(result.accepted, true);
  assert.equal(result.devResetToken, "dev-token");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.credentials, "include");
  assert.equal(requests[0].init.body, JSON.stringify({ email: "rider@example.com" }));
});

it("confirms password reset and returns authenticated user", async () => {
  const requests = [];
  const result = await confirmPasswordReset(
    { token: "dev-token", password: "new correct horse 2" },
    {
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    }
  );

  assert.equal(result.authenticated, true);
  assert.equal(result.user.email, "rider@example.com");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.credentials, "include");
  assert.equal(requests[0].init.body, JSON.stringify({ token: "dev-token", password: "new correct horse 2" }));
});
```

- [ ] **Step 2: Run adapter tests and verify they fail**

Run:

```bash
node --test frontend/tests/account-data.test.mjs
```

Expected: import failure for missing functions.

- [ ] **Step 3: Add reset response/input types**

In `frontend/src/app/account-data.ts`, add after `AuthResponse`:

```ts
export type PasswordResetRequestResponse = {
  accepted: boolean;
  message: string;
  devResetToken?: string | null;
  expiresAt?: string | null;
};
```

- [ ] **Step 4: Add a generic auth JSON request helper**

Replace or supplement `authRequest` with this helper:

```ts
async function authJsonRequest<T>(path: string, init: RequestInit = {}, options: AdapterOptions = {}): Promise<T> {
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
    const error = await readAccountError(response);
    throw new AccountRequestError(response.status, error.message, error.errorCode);
  }
  return readJson<T>(response);
}

async function authRequest(path: string, init: RequestInit = {}, options: AdapterOptions = {}): Promise<AuthResponse> {
  return authJsonRequest<AuthResponse>(path, init, options);
}
```

- [ ] **Step 5: Add frontend reset API functions**

In `frontend/src/app/account-data.ts`, add after `loginAccount`:

```ts
export async function requestPasswordReset(input: { email: string }, options: AdapterOptions = {}) {
  return authJsonRequest<PasswordResetRequestResponse>(
    "/api/auth/password-reset/request",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}

export async function confirmPasswordReset(input: { token: string; password: string }, options: AdapterOptions = {}) {
  return authRequest(
    "/api/auth/password-reset/confirm",
    { method: "POST", body: JSON.stringify(input) },
    options,
  );
}
```

- [ ] **Step 6: Run adapter tests**

Run:

```bash
node --test frontend/tests/account-data.test.mjs
```

Expected: `account-data.test.mjs` passes.

- [ ] **Step 7: Commit adapter slice**

```bash
git add frontend/src/app/account-data.ts frontend/tests/account-data.test.mjs
git commit -m "feat: add password reset account adapter"
```

---

### Task 5: Account Dialog UI

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Add failing source-level UI tests**

In `frontend/tests/account-ui-source.test.mjs`, add:

```js
it("renders forgot-password and reset-password states inside the sign-in dialog", () => {
  assert.match(shellSource, /"forgot-password"/);
  assert.match(shellSource, /"reset-password"/);
  assert.match(shellSource, /Forgot password\?/);
  assert.match(shellSource, /Send reset link/);
  assert.match(shellSource, /Open reset form/);
  assert.match(shellSource, /Reset password/);
  assert.match(shellSource, /Back to sign in/);
  assert.match(shellSource, /requestPasswordReset/);
  assert.match(shellSource, /confirmPasswordReset/);
  assert.match(shellSource, /accountResetToken/);
  assert.match(shellSource, /accountPasswordConfirmation/);
  assert.match(globalCss, /\.account-link-button/);
  assert.match(globalCss, /\.account-reset-status/);
});
```

- [ ] **Step 2: Run UI source tests and verify they fail**

Run:

```bash
node --test frontend/tests/account-ui-source.test.mjs
```

Expected: failure for missing reset strings/functions/classes.

- [ ] **Step 3: Import reset API helpers**

In `frontend/src/components/LineWatchShell.tsx`, update the account-data import to include:

```ts
  confirmPasswordReset,
  requestPasswordReset,
```

- [ ] **Step 4: Widen dialog mode and add state**

Change:

```ts
const [accountDialogMode, setAccountDialogMode] = useState<"login" | "register" | null>(null);
```

to:

```ts
const [accountDialogMode, setAccountDialogMode] = useState<"login" | "register" | "forgot-password" | "reset-password" | null>(null);
```

Add state near the existing account form state:

```ts
const [accountPasswordConfirmation, setAccountPasswordConfirmation] = useState("");
const [accountResetToken, setAccountResetToken] = useState("");
const [accountResetMessage, setAccountResetMessage] = useState<string | null>(null);
const [accountDevResetToken, setAccountDevResetToken] = useState<string | null>(null);
```

- [ ] **Step 5: Reset all account form state**

Update `resetAccountForm`:

```ts
const resetAccountForm = () => {
  setAccountEmail("");
  setAccountPassword("");
  setAccountPasswordConfirmation("");
  setAccountDisplayName("");
  setAccountResetToken("");
  setAccountResetMessage(null);
  setAccountDevResetToken(null);
  setAccountError(null);
};
```

- [ ] **Step 6: Add dialog title helpers**

Add near `resetAccountForm`:

```ts
const accountDialogTitle = () => {
  switch (accountDialogMode) {
    case "register":
      return "Create account";
    case "forgot-password":
      return "Reset password";
    case "reset-password":
      return "Choose new password";
    case "login":
    default:
      return "Sign in";
  }
};

const accountDialogAriaLabel = () => {
  switch (accountDialogMode) {
    case "register":
      return "Create LineWatchTO account";
    case "forgot-password":
      return "Reset LineWatchTO password";
    case "reset-password":
      return "Choose a new LineWatchTO password";
    case "login":
    default:
      return "Sign in to LineWatchTO";
  }
};
```

- [ ] **Step 7: Add reset request handler**

Add near `handleSubmitAccount`:

```ts
const handleRequestPasswordReset = async () => {
  const normalizedEmail = normalizeAccountEmail(accountEmail);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    setAccountError("Enter a valid email address.");
    return;
  }

  setAccountBusy(true);
  setAccountError(null);
  setAccountResetMessage(null);
  setAccountDevResetToken(null);
  try {
    const response = await requestPasswordReset({ email: normalizedEmail });
    setAccountEmail(normalizedEmail);
    setAccountResetMessage(response.message);
    setAccountDevResetToken(response.devResetToken ?? null);
  } catch (error) {
    if (error instanceof AccountRequestError) {
      setAccountError(error.message);
    } else {
      setAccountError("Password reset is unavailable.");
    }
  } finally {
    setAccountBusy(false);
  }
};
```

- [ ] **Step 8: Add reset confirm handler**

Add near `handleRequestPasswordReset`:

```ts
const handleConfirmPasswordReset = async () => {
  if (!accountResetToken.trim()) {
    setAccountError("Enter the reset token.");
    return;
  }
  const validation = validateAccountCredentials({
    mode: "register",
    email: accountEmail || "reset@example.com",
    password: accountPassword,
  });
  if (!validation.valid && validation.message !== "Enter a valid email address.") {
    setAccountError(validation.message);
    return;
  }
  if (accountPassword !== accountPasswordConfirmation) {
    setAccountError("Passwords do not match.");
    return;
  }

  setAccountBusy(true);
  setAccountError(null);
  try {
    const response = await confirmPasswordReset({
      token: accountResetToken.trim(),
      password: accountPassword,
    });
    setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
    setAccountDialogMode(null);
    resetAccountForm();
  } catch (error) {
    if (error instanceof AccountRequestError) {
      setAccountError(error.message);
    } else {
      setAccountError("Could not reset that password.");
    }
  } finally {
    setAccountBusy(false);
  }
};
```

- [ ] **Step 9: Update dialog title and aria label**

Replace:

```tsx
aria-label={accountDialogMode === "login" ? "Sign in to LineWatchTO" : "Create LineWatchTO account"}
```

with:

```tsx
aria-label={accountDialogAriaLabel()}
```

Replace:

```tsx
{accountDialogMode === "login" ? "Sign in" : "Create account"}
```

in the dialog heading with:

```tsx
{accountDialogTitle()}
```

- [ ] **Step 10: Replace dialog body with mode-specific form blocks**

Inside the dialog body `<div className="flex flex-col gap-3 p-3">`, keep the existing register/login fields but wrap them in mode checks. The final structure should be:

```tsx
{accountDialogMode === "forgot-password" ? (
  <>
    <label className="account-field">
      <span>Email</span>
      <input
        type="email"
        value={accountEmail}
        autoComplete="email"
        onBlur={() => setAccountEmail((current) => normalizeAccountEmail(current))}
        onChange={(event) => setAccountEmail(event.target.value)}
      />
    </label>
    {accountResetMessage ? (
      <div className="account-reset-status" role="status">
        <p>{accountResetMessage}</p>
        {accountDevResetToken ? (
          <button
            type="button"
            className="account-link-button"
            onClick={() => {
              setAccountResetToken(accountDevResetToken);
              setAccountPassword("");
              setAccountPasswordConfirmation("");
              setAccountError(null);
              setAccountDialogMode("reset-password");
            }}
          >
            Open reset form
          </button>
        ) : null}
      </div>
    ) : null}
    {accountError ? (
      <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
        {accountError}
      </p>
    ) : null}
    <button type="button" className="account-primary-button" onClick={handleRequestPasswordReset} disabled={accountBusy}>
      Send reset link
    </button>
    <button
      type="button"
      className="account-link-button"
      onClick={() => {
        setAccountError(null);
        setAccountResetMessage(null);
        setAccountDevResetToken(null);
        setAccountDialogMode("login");
      }}
    >
      Back to sign in
    </button>
  </>
) : accountDialogMode === "reset-password" ? (
  <>
    <label className="account-field">
      <span>Reset token</span>
      <input
        value={accountResetToken}
        autoComplete="one-time-code"
        onChange={(event) => setAccountResetToken(event.target.value)}
      />
    </label>
    <label className="account-field">
      <span>New password</span>
      <input
        type="password"
        value={accountPassword}
        autoComplete="new-password"
        aria-describedby="account-password-help"
        onChange={(event) => setAccountPassword(event.target.value)}
      />
    </label>
    <label className="account-field">
      <span>Confirm password</span>
      <input
        type="password"
        value={accountPasswordConfirmation}
        autoComplete="new-password"
        onChange={(event) => setAccountPasswordConfirmation(event.target.value)}
      />
    </label>
    <p id="account-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
      Use at least 8 characters with a letter and a number, symbol, or space.
    </p>
    {accountError ? (
      <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
        {accountError}
      </p>
    ) : null}
    <button type="button" className="account-primary-button" onClick={handleConfirmPasswordReset} disabled={accountBusy}>
      Reset password
    </button>
    <button
      type="button"
      className="account-link-button"
      onClick={() => {
        setAccountError(null);
        setAccountDialogMode("login");
      }}
    >
      Back to sign in
    </button>
  </>
) : (
  <>
    {/* Keep the existing login/register fields here. */}
    {accountDialogMode === "register" ? (
      <label className="account-field">
        <span>Display name</span>
        <input value={accountDisplayName} onChange={(event) => setAccountDisplayName(event.target.value)} />
      </label>
    ) : null}
    <label className="account-field">
      <span>Email</span>
      <input
        type="email"
        value={accountEmail}
        autoComplete="email"
        aria-invalid={Boolean(accountError && accountDialogMode === "register")}
        onBlur={() => setAccountEmail((current) => normalizeAccountEmail(current))}
        onChange={(event) => setAccountEmail(event.target.value)}
      />
    </label>
    <label className="account-field">
      <span>Password</span>
      <input
        type="password"
        value={accountPassword}
        autoComplete={accountDialogMode === "login" ? "current-password" : "new-password"}
        aria-describedby={accountDialogMode === "register" ? "account-password-help" : undefined}
        aria-invalid={Boolean(accountError && accountDialogMode === "register")}
        onChange={(event) => setAccountPassword(event.target.value)}
      />
    </label>
    {accountDialogMode === "login" ? (
      <button
        type="button"
        className="account-link-button justify-self-start"
        onClick={() => {
          setAccountError(null);
          setAccountResetMessage(null);
          setAccountDevResetToken(null);
          setAccountDialogMode("forgot-password");
        }}
      >
        Forgot password?
      </button>
    ) : null}
    {accountDialogMode === "register" ? (
      <p id="account-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        Use at least 8 characters with a letter and a number, symbol, or space.
      </p>
    ) : null}
    {accountError ? (
      <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
        {accountError}
      </p>
    ) : null}
    <button type="button" className="account-primary-button" onClick={handleSubmitAccount} disabled={accountBusy}>
      {accountDialogMode === "login" ? "Sign in" : "Create account"}
    </button>
  </>
)}
```

Do not duplicate `id="account-password-help"` inside one simultaneously rendered branch.

- [ ] **Step 11: Add account reset styling**

In `frontend/src/app/globals.css`, near existing account styles, add:

```css
.account-link-button {
  align-items: center;
  border-radius: 8px;
  color: rgb(37, 99, 235);
  display: inline-flex;
  font-size: 0.75rem;
  font-weight: 800;
  justify-content: center;
  min-height: 32px;
  padding: 0.25rem 0.375rem;
  text-align: left;
  transition: color 0.2s ease, background 0.2s ease;
  width: fit-content;
}

.account-link-button:hover,
.account-link-button:focus-visible {
  background: rgba(37, 99, 235, 0.1);
  color: rgb(29, 78, 216);
}

.dark .account-link-button,
.high-contrast .account-link-button {
  color: rgb(147, 197, 253);
}

.dark .account-link-button:hover,
.dark .account-link-button:focus-visible,
.high-contrast .account-link-button:hover,
.high-contrast .account-link-button:focus-visible {
  background: rgba(147, 197, 253, 0.12);
  color: rgb(191, 219, 254);
}

.account-reset-status {
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.08);
  color: rgb(6, 95, 70);
  display: grid;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.625rem;
}

.dark .account-reset-status,
.high-contrast .account-reset-status {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(52, 211, 153, 0.28);
  color: rgb(167, 243, 208);
}
```

- [ ] **Step 12: Run UI source tests**

Run:

```bash
node --test frontend/tests/account-ui-source.test.mjs
```

Expected: `account-ui-source.test.mjs` passes.

- [ ] **Step 13: Run typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: TypeScript passes. If `validateAccountCredentials` rejects the reset placeholder email path in an unexpected way, adjust the reset validation to check password rules directly in `frontend/src/app/account-validation.ts` with a new exported helper and test it first.

- [ ] **Step 14: Commit UI slice**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/src/app/globals.css frontend/tests/account-ui-source.test.mjs
git commit -m "feat: add forgot password dialog flow"
```

---

### Task 6: Smoke Stub And Browser Flow

**Files:**
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add failing smoke test**

In `frontend/tests/smoke/dashboard.spec.ts`, add to the existing account smoke test or create a new test:

```ts
test("requests and confirms a password reset from the sign-in dialog", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: "Sign in" }).click();

  const signInDialog = page.getByRole("dialog", { name: "Sign in to LineWatchTO" });
  await expect(signInDialog).toBeVisible();
  await signInDialog.getByRole("button", { name: "Forgot password?" }).click();

  const resetDialog = page.getByRole("dialog", { name: "Reset LineWatchTO password" });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByLabel("Email").fill("rider@example.com");
  await resetDialog.getByRole("button", { name: "Send reset link" }).click();
  await expect(resetDialog.getByRole("status")).toContainText("If an account exists");
  await resetDialog.getByRole("button", { name: "Open reset form" }).click();

  const confirmDialog = page.getByRole("dialog", { name: "Choose a new LineWatchTO password" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByLabel("New password").fill("new correct horse 2");
  await confirmDialog.getByLabel("Confirm password").fill("new correct horse 2");
  await confirmDialog.getByRole("button", { name: "Reset password" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(page.getByText("Rider")).toBeVisible();
});
```

- [ ] **Step 2: Run smoke test and verify it fails**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "password reset"
```

Expected: failure because stub endpoints do not exist and UI is not wired if previous tasks are not complete. If local ports `4173` or `4174` are already occupied, stop and report the blocker rather than killing unrelated processes.

- [ ] **Step 3: Add stub endpoints**

In `frontend/tests/smoke/api-stub.mjs`, add handlers near other auth handlers:

```js
if (request.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
  sendJson(request, response, 200, {
    accepted: true,
    message: "If an account exists for that email, a password reset link is available.",
    devResetToken: "smoke-reset-token",
    expiresAt: "2026-06-05T15:00:00Z",
  });
  return;
}

if (request.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
  sendJson(request, response, 200, {
    authenticated: true,
    user: {
      id: "user_1",
      email: "rider@example.com",
      displayName: "Rider",
      demo: false,
    },
  }, {
    "set-cookie": "linewatch_session=smoke-reset-session; Path=/; HttpOnly; SameSite=Lax",
  });
  return;
}
```

Use the existing `sendJson` helper signature. If it does not accept custom headers, extend it with an optional headers parameter:

```js
function sendJson(request, response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": request.headers.origin ?? "*",
    "access-control-allow-credentials": "true",
    ...headers,
  });
  response.end(JSON.stringify(body));
}
```

- [ ] **Step 4: Run the smoke test**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "password reset"
```

Expected: password-reset smoke test passes for desktop and mobile projects. If the full smoke config runs both projects, both should pass.

- [ ] **Step 5: Commit smoke slice**

```bash
git add frontend/tests/smoke/api-stub.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover forgot password browser flow"
```

---

### Task 7: Final Verification And Documentation Check

**Files:**
- Read: `README.md`
- Optional modify: `README.md` only if it already documents account features in a way that should mention password reset.

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
node --test frontend/tests/account-data.test.mjs frontend/tests/account-ui-source.test.mjs frontend/tests/account-validation.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run required frontend checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all commands exit 0. If lint reports pre-existing warnings, record them with exact file/line references.

- [ ] **Step 3: Run focused backend account tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest='com.calebhabesh.linewatch.account.*Test' test
```

Expected: all account tests pass.

- [ ] **Step 4: Run full backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: full backend test suite passes.

- [ ] **Step 5: Run smoke tests if ports are available**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: smoke tests pass. If Playwright reports `127.0.0.1:4173` or `127.0.0.1:4174` is already in use, report the exact error and the output of:

```bash
lsof -i :4173
lsof -i :4174
```

- [ ] **Step 6: Review README claims**

Search:

```bash
rg -n "account|password|sign in|saved commute" README.md
```

If README lists account features, add one conservative bullet:

```markdown
- Account sign-in supports local/dev password reset through a reset-token flow; production email delivery is a future integration point.
```

Do not claim email delivery exists unless an email provider is actually integrated and tested.

- [ ] **Step 7: Final git review**

Run:

```bash
git status --short
git diff --stat
```

Expected: only password-reset-related files changed, plus any pre-existing user changes that were already present before this plan was executed.

- [ ] **Step 8: Final commit**

If README changed:

```bash
git add README.md
git commit -m "docs: document password reset scope"
```

If README did not change, no final docs commit is needed.

## Self-Review Notes

- Requirements covered:
  - Sign-in dialog placement: Task 5.
  - Reset request endpoint: Tasks 2 and 3.
  - Reset confirm endpoint: Tasks 2 and 3.
  - Neutral account-existence copy: Tasks 2 and 5.
  - Dev-testable reset flow without email: Tasks 2, 5, and 6.
  - Existing session invalidation after reset: Task 2.
  - Verification commands: Task 7.
- No production email integration is included. This is intentional for the simple portfolio-friendly slice.
- “Remember Me” is not part of this plan because current auth already sets a persistent 14-day HttpOnly cookie.
