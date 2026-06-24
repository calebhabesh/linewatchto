# Google Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an already signed-in email/password LineWatchTO user explicitly link a verified Google identity to the same account, so future Google sign-ins reuse saved commutes, push preferences, and sessions instead of being blocked.

**Architecture:** Keep the current v1 Google sign-in safety rule: an unauthenticated Google login must not auto-link to an existing password account by email. Add a signed-in linking endpoint that requires the existing `linewatch_session` cookie, verifies a fresh Google ID token, requires the Google email to match the current LineWatch account email, then inserts one `account_auth_identities` row for that existing `accounts.id`. Add a `googleLinked` boolean to authenticated user responses so the frontend can show `Link Google` only when it is useful.

**Tech Stack:** Spring Boot 3.5, Java 21, Spring Data JPA, Flyway-managed PostgreSQL schema already present, existing Google JWT verifier, Next.js App Router, React, TypeScript, existing Google Identity Services button wrapper.

---

## Scope

- Build explicit Google account linking for signed-in non-demo users.
- Do not auto-link during plain Google sign-in.
- Do not create duplicate accounts for same-email password users.
- Do not implement unlinking in this slice.
- Do not allow linking if the Google email differs from the current LineWatch account email.
- Do not allow one LineWatch account to link multiple Google subjects.
- Do not allow one Google subject to link to multiple LineWatch accounts.
- Keep password reset behavior unchanged.

## Current Code Context

Current relevant files:

- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
  - `googleLogin(...)` verifies Google tokens.
  - `createGoogleAccountSession(...)` blocks same-email password accounts with `google_account_link_required`.
  - `requireAccount(...)` already validates the HttpOnly session cookie and returns an `AccountEntity`.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
  - `POST /api/auth/google` exists for Google sign-in.
  - `GET /api/auth/config` exposes Google availability.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityEntity.java`
  - Existing provider identity table entity.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`
  - Currently only finds by `provider` and `providerSubject`.
- `frontend/src/components/LineWatchShell.tsx`
  - Shows account menu, account dialog, and Google sign-in button when configured.
- `frontend/src/components/GoogleSignInButton.tsx`
  - Reusable Google Identity Services button wrapper with `onCredential`.
- `frontend/src/app/account-data.ts`
  - Existing account API adapter.

## File Structure

Backend files to modify:

- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`: add `googleLinked` to `UserResponse`.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`: add account-provider lookup helpers.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`: add `linkGoogle(...)` and include linked status in user responses.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`: add `POST /api/auth/google/link`.
- `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`: cover link success and link conflicts.
- `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`: cover the link endpoint.

Frontend files to modify:

- `frontend/src/app/account-data.ts`: add `googleLinked` to `AccountUser` and `linkGoogleAccount(...)`.
- `frontend/tests/account-data.test.mjs`: cover the link adapter and updated user shape.
- `frontend/src/components/LineWatchShell.tsx`: add `link-google` dialog mode, menu actions, and link handler.
- `frontend/tests/account-ui-source.test.mjs`: cover account-link UI wiring.
- `frontend/src/app/globals.css`: add small status style only if needed by the final JSX.

Docs files to modify:

- `README.md`: document how existing email/password users link Google and why same-email auto-link remains blocked.

## Task 1: Backend User Linked Status Contract

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`

- [ ] **Step 1: Add failing service assertions for linked status**

In `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`, update `registerNormalizesEmailHashesPasswordAndCreatesSession()` by adding:

```java
        assertThat(response.user().googleLinked()).isFalse();
```

Update `googleLoginSignsInExistingGoogleIdentity()` by adding this stub before calling `service.googleLogin(...)`:

```java
        when(authIdentityRepository.existsByAccount_IdAndProvider("user_google", AccountAuthIdentityEntity.PROVIDER_GOOGLE)).thenReturn(true);
```

Then add this assertion:

```java
        assertThat(response.user().googleLinked()).isTrue();
```

- [ ] **Step 2: Run targeted service tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: FAIL because `UserResponse` does not expose `googleLinked()`.

- [ ] **Step 3: Add linked status to the user response**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`, replace:

```java
    public record UserResponse(String id, String email, String displayName, boolean demo) {}
```

with:

```java
    public record UserResponse(String id, String email, String displayName, boolean demo, boolean googleLinked) {}
```

- [ ] **Step 4: Add repository helpers using Spring Data nested property syntax**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`, replace the interface body with:

```java
public interface AccountAuthIdentityRepository extends JpaRepository<AccountAuthIdentityEntity, String> {
    Optional<AccountAuthIdentityEntity> findByProviderAndProviderSubject(String provider, String providerSubject);
    Optional<AccountAuthIdentityEntity> findByAccount_IdAndProvider(String accountId, String provider);
    boolean existsByAccount_IdAndProvider(String accountId, String provider);
}
```

- [ ] **Step 5: Include linked status in AccountService responses**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`, replace `toUserResponse(...)` with:

```java
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
```

- [ ] **Step 6: Update backend test constructors for UserResponse**

In `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`, update every `new AccountResponses.UserResponse(...)` call:

```java
new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false)
```

becomes:

```java
new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false, false)
```

and:

```java
new AccountResponses.UserResponse("user_google", "rider@example.com", "Transit Rider", false)
```

becomes:

```java
new AccountResponses.UserResponse("user_google", "rider@example.com", "Transit Rider", false, true)
```

- [ ] **Step 7: Run targeted backend tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest,AccountControllerTest test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java
git commit -m "feat: expose Google linked account status"
```

## Task 2: Backend Linking Service

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

- [ ] **Step 1: Add failing service tests for explicit linking**

In `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`, add these tests:

```java
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
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: FAIL because `AccountService.linkGoogle(...)` does not exist.

- [ ] **Step 3: Add linkGoogle to AccountService**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`, add this method after `googleLogin(...)`:

```java
    @Transactional
    public AccountResponses.AuthResponse linkGoogle(String rawSessionToken, GoogleLoginRequest request) {
        AccountEntity account = requireAccount(rawSessionToken);
        if (account.isDemo()) {
            throw new AccountException(HttpStatus.CONFLICT, "google_link_demo_account", "Demo accounts cannot link Google sign-in.");
        }

        VerifiedGoogleIdentity googleIdentity = googleIdentityVerifier.verify(request.credential());
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
```

Add these helpers below `createGoogleAccountSession(...)`:

```java
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
```

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java
git commit -m "feat: link Google identity to signed-in account"
```

## Task 3: Backend Link Controller Endpoint

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`

- [ ] **Step 1: Add failing controller test**

In `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`, add:

```java
    @Test
    void googleLinkRequiresSessionCookieAndReturnsUpdatedUser() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_1", "rider@example.com", "Rider", false, true);
        AccountService.GoogleLoginRequest request = new AccountService.GoogleLoginRequest("credential");
        when(accountService.linkGoogle("raw-session", request))
            .thenReturn(new AccountResponses.AuthResponse(true, user));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.linkGoogle(
            "raw-session",
            request,
            requestFrom("203.0.113.50")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        verify(accountService).linkGoogle("raw-session", request);
        verify(rateLimiter).requireAuthAttempt("google-link", "203.0.113.50");
    }
```

- [ ] **Step 2: Run controller test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: FAIL because `AccountController.linkGoogle(...)` does not exist.

- [ ] **Step 3: Add controller endpoint**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`, add this method after `google(...)`:

```java
    @PostMapping("/google/link")
    public ResponseEntity<AccountResponses.AuthResponse> linkGoogle(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody AccountService.GoogleLoginRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("google-link", AccountRateLimiter.clientAddress(httpRequest));
        return ResponseEntity.ok(accountService.linkGoogle(rawSessionToken, request));
    }
```

- [ ] **Step 4: Run controller tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java
git commit -m "feat: expose Google account linking endpoint"
```

## Task 4: Frontend Account Adapter

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/tests/account-data.test.mjs`

- [ ] **Step 1: Add failing adapter test**

In `frontend/tests/account-data.test.mjs`, add `linkGoogleAccount` to the account-data imports.

Add this test near the existing Google auth adapter tests:

```js
  it("posts Google credential to link the current account", async () => {
    const requests = [];
    const result = await linkGoogleAccount(
      { credential: "google-id-token" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false, googleLinked: true },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(result.user.googleLinked, true);
    assert.equal(requests[0].input, "/api/auth/google/link");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({ credential: "google-id-token" }));
  });
```

Also update existing mock authenticated user JSON objects in this file to include:

```js
googleLinked: false
```

Use `googleLinked: true` only for Google-linked account cases.

- [ ] **Step 2: Run adapter tests and verify they fail**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-data.test.mjs
```

Expected: FAIL because `linkGoogleAccount` does not exist and `AccountUser` does not yet expose `googleLinked`.

- [ ] **Step 3: Add googleLinked to AccountUser**

In `frontend/src/app/account-data.ts`, replace:

```ts
export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  demo: boolean;
};
```

with:

```ts
export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  demo: boolean;
  googleLinked: boolean;
};
```

- [ ] **Step 4: Add link adapter**

In `frontend/src/app/account-data.ts`, add this after `loginWithGoogle(...)`:

```ts
export async function linkGoogleAccount(input: { credential: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/google/link", { method: "POST", body: JSON.stringify(input) }, options);
}
```

- [ ] **Step 5: Run adapter tests and verify they pass**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-data.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/account-data.ts frontend/tests/account-data.test.mjs
git commit -m "feat: add Google account link adapter"
```

## Task 5: Frontend Link UI

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/account-ui-source.test.mjs`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add failing source assertions**

In `frontend/tests/account-ui-source.test.mjs`, update the first account UI test with:

```js
    assert.match(shellSource, /linkGoogleAccount/);
    assert.match(shellSource, /"link-google"/);
    assert.match(shellSource, /handleLinkGoogleCredential/);
    assert.match(shellSource, /Link Google/);
    assert.match(shellSource, /Google Linked/);
```

Add this assertion to the compact account styling test:

```js
    assert.match(globalCss, /\.account-linked-status/);
```

- [ ] **Step 2: Run UI source test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
```

Expected: FAIL because the link UI does not exist.

- [ ] **Step 3: Import link adapter and expand dialog mode**

In `frontend/src/components/LineWatchShell.tsx`, add `linkGoogleAccount` to the `../app/account-data` import.

Replace:

```ts
type AccountDialogMode = "login" | "register" | "forgot-password" | "reset-password";
```

with:

```ts
type AccountDialogMode = "login" | "register" | "forgot-password" | "reset-password" | "link-google";
```

- [ ] **Step 4: Add dialog title and aria label**

In `accountDialogTitle()`, add:

```tsx
      case "link-google":
        return "Link Google";
```

In `accountDialogAriaLabel()`, add:

```tsx
      case "link-google":
        return "Link Google sign-in to LineWatchTO account";
```

- [ ] **Step 5: Ensure submit handler ignores link-google mode**

In `handleSubmitAccount`, after the reset-password branch, add:

```tsx
    if (accountDialogMode === "link-google") {
      return;
    }
```

- [ ] **Step 6: Add link handler**

Add this after `handleGoogleCredential`:

```tsx
  const handleLinkGoogleCredential = async (credential: string) => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await linkGoogleAccount({ credential });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountDialogMode(null);
      resetAccountForm();
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Could not link Google sign-in.");
      }
    } finally {
      setAccountBusy(false);
    }
  };
```

- [ ] **Step 7: Add signed-in menu action/status**

In the signed-in account menu block, after the existing `Sign Out` button and before `Saved Commutes`, add:

```tsx
                      {authConfig.googleSignInAvailable && !accountState.user.demo ? (
                        accountState.user.googleLinked ? (
                          <div className="account-linked-status" aria-label="Google sign-in linked">
                            <ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-400" />
                            Google Linked
                          </div>
                        ) : (
                          <button
                            ref={registerMenuAction(actionIndex++)}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              resetAccountForm();
                              setAccountDialogMode("link-google");
                            }}
                            className="menu-action-row"
                            disabled={accountBusy}
                          >
                            <ShieldCheck size={17} className="text-slate-500 dark:text-slate-400" />
                            Link Google
                          </button>
                        )
                      ) : null}
```

`ShieldCheck` is already imported in `LineWatchShell.tsx`; if the import list changed, add it to the existing `lucide-react` import.

- [ ] **Step 8: Render link-google dialog body**

In the account dialog JSX, add this branch before the forgot-password branch:

```tsx
              {accountDialogMode === "link-google" ? (
                <>
                  <p className="account-reset-hint">
                    Link Google sign-in to {accountState.user?.email}. The Google account email must match this LineWatch account.
                  </p>
                  {authConfig.googleSignInAvailable ? (
                    <div aria-label="Link Google">
                      <GoogleSignInButton
                        clientId={authConfig.googleClientId}
                        disabled={accountBusy}
                        onCredential={handleLinkGoogleCredential}
                        onError={setAccountError}
                      />
                    </div>
                  ) : (
                    <p className="account-reset-hint">Google sign-in is not configured for this environment.</p>
                  )}
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setAccountError(null);
                      setAccountDialogMode(null);
                    }}
                  >
                    Back To Account
                  </button>
                </>
              ) : accountDialogMode === "forgot-password" ? (
```

Keep the rest of the existing forgot-password/reset-password/login/register branches unchanged after this insertion.

- [ ] **Step 9: Add linked status style**

In `frontend/src/app/globals.css`, near the account menu/dialog styles, add:

```css
.account-linked-status {
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  padding: 8px 10px;
  color: rgb(21 128 61);
  font-size: 13px;
  font-weight: 800;
}

.dark .account-linked-status {
  color: rgb(134 239 172);
}
```

- [ ] **Step 10: Run UI source test and typecheck**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
npm --prefix frontend run typecheck
```

Expected: both PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/tests/account-ui-source.test.mjs frontend/src/app/globals.css
git commit -m "feat: add Google account linking UI"
```

## Task 6: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README account auth description**

In `README.md`, find the implemented-now bullet that mentions optional Google sign-in. Replace it with:

```markdown
- Account sign-in supports optional Google sign-in when a Google OAuth web client ID is configured, while retaining email/password registration, explicit Google linking for existing password accounts, password reset through emailed reset links when SMTP is configured, local/dev reset-token fallback, and demo login.
```

- [ ] **Step 2: Add account linking note to Google configuration section**

In the existing `Optional Google sign-in configuration` section, after the paragraph that starts `Use a Google OAuth Web application client`, add:

```markdown
Existing email/password accounts are not auto-linked by matching email during Google sign-in. A signed-in user links Google from the account menu, which verifies a fresh Google ID token and requires the Google email to match the current LineWatch account email. This preserves saved commutes and push preferences on the original account and avoids duplicate same-email accounts.
```

- [ ] **Step 3: Run docs sanity check**

Run:

```bash
rg -n "Google sign-in|Google linking|auto-linked|official TTC" README.md
```

Expected: README describes explicit linking and still does not present LineWatchTO as an official TTC product.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document Google account linking"
```

## Task 7: Full Verification

**Files:**
- No new files. This validates the completed feature.

- [ ] **Step 1: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Manual local or staging test with Google configured**

Use an environment whose origin is authorized in the Google OAuth Web client. Configure:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=true
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=google-oauth-web-client-id-from-google-cloud-console
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
```

Manual expected behavior:

- Create or use an email/password account for the same email as the Google account.
- Sign in with email/password.
- Account menu shows `Link Google`.
- Click `Link Google`, complete Google prompt, and the dialog closes.
- Account menu now shows `Google Linked`.
- Sign out.
- Click `Continue With Google`.
- The app signs into the same LineWatch account id, with the same saved commutes and push preferences.
- Try linking a different Google email to the signed-in account and verify the UI shows the backend mismatch message.
- Try plain Google sign-in for a same-email password account that has not linked yet and verify it still shows the existing `google_account_link_required` message rather than creating a duplicate account.

## Post-Implementation Notes For Gemini

- Keep same-email auto-link blocked in `googleLogin(...)`; the new behavior belongs only in `linkGoogle(...)`.
- The durable Google identity key remains `provider='google'` plus Google `sub`, not email.
- Do not add unlinking, multiple providers, profile pages, avatar display, or Google revocation in this slice.
- Do not log Google ID tokens.
- Do not add a migration for this feature; `V29__account_auth_identities.sql` already created the necessary table and uniqueness constraints.
- If `googleLinked` causes many test fixture updates, prefer explicit fixture edits over making the TypeScript field optional. The backend now owns this field.

## Self-Review

- Spec coverage: The plan covers backend linked-status contract, signed-in linking service, controller endpoint, frontend adapter, menu/dialog UI, docs, and verification.
- Placeholder scan: Example OAuth client ID strings are explicitly marked as operator-provided values and must not be committed as real credentials.
- Type consistency: `googleLinked`, `linkGoogle`, `linkGoogleAccount`, `GoogleLoginRequest`, `/api/auth/google/link`, and `link-google` are named consistently across backend, frontend, tests, and docs.
