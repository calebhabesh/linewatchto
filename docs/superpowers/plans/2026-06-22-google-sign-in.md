# Optional Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google sign-in as the primary low-friction auth path while keeping the existing email/password, password reset, demo account, saved commute, and Web Push account flows working.

**Architecture:** The backend remains the auth source of truth. The frontend receives a Google Identity Services ID token, sends it once to Spring Boot, the backend verifies issuer/signature/audience/expiry/email state, maps the Google `sub` claim to a LineWatch account identity, creates the existing `user_sessions` row, and sets the existing `linewatch_session` HttpOnly cookie. Existing email/password accounts are not auto-linked in v1; a same-email password account returns a clear conflict message.

**Tech Stack:** Spring Boot 3.5, Java 21, Spring Data JPA, Flyway, Spring Security OAuth2 JOSE JWT decoder only, Next.js App Router, React, TypeScript, Google Identity Services Web button.

---

## External References Checked

- Google Identity Services says ID tokens should be sent to the login endpoint as the `credential` field and verified server-side.
- Google says to use the ID token `sub` field as the stable account identifier, not email.
- Google says server verification must check signature, `aud`, `iss`, and `exp`; a Google API client or general JWT library is recommended.
- Google's JavaScript button API can return the JWT to a browser callback through `google.accounts.id.initialize({ client_id, callback })` and `renderButton(...)`.

Reference URLs:
- `https://developers.google.com/identity/gsi/web/guides/verify-google-id-token`
- `https://developers.google.com/identity/gsi/web/guides/display-button`

## Scope Decisions

- Implement Google sign-in only, not general multi-provider auth.
- Keep email/password registration, login, forgot-password, and demo login.
- Do not add `spring-boot-starter-security`; it would install web security defaults and risk locking down dashboard APIs. Add only `spring-security-oauth2-jose`.
- Do not persist Google ID tokens, access tokens, refresh tokens, profile images, or local-storage auth state.
- Use `LINEWATCH_AUTH_GOOGLE_CLIENT_ID` on the backend and expose it through `/api/auth/config` when Google sign-in is enabled. This keeps production frontend images generic.
- Use no Google client secret because this v1 uses Google Identity Services ID-token sign-in, not authorization-code access to Google APIs.
- Require `email_verified=true` from Google before creating a LineWatch account.
- If a password account already exists with the same email and no Google identity exists, return `409 google_account_link_required`. Do not silently merge accounts by email.
- Allow a Google-created account to later set an email/password through the existing password reset flow.

## File Structure

Backend files to modify:

- `backend/pom.xml`: add Spring Security OAuth2 JOSE JWT dependency.
- `backend/src/main/resources/application.yml`: add `linewatch.auth.google` settings.
- `.env.example`, `.env.staging.example`, `.env.production.example`: document Google auth env vars.
- `backend/src/main/resources/db/migration/V29__account_auth_identities.sql`: make account password nullable and add provider identity table.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`: allow passwordless accounts.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`: inject identity repository/verifier/properties and add `googleLogin`.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`: add `GET /api/auth/config` and `POST /api/auth/google`.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`: add auth config response.
- `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`: cover the new migration.
- `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`: cover Google sign-in service behavior.
- `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`: cover config and Google login controller behavior.

Backend files to create:

- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityEntity.java`: JPA entity for provider identities.
- `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`: provider identity lookup/save repository.
- `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthProperties.java`: backend config binding.
- `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthConfiguration.java`: enables properties.
- `backend/src/main/java/com/calebhabesh/linewatch/account/VerifiedGoogleIdentity.java`: normalized verified Google claims.
- `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleIdentityVerifier.java`: testable verifier interface.
- `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifier.java`: validates Google ID tokens.
- `backend/src/test/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifierTest.java`: unit tests for verifier validation.

Frontend files to modify:

- `frontend/src/app/account-data.ts`: add auth config and Google login adapter methods.
- `frontend/src/components/LineWatchShell.tsx`: load auth config, handle Google credential sign-in, and move email/password below the Google CTA when configured.
- `frontend/src/app/globals.css`: add stable Google auth button/divider styles.
- `frontend/tests/account-data.test.mjs`: cover auth config and Google login adapter requests.
- `frontend/tests/account-ui-source.test.mjs`: cover optional Google UI, script usage, and email/password secondary placement.

Frontend files to create:

- `frontend/src/components/GoogleSignInButton.tsx`: isolated Google Identity Services button wrapper.

Docs files to modify:

- `README.md`: document optional Google sign-in and configuration guardrails.

## Task 1: Backend Dependency And Config

**Files:**
- Modify: `backend/pom.xml`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `.env.staging.example`
- Modify: `.env.production.example`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthConfiguration.java`

- [ ] **Step 1: Add the JWT dependency without adding Spring Security web filters**

In `backend/pom.xml`, add this dependency after `spring-security-crypto`:

```xml
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-oauth2-jose</artifactId>
        </dependency>
```

Do not add `spring-boot-starter-security`.

- [ ] **Step 2: Add backend Google auth config defaults**

In `backend/src/main/resources/application.yml`, add this block under `linewatch.auth` beside `secure-cookie`, `allowed-origins`, `rate-limit`, and `password-reset`:

```yaml
    google:
      enabled: ${LINEWATCH_AUTH_GOOGLE_ENABLED:false}
      client-id: ${LINEWATCH_AUTH_GOOGLE_CLIENT_ID:}
      jwk-set-uri: ${LINEWATCH_AUTH_GOOGLE_JWK_SET_URI:https://www.googleapis.com/oauth2/v3/certs}
```

- [ ] **Step 3: Add local env examples**

In `.env.example`, add this after `LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=...`:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=false
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
```

- [ ] **Step 4: Add staging env examples**

In `.env.staging.example`, add this after `LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=...`:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=false
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
```

- [ ] **Step 5: Add production env examples**

In `.env.production.example`, add this after `LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=...`:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=false
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
```

- [ ] **Step 6: Create Google auth properties**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthProperties.java`:

```java
package com.calebhabesh.linewatch.account;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.auth.google")
public class GoogleAuthProperties {
    private boolean enabled = false;
    private String clientId = "";
    private String jwkSetUri = "https://www.googleapis.com/oauth2/v3/certs";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getJwkSetUri() {
        return jwkSetUri;
    }

    public void setJwkSetUri(String jwkSetUri) {
        this.jwkSetUri = jwkSetUri;
    }

    public boolean configured() {
        return enabled && clientId != null && !clientId.isBlank();
    }
}
```

- [ ] **Step 7: Enable Google auth properties**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthConfiguration.java`:

```java
package com.calebhabesh.linewatch.account;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(GoogleAuthProperties.class)
public class GoogleAuthConfiguration {
}
```

- [ ] **Step 8: Verify dependency/config compile**

Run:

```bash
mvn -f backend/pom.xml -DskipTests compile
```

Expected: build succeeds and no Spring Security generated password appears in logs.

- [ ] **Step 9: Commit**

```bash
git add backend/pom.xml backend/src/main/resources/application.yml .env.example .env.staging.example .env.production.example backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthProperties.java backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthConfiguration.java
git commit -m "chore: configure optional Google auth"
```

## Task 2: Identity Schema

**Files:**
- Create: `backend/src/main/resources/db/migration/V29__account_auth_identities.sql`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`

- [ ] **Step 1: Add failing migration test**

In `backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java`, add:

```java
    @Test
    void v29AddsExternalAuthIdentitiesAndAllowsPasswordlessAccounts() throws IOException {
        String sql = migrationSql("/db/migration/V29__account_auth_identities.sql");

        assertThat(sql).contains("alter table accounts");
        assertThat(sql).contains("alter column password_hash drop not null");
        assertThat(sql).contains("create table account_auth_identities");
        assertThat(sql).contains("account_id varchar(80) not null references accounts(id) on delete cascade");
        assertThat(sql).contains("provider varchar(40) not null");
        assertThat(sql).contains("provider_subject varchar(255) not null");
        assertThat(sql).contains("email varchar(320) not null");
        assertThat(sql).contains("email_verified boolean not null default false");
        assertThat(sql).contains("unique (provider, provider_subject)");
        assertThat(sql).contains("unique (account_id, provider)");
        assertThat(sql).contains("idx_account_auth_identities_account_id");
    }
```

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountSchemaMigrationTest test
```

Expected: FAIL because `V29__account_auth_identities.sql` does not exist yet.

- [ ] **Step 3: Create the migration**

Create `backend/src/main/resources/db/migration/V29__account_auth_identities.sql`:

```sql
alter table accounts
    alter column password_hash drop not null;

create table account_auth_identities (
    id varchar(80) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    provider varchar(40) not null,
    provider_subject varchar(255) not null,
    email varchar(320) not null,
    email_verified boolean not null default false,
    created_at timestamp with time zone not null,
    last_login_at timestamp with time zone,
    unique (provider, provider_subject),
    unique (account_id, provider)
);

create index idx_account_auth_identities_account_id
    on account_auth_identities(account_id);

create index idx_account_auth_identities_email
    on account_auth_identities(email);
```

- [ ] **Step 4: Run the migration test and verify it passes**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountSchemaMigrationTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V29__account_auth_identities.sql backend/src/test/java/com/calebhabesh/linewatch/account/AccountSchemaMigrationTest.java
git commit -m "feat: add account auth identity schema"
```

## Task 3: Backend Identity Model

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`

- [ ] **Step 1: Create identity entity**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityEntity.java`:

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
@Table(name = "account_auth_identities")
public class AccountAuthIdentityEntity {
    public static final String PROVIDER_GOOGLE = "google";

    @Id
    private String id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id")
    private AccountEntity account;
    private String provider;
    @Column(name = "provider_subject")
    private String providerSubject;
    private String email;
    @Column(name = "email_verified")
    private boolean emailVerified;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    protected AccountAuthIdentityEntity() {}

    private AccountAuthIdentityEntity(
        String id,
        AccountEntity account,
        String provider,
        String providerSubject,
        String email,
        boolean emailVerified,
        Instant createdAt
    ) {
        this.id = id;
        this.account = account;
        this.provider = provider;
        this.providerSubject = providerSubject;
        this.email = email;
        this.emailVerified = emailVerified;
        this.createdAt = createdAt;
        this.lastLoginAt = null;
    }

    public static AccountAuthIdentityEntity createGoogle(
        String id,
        AccountEntity account,
        String providerSubject,
        String email,
        boolean emailVerified,
        Instant createdAt
    ) {
        return new AccountAuthIdentityEntity(
            id,
            account,
            PROVIDER_GOOGLE,
            providerSubject,
            email,
            emailVerified,
            createdAt
        );
    }

    public void updateGoogleProfile(String email, boolean emailVerified, Instant lastLoginAt) {
        this.email = email;
        this.emailVerified = emailVerified;
        this.lastLoginAt = lastLoginAt;
    }

    public String getId() { return id; }
    public AccountEntity getAccount() { return account; }
    public String getProvider() { return provider; }
    public String getProviderSubject() { return providerSubject; }
    public String getEmail() { return email; }
    public boolean isEmailVerified() { return emailVerified; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastLoginAt() { return lastLoginAt; }
}
```

- [ ] **Step 2: Create identity repository**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java`:

```java
package com.calebhabesh.linewatch.account;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountAuthIdentityRepository extends JpaRepository<AccountAuthIdentityEntity, String> {
    Optional<AccountAuthIdentityEntity> findByProviderAndProviderSubject(String provider, String providerSubject);
}
```

- [ ] **Step 3: Add passwordless account factory support**

In `backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java`, keep the existing fields and add this factory below `create(...)`:

```java
    public static AccountEntity createPasswordless(String id, String email, String displayName, boolean demo, Instant createdAt) {
        return new AccountEntity(id, email, displayName, null, demo, createdAt);
    }
```

No column annotation change is required because `password_hash` is already mapped by name.

- [ ] **Step 4: Verify model compile**

Run:

```bash
mvn -f backend/pom.xml -DskipTests compile
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityEntity.java backend/src/main/java/com/calebhabesh/linewatch/account/AccountAuthIdentityRepository.java backend/src/main/java/com/calebhabesh/linewatch/account/AccountEntity.java
git commit -m "feat: model account auth identities"
```

## Task 4: Google ID Token Verifier

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/VerifiedGoogleIdentity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleIdentityVerifier.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifier.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifierTest.java`

- [ ] **Step 1: Write failing verifier tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifierTest.java`:

```java
package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class GoogleJwtIdentityVerifierTest {
    private final GoogleAuthProperties properties = googleProperties();
    private final JwtDecoder decoder = mock(JwtDecoder.class);
    private final GoogleJwtIdentityVerifier verifier = new GoogleJwtIdentityVerifier(properties, decoder);

    @Test
    void verifiesGoogleIdentityFromJwtClaims() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "https://accounts.google.com",
            "aud", List.of("client-123.apps.googleusercontent.com"),
            "sub", "google-subject-1",
            "email", "Rider@Example.COM",
            "email_verified", true,
            "name", "Transit Rider"
        )));

        VerifiedGoogleIdentity identity = verifier.verify("credential");

        assertThat(identity.subject()).isEqualTo("google-subject-1");
        assertThat(identity.email()).isEqualTo("Rider@Example.COM");
        assertThat(identity.emailVerified()).isTrue();
        assertThat(identity.displayName()).isEqualTo("Transit Rider");
    }

    @Test
    void rejectsWrongAudience() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "https://accounts.google.com",
            "aud", List.of("other-client"),
            "sub", "google-subject-1",
            "email", "rider@example.com",
            "email_verified", true
        )));

        assertThatThrownBy(() -> verifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in")
            .extracting("status")
            .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void rejectsWrongIssuer() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "https://evil.example",
            "aud", List.of("client-123.apps.googleusercontent.com"),
            "sub", "google-subject-1",
            "email", "rider@example.com",
            "email_verified", true
        )));

        assertThatThrownBy(() -> verifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in");
    }

    @Test
    void rejectsUnverifiedEmail() {
        when(decoder.decode("credential")).thenReturn(jwt(Map.of(
            "iss", "accounts.google.com",
            "aud", List.of("client-123.apps.googleusercontent.com"),
            "sub", "google-subject-1",
            "email", "rider@example.com",
            "email_verified", false
        )));

        assertThatThrownBy(() -> verifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Google account email must be verified");
    }

    @Test
    void rejectsDecoderFailures() {
        when(decoder.decode("bad-credential")).thenThrow(new JwtException("bad jwt"));

        assertThatThrownBy(() -> verifier.verify("bad-credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Could not verify Google sign-in");
    }

    @Test
    void rejectsWhenGoogleAuthIsDisabled() {
        GoogleAuthProperties disabled = new GoogleAuthProperties();
        disabled.setEnabled(false);
        disabled.setClientId("client-123.apps.googleusercontent.com");
        GoogleJwtIdentityVerifier disabledVerifier = new GoogleJwtIdentityVerifier(disabled, decoder);

        assertThatThrownBy(() -> disabledVerifier.verify("credential"))
            .isInstanceOf(AccountException.class)
            .hasMessageContaining("Google sign-in is not configured")
            .extracting("status")
            .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        result.setJwkSetUri("https://www.googleapis.com/oauth2/v3/certs");
        return result;
    }

    private Jwt jwt(Map<String, Object> claims) {
        return new Jwt(
            "token-value",
            Instant.parse("2026-06-22T12:00:00Z"),
            Instant.parse("2026-06-22T13:00:00Z"),
            Map.of("alg", "RS256"),
            claims
        );
    }
}
```

- [ ] **Step 2: Run verifier tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GoogleJwtIdentityVerifierTest test
```

Expected: FAIL because verifier classes do not exist.

- [ ] **Step 3: Create verified identity record**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/VerifiedGoogleIdentity.java`:

```java
package com.calebhabesh.linewatch.account;

public record VerifiedGoogleIdentity(
    String subject,
    String email,
    boolean emailVerified,
    String displayName
) {}
```

- [ ] **Step 4: Create verifier interface**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleIdentityVerifier.java`:

```java
package com.calebhabesh.linewatch.account;

public interface GoogleIdentityVerifier {
    VerifiedGoogleIdentity verify(String credential);
}
```

- [ ] **Step 5: Create JWT verifier implementation**

Create `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifier.java`:

```java
package com.calebhabesh.linewatch.account;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

@Component
public class GoogleJwtIdentityVerifier implements GoogleIdentityVerifier {
    private static final Set<String> GOOGLE_ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");
    private static final int MAX_CREDENTIAL_LENGTH = 8192;

    private final GoogleAuthProperties properties;
    private final JwtDecoder decoder;

    public GoogleJwtIdentityVerifier(GoogleAuthProperties properties) {
        this(properties, NimbusJwtDecoder.withJwkSetUri(properties.getJwkSetUri()).build());
    }

    GoogleJwtIdentityVerifier(GoogleAuthProperties properties, JwtDecoder decoder) {
        this.properties = properties;
        this.decoder = decoder;
    }

    @Override
    public VerifiedGoogleIdentity verify(String credential) {
        if (!properties.configured()) {
            throw new AccountException(HttpStatus.SERVICE_UNAVAILABLE, "google_auth_unavailable", "Google sign-in is not configured.");
        }

        String token = credential == null ? "" : credential.trim();
        if (token.isBlank() || token.length() > MAX_CREDENTIAL_LENGTH) {
            throw invalidCredential();
        }

        Jwt jwt;
        try {
            jwt = decoder.decode(token);
        } catch (JwtException ex) {
            throw invalidCredential();
        }

        String issuer = jwt.getIssuer() == null ? "" : jwt.getIssuer().toString();
        if (!GOOGLE_ISSUERS.contains(issuer)) {
            throw invalidCredential();
        }

        if (!audienceContainsClientId(jwt.getAudience())) {
            throw invalidCredential();
        }

        String subject = jwt.getSubject();
        String email = jwt.getClaimAsString("email");
        Boolean emailVerified = jwt.getClaim("email_verified");
        String displayName = jwt.getClaimAsString("name");

        if (blank(subject) || blank(email)) {
            throw invalidCredential();
        }
        if (!Boolean.TRUE.equals(emailVerified)) {
            throw new AccountException(HttpStatus.UNAUTHORIZED, "google_email_unverified", "Google account email must be verified.");
        }

        return new VerifiedGoogleIdentity(subject, email, true, displayName == null ? "" : displayName.trim());
    }

    private boolean audienceContainsClientId(Collection<String> audiences) {
        if (audiences == null || audiences.isEmpty()) {
            return false;
        }
        String clientId = properties.getClientId();
        return audiences.stream().anyMatch(candidate -> candidate.equals(clientId));
    }

    private AccountException invalidCredential() {
        return new AccountException(HttpStatus.UNAUTHORIZED, "invalid_google_credential", "Could not verify Google sign-in.");
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
```

- [ ] **Step 6: Run verifier tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GoogleJwtIdentityVerifierTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/VerifiedGoogleIdentity.java backend/src/main/java/com/calebhabesh/linewatch/account/GoogleIdentityVerifier.java backend/src/main/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifier.java backend/src/test/java/com/calebhabesh/linewatch/account/GoogleJwtIdentityVerifierTest.java
git commit -m "feat: verify Google identity tokens"
```

## Task 5: Backend Google Login Service

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

- [ ] **Step 1: Add failing service tests**

In `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`, add fields:

```java
    private final AccountAuthIdentityRepository authIdentityRepository = mock(AccountAuthIdentityRepository.class);
    private final GoogleIdentityVerifier googleIdentityVerifier = mock(GoogleIdentityVerifier.class);
    private final GoogleAuthProperties googleAuthProperties = googleProperties();
```

Update every `new AccountService(...)` call to include `authIdentityRepository`, `googleIdentityVerifier`, and `googleAuthProperties` after `accountRepository`.

Add helper:

```java
    private GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        return result;
    }
```

Add tests:

```java
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
        when(sessionRepository.save(any(UserSessionEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        AccountResponses.AuthSession response = service.googleLogin(new AccountService.GoogleLoginRequest("credential"));

        assertThat(response.user().id()).isEqualTo("user_google");
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
            .hasMessageContaining("Sign in with email and password")
            .extracting("status")
            .isEqualTo(HttpStatus.CONFLICT);

        verify(authIdentityRepository, never()).save(any(AccountAuthIdentityEntity.class));
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
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: FAIL because the service constructor and `googleLogin` do not exist yet.

- [ ] **Step 3: Update AccountService dependencies**

In `AccountService`, add fields:

```java
    private final AccountAuthIdentityRepository authIdentityRepository;
    private final GoogleIdentityVerifier googleIdentityVerifier;
    private final GoogleAuthProperties googleAuthProperties;
```

Update the public constructor parameter list so these are injected after `AccountRepository accountRepository`:

```java
        AccountAuthIdentityRepository authIdentityRepository,
        GoogleIdentityVerifier googleIdentityVerifier,
        GoogleAuthProperties googleAuthProperties,
```

Update the package-private test constructor the same way, assign the fields, and pass them through from the public constructor.

- [ ] **Step 4: Guard password login for passwordless accounts**

In `AccountService.login`, replace the password check with:

```java
        if (account.getPasswordHash() == null || !passwordHasher.matches(request.password(), account.getPasswordHash())) {
            throw invalidCredentials();
        }
```

- [ ] **Step 5: Add Google login service method**

In `AccountService`, add this method after `demoLogin()`:

```java
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
```

Add this helper below `createSession(...)`:

```java
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
```

Add this request record beside the existing auth request records:

```java
    public record GoogleLoginRequest(String credential) {}
```

- [ ] **Step 6: Run service tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountServiceTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java
git commit -m "feat: create sessions from Google identities"
```

## Task 6: Backend Auth Controller Contract

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`

- [ ] **Step 1: Add failing controller tests**

In `AccountControllerTest`, add a `GoogleAuthProperties` field and pass it to the controller constructor:

```java
    private final GoogleAuthProperties googleAuthProperties = googleProperties();
    private final AccountController controller = new AccountController(accountService, cookieFactory, rateLimiter, googleAuthProperties);
```

Add helper:

```java
    private GoogleAuthProperties googleProperties() {
        GoogleAuthProperties result = new GoogleAuthProperties();
        result.setEnabled(true);
        result.setClientId("client-123.apps.googleusercontent.com");
        return result;
    }
```

Add tests:

```java
    @Test
    void authConfigExposesGoogleAvailabilityWhenConfigured() {
        AccountResponses.AuthConfigResponse response = controller.config();

        assertThat(response.googleSignInAvailable()).isTrue();
        assertThat(response.googleClientId()).isEqualTo("client-123.apps.googleusercontent.com");
    }

    @Test
    void googleLoginSetsHttpOnlySessionCookie() {
        AccountResponses.UserResponse user = new AccountResponses.UserResponse("user_google", "rider@example.com", "Transit Rider", false);
        AccountService.GoogleLoginRequest request = new AccountService.GoogleLoginRequest("credential");
        when(accountService.googleLogin(request))
            .thenReturn(new AccountResponses.AuthSession(user, "raw-token", Instant.parse("2026-06-19T14:30:00Z")));

        ResponseEntity<AccountResponses.AuthResponse> response = controller.google(
            request,
            requestFrom("203.0.113.40")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isEqualTo(new AccountResponses.AuthResponse(true, user));
        assertThat(response.getHeaders().getFirst("Set-Cookie"))
            .contains("linewatch_session=raw-token")
            .contains("HttpOnly")
            .contains("SameSite=Lax")
            .contains("Path=/");
        verify(rateLimiter).requireAuthAttempt("google", "203.0.113.40");
    }
```

- [ ] **Step 2: Run controller tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: FAIL because config response and Google controller endpoint do not exist.

- [ ] **Step 3: Add auth config response**

In `AccountResponses.java`, add:

```java
    public record AuthConfigResponse(boolean googleSignInAvailable, String googleClientId) {}
```

- [ ] **Step 4: Add Google auth controller endpoints**

In `AccountController`, add `GoogleAuthProperties googleAuthProperties` as a field and constructor parameter.

Add:

```java
    @GetMapping("/config")
    public AccountResponses.AuthConfigResponse config() {
        return new AccountResponses.AuthConfigResponse(
            googleAuthProperties.configured(),
            googleAuthProperties.configured() ? googleAuthProperties.getClientId() : ""
        );
    }

    @PostMapping("/google")
    public ResponseEntity<AccountResponses.AuthResponse> google(
        @RequestBody AccountService.GoogleLoginRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireAuthAttempt("google", AccountRateLimiter.clientAddress(httpRequest));
        return authenticated(accountService.googleLogin(request));
    }
```

- [ ] **Step 5: Run controller tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AccountControllerTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java
git commit -m "feat: expose Google auth endpoints"
```

## Task 7: Frontend Account Adapter

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/tests/account-data.test.mjs`

- [ ] **Step 1: Add failing adapter tests**

In `frontend/tests/account-data.test.mjs`, add imports:

```js
  getAuthConfig,
  loginWithGoogle,
```

Add tests:

```js
  it("loads auth configuration", async () => {
    const result = await getAuthConfig({
      fetcher: async (input, init) => {
        assert.equal(input, "/api/auth/config");
        assert.equal(init.method, "GET");
        assert.equal(init.credentials, "include");
        return new Response(
          JSON.stringify({
            googleSignInAvailable: true,
            googleClientId: "client-123.apps.googleusercontent.com",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(result.config.googleSignInAvailable, true);
    assert.equal(result.config.googleClientId, "client-123.apps.googleusercontent.com");
  });

  it("falls back to unavailable auth config when backend cannot be reached", async () => {
    const result = await getAuthConfig({
      fetcher: async () => {
        throw new Error("offline");
      },
    });

    assert.equal(result.source, "unavailable");
    assert.equal(result.config.googleSignInAvailable, false);
    assert.equal(result.config.googleClientId, "");
  });

  it("posts Google credential with credentials included", async () => {
    const requests = [];
    const result = await loginWithGoogle(
      { credential: "google-id-token" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_google", email: "rider@example.com", displayName: "Transit Rider", demo: false },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(requests[0].input, "/api/auth/google");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({ credential: "google-id-token" }));
  });
```

- [ ] **Step 2: Run adapter tests and verify they fail**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-data.test.mjs
```

Expected: FAIL because `getAuthConfig` and `loginWithGoogle` do not exist.

- [ ] **Step 3: Add auth config types and methods**

In `frontend/src/app/account-data.ts`, add types near the existing auth types:

```ts
export type AuthConfig = {
  googleSignInAvailable: boolean;
  googleClientId: string;
};

export type AuthConfigResult = {
  source: "backend" | "unavailable";
  config: AuthConfig;
  message?: string;
};

export const unavailableAuthConfig: AuthConfig = {
  googleSignInAvailable: false,
  googleClientId: "",
};
```

Add functions near `getCurrentAccount` and login/register functions:

```ts
export async function getAuthConfig(options: AdapterOptions = {}): Promise<AuthConfigResult> {
  try {
    const config = await authJsonRequest<AuthConfig>("/api/auth/config", { method: "GET", headers: {} }, options);
    return { source: "backend", config };
  } catch {
    return {
      source: "unavailable",
      config: unavailableAuthConfig,
      message: "Auth configuration unavailable.",
    };
  }
}

export async function loginWithGoogle(input: { credential: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/google", { method: "POST", body: JSON.stringify(input) }, options);
}
```

- [ ] **Step 4: Run adapter tests and verify they pass**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-data.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/account-data.ts frontend/tests/account-data.test.mjs
git commit -m "feat: add Google auth frontend adapter"
```

## Task 8: Frontend Google Sign-In Component

**Files:**
- Create: `frontend/src/components/GoogleSignInButton.tsx`
- Modify: `frontend/tests/account-ui-source.test.mjs`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add failing source test**

In `frontend/tests/account-ui-source.test.mjs`, add:

```js
const googleSignInSource = readFileSync(new URL("../src/components/GoogleSignInButton.tsx", import.meta.url), "utf8");
```

Add test:

```js
  it("wraps Google Identity Services in an isolated optional button component", () => {
    assert.match(googleSignInSource, /accounts\.google\.com\/gsi\/client/);
    assert.match(googleSignInSource, /google\.accounts\.id\.initialize/);
    assert.match(googleSignInSource, /google\.accounts\.id\.renderButton/);
    assert.match(googleSignInSource, /onCredential/);
    assert.match(googleSignInSource, /clientId/);
    assert.match(globalCss, /\.google-sign-in-slot/);
    assert.match(globalCss, /\.account-auth-divider/);
  });
```

- [ ] **Step 2: Run UI source test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
```

Expected: FAIL because `GoogleSignInButton.tsx` does not exist.

- [ ] **Step 3: Create Google button wrapper**

Create `frontend/src/components/GoogleSignInButton.tsx`:

```tsx
"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type GoogleCredentialResponse = {
  credential?: string;
  select_by?: string;
};

type GoogleAccountsId = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    ux_mode?: "popup" | "redirect";
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
      logo_alignment?: "left" | "center";
    }
  ) => void;
  disableAutoSelect?: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

type GoogleSignInButtonProps = {
  clientId: string;
  disabled?: boolean;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
};

export function GoogleSignInButton({ clientId, disabled = false, onCredential, onError }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const renderGoogleButton = useCallback(() => {
    const googleId = window.google?.accounts?.id;
    const buttonNode = buttonRef.current;
    if (!googleId || !buttonNode || !clientId || disabled) {
      return;
    }

    buttonNode.replaceChildren();
    googleId.initialize({
      client_id: clientId,
      auto_select: false,
      ux_mode: "popup",
      callback: (response) => {
        if (response.credential) {
          onCredential(response.credential);
          return;
        }
        onError("Google sign-in did not return a credential.");
      },
    });
    googleId.renderButton(buttonNode, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: 320,
      logo_alignment: "left",
    });
  }, [clientId, disabled, onCredential, onError]);

  useEffect(() => {
    if (scriptReady) {
      renderGoogleButton();
    }
  }, [renderGoogleButton, scriptReady]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="google-sign-in-slot" aria-disabled={disabled}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => onError("Google sign-in could not load.")}
      />
      <div ref={buttonRef} className={disabled ? "pointer-events-none opacity-60" : ""} />
    </div>
  );
}
```

- [ ] **Step 4: Add stable styling**

In `frontend/src/app/globals.css`, add near existing account dialog styles:

```css
.google-sign-in-slot {
  display: flex;
  min-height: 44px;
  width: 100%;
  align-items: center;
  justify-content: center;
}

.google-sign-in-slot > div {
  width: min(100%, 320px);
}

.account-auth-divider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: rgb(100 116 139);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.account-auth-divider::before,
.account-auth-divider::after {
  content: "";
  height: 1px;
  background: color-mix(in srgb, currentColor 30%, transparent);
}
```

- [ ] **Step 5: Run UI source test and verify it passes**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/GoogleSignInButton.tsx frontend/src/app/globals.css frontend/tests/account-ui-source.test.mjs
git commit -m "feat: add Google sign-in button wrapper"
```

## Task 9: Frontend Auth Dialog Integration

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Add failing UI source test**

In `frontend/tests/account-ui-source.test.mjs`, add assertions to the first account UI test:

```js
    assert.match(shellSource, /getAuthConfig/);
    assert.match(shellSource, /loginWithGoogle/);
    assert.match(shellSource, /GoogleSignInButton/);
    assert.match(shellSource, /Continue With Google/);
    assert.match(shellSource, /account-auth-divider/);
```

- [ ] **Step 2: Run UI source test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
```

Expected: FAIL because `LineWatchShell.tsx` does not yet integrate Google auth.

- [ ] **Step 3: Import Google auth helpers**

In `LineWatchShell.tsx`, add:

```tsx
import { GoogleSignInButton } from "./GoogleSignInButton";
```

In the existing account-data import, add:

```tsx
  getAuthConfig,
  loginWithGoogle,
  unavailableAuthConfig,
  type AuthConfig,
```

- [ ] **Step 4: Add auth config state**

Near the existing `accountState` state:

```tsx
  const [authConfig, setAuthConfig] = useState<AuthConfig>(unavailableAuthConfig);
```

Add an effect near the existing `getCurrentAccount()` effect:

```tsx
  useEffect(() => {
    let cancelled = false;
    getAuthConfig().then((result) => {
      if (!cancelled) {
        setAuthConfig(result.config);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 5: Add Google sign-in handler**

Add this near `handleDemoAccount`:

```tsx
  const handleGoogleCredential = async (credential: string) => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await loginWithGoogle({ credential });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountDialogMode(null);
      resetAccountForm();
      setActiveView("commutes");
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Google sign-in is unavailable.");
      }
    } finally {
      setAccountBusy(false);
    }
  };
```

- [ ] **Step 6: Render Google as the primary dialog action when configured**

Inside the login/register dialog branch before the email/password labels, add:

```tsx
                  {authConfig.googleSignInAvailable ? (
                    <>
                      <div aria-label="Continue With Google">
                        <GoogleSignInButton
                          clientId={authConfig.googleClientId}
                          disabled={accountBusy}
                          onCredential={handleGoogleCredential}
                          onError={setAccountError}
                        />
                      </div>
                      <div className="account-auth-divider" aria-hidden="true">
                        <span>{accountDialogMode === "login" ? "Or use email" : "Or create with email"}</span>
                      </div>
                    </>
                  ) : null}
```

Keep the existing email/password fields below this block. The dialog title remains `Sign in to LineWatchTO` or `Create account`.

- [ ] **Step 7: Run frontend tests and typecheck**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
npm --prefix frontend run typecheck
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/tests/account-ui-source.test.mjs
git commit -m "feat: surface Google sign-in in account dialog"
```

## Task 10: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update current status auth claim**

In `README.md`, change:

```markdown
- Account sign-in supports password reset through emailed reset links when SMTP is configured, with a local/dev reset-token fallback.
```

to:

```markdown
- Account sign-in supports optional Google sign-in when a Google OAuth web client ID is configured, while retaining email/password registration, password reset through emailed reset links when SMTP is configured, local/dev reset-token fallback, and demo login.
```

- [ ] **Step 2: Add configuration notes**

Add this under the existing production environment/configuration section:

````markdown
Optional Google sign-in configuration:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=true
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=google-oauth-web-client-id-from-google-cloud-console
LINEWATCH_AUTH_GOOGLE_JWK_SET_URI=https://www.googleapis.com/oauth2/v3/certs
```

Use a Google OAuth Web application client. Configure authorized JavaScript origins for each deployed frontend origin, such as `http://localhost:3000`, `https://staging.linewatchto.ca`, `https://linewatchto.ca`, and `https://www.linewatchto.ca`. The app verifies Google ID tokens on the backend and still creates its own HttpOnly `linewatch_session` cookie. Google sign-in is optional; when it is disabled or unconfigured, the UI falls back to email/password and demo login.
````

- [ ] **Step 3: Run docs sanity check**

Run:

```bash
rg -n "Google sign-in|LINEWATCH_AUTH_GOOGLE|official TTC" README.md .env.example .env.staging.example .env.production.example
```

Expected: Google config appears in README and env examples; no text describes LineWatchTO as an official TTC product.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document optional Google sign-in"
```

## Task 11: Full Verification

**Files:**
- No new files. This validates the completed stack.

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

Expected: PASS. The build may download or use cached Next.js/font artifacts depending on local setup.

- [ ] **Step 6: Optional local manual test with Google disabled**

Run backend and frontend with default `.env.example` values:

```bash
docker compose up -d postgres redis
mvn -f backend/pom.xml spring-boot:run
npm --prefix frontend run dev
```

Expected:
- `/api/auth/config` returns `{"googleSignInAvailable":false,"googleClientId":""}`.
- Account dialog does not show the Google button.
- Email/password registration, sign-in, forgot password dev flow, demo login, saved commutes, and sign-out still work.

- [ ] **Step 7: Optional local manual test with Google enabled**

Set:

```dotenv
LINEWATCH_AUTH_GOOGLE_ENABLED=true
LINEWATCH_AUTH_GOOGLE_CLIENT_ID=local-google-oauth-web-client-id-from-google-cloud-console
```

Run backend and frontend:

```bash
mvn -f backend/pom.xml spring-boot:run
npm --prefix frontend run dev
```

Expected:
- `/api/auth/config` returns `googleSignInAvailable: true`.
- The account dialog renders a Google Identity Services button.
- Clicking Google signs in, sets `linewatch_session`, closes the dialog, and `/api/auth/me` returns the LineWatch account.
- A second Google sign-in for the same Google account reuses the same LineWatch account.
- A Google sign-in using the same email as an existing password account returns the `google_account_link_required` message instead of creating a duplicate account.

## Post-Implementation Notes For Gemini

- Keep the final implementation scoped. Do not build account linking, unlinking, profile pages, avatar display, Google revocation, or alternate providers in this slice.
- Do not store Google ID tokens in the database, browser storage, or logs.
- Do not treat Google email as the identity key. The durable key is `provider='google'` plus `provider_subject` equal to the Google `sub` claim.
- Preserve all existing account behavior. Saved commutes and push preferences must continue to key off the existing `accounts.id`.
- If Maven cannot resolve the new JOSE dependency because of network restrictions, request network approval rather than replacing token verification with an unverified JWT decode.

## Self-Review

- Spec coverage: The plan covers schema, backend token verification, backend account/session bridging, frontend optional button, config, docs, and verification.
- Placeholder scan: Operator-provided Google OAuth client IDs are represented as explicit example strings and must not be committed as real credentials.
- Type consistency: `GoogleLoginRequest`, `VerifiedGoogleIdentity`, `AccountAuthIdentityEntity.PROVIDER_GOOGLE`, `AuthConfigResponse`, `getAuthConfig`, and `loginWithGoogle` are named consistently across backend, frontend, and tests.
