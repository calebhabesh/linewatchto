# Custom Google OAuth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible Google Identity Services iframe button with a custom styled Google button that starts a backend-owned OAuth redirect/code flow and still creates normal LineWatch sessions.

**Architecture:** The frontend renders a plain HTML/CSS Google provider button. Clicking it navigates to `/api/auth/google/start?mode=login|link`, the backend stores a short-lived HttpOnly OAuth state cookie, redirects to Google, exchanges the callback code for an ID token, verifies the ID token with the existing verifier, and reuses existing LineWatch account/session/linking rules.

**Tech Stack:** Spring Boot, Java 21, existing Spring Web/JWT support, Next.js App Router, React, TypeScript, project fixture tests.

---

### Task 1: Backend OAuth Redirect Contract

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleAuthProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleOAuthTokenClient.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleOAuthRestClientTokenClient.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/account/GoogleOAuthService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AuthCookieFactory.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/account/GoogleOAuthServiceTest.java`

- [ ] **Step 1: Write failing service tests**

Add tests that verify OAuth start URLs contain `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`, and `prompt=select_account`; that state cookies round trip; and that mismatched callback state is rejected.

- [ ] **Step 2: Implement OAuth service and token client**

Add config fields for `clientSecret`, `redirectUri`, `authorizationUri`, and `tokenUri`. Add `oauthConfigured()` for redirect flow and keep `idTokenVerificationConfigured()` for ID token verification. Implement state cookie encoding with Base64 URL JSON-like payload, relative-only `returnTo`, and a 10-minute TTL.

- [ ] **Step 3: Run backend targeted tests**

Run: `mvn -f backend/pom.xml -Dtest=GoogleOAuthServiceTest test`

Expected: new OAuth service tests pass.

### Task 2: Account Service Identity Reuse

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountService.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountServiceTest.java`

- [ ] **Step 1: Write failing overload tests**

Add tests showing `googleLogin(VerifiedGoogleIdentity)` creates/signs in the same way as credential login, and `linkGoogle(rawSessionToken, VerifiedGoogleIdentity)` enforces the existing email-match and duplicate-link checks.

- [ ] **Step 2: Refactor credential methods**

Make `googleLogin(GoogleLoginRequest)` verify the credential and delegate to `googleLogin(VerifiedGoogleIdentity)`. Make `linkGoogle(rawSessionToken, GoogleLoginRequest)` verify the credential and delegate to `linkGoogle(rawSessionToken, VerifiedGoogleIdentity)`.

- [ ] **Step 3: Run backend targeted tests**

Run: `mvn -f backend/pom.xml -Dtest=AccountServiceTest test`

Expected: account service tests pass.

### Task 3: OAuth Controller Endpoints

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/account/AccountControllerTest.java`

- [ ] **Step 1: Write failing controller tests**

Add tests for `GET /api/auth/google/start` returning `302` with a Google `Location` and an HttpOnly OAuth state cookie, `GET /api/auth/google/callback` setting `linewatch_session` for login mode, link mode redirecting without replacing the session, and invalid callback state redirecting to `/?account_error=google_oauth_failed`.

- [ ] **Step 2: Implement endpoints**

Inject `GoogleOAuthService`. Add `/google/start` and `/google/callback`. Keep the existing POST `/google` and `/google/link` endpoints as compatibility paths. Use the existing rate limiter buckets with new keys `google-oauth-start` and `google-oauth-callback`.

- [ ] **Step 3: Run backend targeted tests**

Run: `mvn -f backend/pom.xml -Dtest=AccountControllerTest test`

Expected: controller tests pass.

### Task 4: Frontend Custom Provider Button

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/GoogleSignInButton.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/account-data.test.mjs`
- Test: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Write failing frontend source/adapter tests**

Update tests so the Google button source must not load `accounts.google.com/gsi/client`, must not call `google.accounts.id.renderButton`, and must render a custom `.account-choice-google-custom` button that navigates to `googleAuthStartUrl`.

- [ ] **Step 2: Implement custom button**

Add `googleAuthStartUrl({ mode, returnTo })` to `account-data.ts`. Replace `GoogleSignInButton.tsx` with a custom button using a Google “G” icon, `window.location.assign(...)`, and `mode="login" | "link"`.

- [ ] **Step 3: Wire shell UI**

Remove credential callback handlers from `LineWatchShell.tsx`. Render `GoogleSignInButton mode="login"` in auth choice and `GoogleSignInButton mode="link"` in the account link dialog. Parse `account_error` query parameters into account dialog errors.

- [ ] **Step 4: Style the custom button**

Style `.account-choice-google-custom` with the same dimensions, border radius, typography, hover/focus, and dark/high-contrast behavior as `.account-choice-primary`.

- [ ] **Step 5: Run frontend checks**

Run:
```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: fixture tests, typecheck, and lint pass.

### Task 5: Config And Docs

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `.env.staging.example`
- Modify: `.env.production.example`
- Modify: `README.md`

- [ ] **Step 1: Add config defaults and environment examples**

Add `LINEWATCH_AUTH_GOOGLE_CLIENT_SECRET`, `LINEWATCH_AUTH_GOOGLE_REDIRECT_URI`, `LINEWATCH_AUTH_GOOGLE_AUTHORIZATION_URI`, and `LINEWATCH_AUTH_GOOGLE_TOKEN_URI`.

- [ ] **Step 2: Update README setup**

Document that Google Cloud must include an Authorized redirect URI for each environment, for example `http://localhost:3000/api/auth/google/callback`, `https://staging.<domain>/api/auth/google/callback`, and `https://<domain>/api/auth/google/callback`.

- [ ] **Step 3: Run full relevant verification**

Run:
```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all checks pass.
