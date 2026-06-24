# Auth Provider Choice UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the frontend auth experience with the backend Google/email auth model by making the first signed-out auth dialog a provider-choice screen: `Continue With Email` first, then `Continue With Google` below when configured.

**Architecture:** Keep the backend unchanged. Add a frontend-only `auth-choice` dialog mode in `LineWatchShell.tsx` that captures whether the user entered from sign-in or create-account intent, then routes `Continue With Email` into the existing email/password form and routes Google credentials through the existing `loginWithGoogle(...)` adapter. Leave the signed-in `Link Google` flow separate and unchanged.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Google Identity Services wrapper, Node built-in fixture/source tests, Tailwind utility classes plus `frontend/src/app/globals.css`.

---

## Current State

The backend is aligned:

- `POST /api/auth/google` supports new Google-only account creation and Google sign-in.
- `POST /api/auth/google/link` supports linking Google to an existing signed-in email/password account.
- `/api/auth/me` now returns `user.googleLinked`.

The frontend is only partially aligned:

- The account dialog can show a Google button, but it currently appears inside the `login` and `register` email/password form branch.
- Signed-out menu and panel prompts still jump directly to `login` or `register`.
- The user does not first see a clear provider choice where email and Google are parallel ways to continue.

## UX Design

Do not copy Chess.com branding or its green visual language. Keep LineWatchTO's compact operations-dashboard styling.

Signed-out auth flow:

- `Sign In` opens `auth-choice` with sign-in intent.
- `Create Account` opens `auth-choice` with create-account intent.
- The dialog title uses the original intent:
  - sign-in intent: `Sign in`
  - create-account intent: `Create account`
- The first button is `Continue With Email`, with a mail icon.
- If Google is configured, show a divider and the existing Google Identity Services button below.
- If Google is not configured, hide the divider and Google slot.
- `Continue With Email` opens the existing `login` or `register` form depending on intent.
- The email form adds a `Back To Options` link so users can return to Google without closing the dialog.
- Existing `Forgot Password?`, password reset, demo account, and signed-in `Link Google` behavior stay unchanged.

## File Structure

Frontend files to modify:

- `frontend/src/components/LineWatchShell.tsx`: add `auth-choice` mode, entry-intent state, provider-choice dialog body, and route all signed-out auth entry points through provider choice.
- `frontend/src/app/globals.css`: add stable styles for the provider choice stack and email CTA.
- `frontend/tests/account-ui-source.test.mjs`: add source assertions that protect the provider-choice flow.

No backend files should be changed in this slice.

## Task 1: Source Tests For Provider Choice

**Files:**
- Modify: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Add failing source assertions**

In `frontend/tests/account-ui-source.test.mjs`, update the first test `loads account state and exposes sign-in, create-account, demo, and sign-out actions` by adding:

```js
    assert.match(shellSource, /"auth-choice"/);
    assert.match(shellSource, /type AccountEntryIntent = "login" \| "register"/);
    assert.match(shellSource, /openAuthChoice/);
    assert.match(shellSource, /Continue With Email/);
    assert.match(shellSource, /Back To Options/);
    assert.match(shellSource, /account-provider-stack/);
    assert.match(shellSource, /account-choice-primary/);
```

In the test `adds compact account styling without creating a landing page`, add:

```js
    assert.match(globalCss, /\.account-provider-stack/);
    assert.match(globalCss, /\.account-choice-primary/);
```

- [ ] **Step 2: Run the source test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
```

Expected: FAIL because `auth-choice`, `AccountEntryIntent`, `Continue With Email`, and the CSS classes do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add frontend/tests/account-ui-source.test.mjs
git commit -m "test: specify auth provider choice UI"
```

## Task 2: Auth Choice State And Entry Helpers

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Add mail icon import**

In `frontend/src/components/LineWatchShell.tsx`, update the `lucide-react` import so it includes `Mail`:

```tsx
import { Menu, X, Map as MapIcon, AlertTriangle, Calendar, Navigation, ShieldCheck, BarChart3, Bell, Construction, Search, LogIn, LogOut, UserPlus, UserRound, Sun, Moon, Bus, Mail } from "lucide-react";
```

- [ ] **Step 2: Add auth-choice mode and entry intent type**

Replace:

```ts
type AccountDialogMode = "login" | "register" | "forgot-password" | "reset-password" | "link-google";
```

with:

```ts
type AccountDialogMode = "auth-choice" | "login" | "register" | "forgot-password" | "reset-password" | "link-google";
type AccountEntryIntent = "login" | "register";
```

- [ ] **Step 3: Add account entry intent state**

Near the existing account dialog state:

```tsx
  const [accountDialogMode, setAccountDialogMode] = useState<AccountDialogMode | null>(initialPasswordResetToken.trim() ? "reset-password" : null);
```

add:

```tsx
  const [accountEntryIntent, setAccountEntryIntent] = useState<AccountEntryIntent>("login");
```

- [ ] **Step 4: Add helper functions after `resetAccountForm`**

After `resetAccountForm`, add:

```tsx
  const openAuthChoice = (intent: AccountEntryIntent) => {
    resetAccountForm();
    setAccountEntryIntent(intent);
    setAccountDialogMode("auth-choice");
  };

  const openEmailAuth = () => {
    setAccountError(null);
    setAccountDialogMode(accountEntryIntent);
  };
```

- [ ] **Step 5: Update dialog title**

In `accountDialogTitle()`, add this case before `link-google`:

```tsx
      case "auth-choice":
        return accountEntryIntent === "register" ? "Create account" : "Sign in";
```

- [ ] **Step 6: Update dialog aria label**

In `accountDialogAriaLabel()`, add this case before `link-google`:

```tsx
      case "auth-choice":
        return accountEntryIntent === "register" ? "Choose how to create a LineWatchTO account" : "Choose how to sign in to LineWatchTO";
```

- [ ] **Step 7: Make submit ignore provider-choice mode**

In `handleSubmitAccount`, after:

```tsx
    if (!accountDialogMode) return;
```

add:

```tsx
    if (accountDialogMode === "auth-choice") {
      return;
    }
```

- [ ] **Step 8: Run typecheck and verify this compile step**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx
git commit -m "feat: add auth provider choice state"
```

## Task 3: Provider Choice Dialog Body

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Add auth-choice branch before link-google branch**

In the account dialog form JSX, find:

```tsx
              {accountDialogMode === "link-google" ? (
```

Replace it with:

```tsx
              {accountDialogMode === "auth-choice" ? (
                <>
                  <div className="account-provider-stack">
                    <button
                      type="button"
                      className="account-choice-primary"
                      onClick={openEmailAuth}
                      disabled={accountBusy}
                    >
                      <Mail size={18} />
                      Continue With Email
                    </button>
                    {authConfig.googleSignInAvailable ? (
                      <>
                        <div className="account-auth-divider" aria-hidden="true">
                          <span>Or</span>
                        </div>
                        <div aria-label="Continue With Google">
                          <GoogleSignInButton
                            clientId={authConfig.googleClientId}
                            disabled={accountBusy}
                            onCredential={handleGoogleCredential}
                            onError={setAccountError}
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
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
                      setAccountEntryIntent(accountEntryIntent === "login" ? "register" : "login");
                    }}
                  >
                    {accountEntryIntent === "login" ? "Create Account" : "Already Have Account?"}
                  </button>
                </>
              ) : accountDialogMode === "link-google" ? (
```

- [ ] **Step 2: Remove the old Google slot from email form branch**

Later in the `login`/`register` branch, remove this block:

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

This avoids showing Google twice. Google belongs on the provider-choice screen; email forms should stay focused on email/password.

- [ ] **Step 3: Add Back To Options to email forms**

In the `login`/`register` branch, after the submit button:

```tsx
                  <button type="submit" className="account-primary-button" disabled={accountBusy}>
                    {accountDialogMode === "login" ? "Sign In" : "Create Account"}
                  </button>
```

add:

```tsx
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setAccountError(null);
                      setAccountDialogMode("auth-choice");
                    }}
                  >
                    Back To Options
                  </button>
```

- [ ] **Step 4: Run source test and typecheck**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
npm --prefix frontend run typecheck
```

Expected: source test still may fail on missing CSS, but typecheck should PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx
git commit -m "feat: add auth provider choice dialog"
```

## Task 4: Route Signed-Out Entry Points Through Provider Choice

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Replace panel prompt sign-in/create callbacks**

In `frontend/src/components/LineWatchShell.tsx`, replace every external signed-out auth callback that currently opens login/register directly:

```tsx
onRequestSignIn={() => setAccountDialogMode("login")}
onRequestCreateAccount={() => setAccountDialogMode("register")}
onRequestSignIn={() => { resetAccountForm(); setAccountDialogMode("login"); }}
onRequestCreateAccount={() => { resetAccountForm(); setAccountDialogMode("register"); }}
```

with:

```tsx
onRequestSignIn={() => openAuthChoice("login")}
onRequestCreateAccount={() => openAuthChoice("register")}
```

There are multiple occurrences for desktop/mobile panel variants. Use this command to confirm every external direct opener is gone except internal back links:

```bash
rg -n 'setAccountDialogMode\("login"\)|setAccountDialogMode\("register"\)|onRequestSignIn|onRequestCreateAccount' frontend/src/components/LineWatchShell.tsx
```

Expected remaining direct `setAccountDialogMode("login")` calls should only be internal back links from forgot/reset flows. `onRequestSignIn` and `onRequestCreateAccount` props should call `openAuthChoice(...)`.

- [ ] **Step 2: Replace desktop signed-out menu buttons**

In the signed-out account menu block, replace:

```tsx
onClick={() => { resetAccountForm(); setAccountDialogMode("login"); }}
```

with:

```tsx
onClick={() => openAuthChoice("login")}
```

Replace:

```tsx
onClick={() => { resetAccountForm(); setAccountDialogMode("register"); }}
```

with:

```tsx
onClick={() => openAuthChoice("register")}
```

- [ ] **Step 3: Keep internal forgot/reset navigation direct**

Do not change these existing internal flows:

```tsx
setAccountDialogMode("forgot-password")
setAccountDialogMode("reset-password")
setAccountDialogMode("login")
```

Those are back-navigation inside the email/password recovery flow, not external provider-choice entry points.

- [ ] **Step 4: Run source test and typecheck**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
npm --prefix frontend run typecheck
```

Expected: source test still may fail on missing CSS, but typecheck should PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx
git commit -m "feat: route auth entry points through provider choice"
```

## Task 5: Provider Choice Styling

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add stable provider-choice layout styles**

In `frontend/src/app/globals.css`, near `.google-sign-in-slot`, add:

```css
.account-provider-stack {
  display: grid;
  gap: 12px;
  width: 100%;
}

.account-choice-primary {
  align-items: center;
  background: rgb(15, 23, 42);
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 8px;
  color: white;
  display: inline-flex;
  font-size: 0.875rem;
  font-weight: 900;
  gap: 10px;
  justify-content: center;
  min-height: 44px;
  padding: 0.625rem 0.875rem;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  width: 100%;
}

.account-choice-primary:hover:not(:disabled),
.account-choice-primary:focus-visible {
  background: rgb(30, 41, 59);
  outline: none;
}

.account-choice-primary:active:not(:disabled) {
  transform: translateY(1px);
}

.dark .account-choice-primary,
.high-contrast .account-choice-primary {
  background: rgb(226, 232, 240);
  border-color: rgba(255, 255, 255, 0.16);
  color: rgb(15, 23, 42);
}

.dark .account-choice-primary:hover:not(:disabled),
.dark .account-choice-primary:focus-visible,
.high-contrast .account-choice-primary:hover:not(:disabled),
.high-contrast .account-choice-primary:focus-visible {
  background: rgb(241, 245, 249);
}
```

This keeps LineWatch styling neutral and does not copy the green Chess.com CTA.

- [ ] **Step 2: Run UI source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-ui-source.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "style: add auth provider choice controls"
```

## Task 6: Verification

**Files:**
- No new files. This validates the frontend-only change.

- [ ] **Step 1: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Manual browser check**

Run the frontend against a backend where Google auth is enabled:

```bash
npm --prefix frontend run dev
```

Expected signed-out behavior:

- Clicking `Sign In` opens a dialog titled `Sign in`.
- The first dialog body shows `Continue With Email`.
- If Google is configured, Google appears below the `Or` divider.
- Clicking `Continue With Email` opens the existing sign-in email/password form.
- The email/password form has `Back To Options`.
- Clicking `Create Account` opens the same provider-choice layout but titled `Create account`.
- Clicking `Continue With Email` from create-account intent opens the registration form.
- Clicking Google from either provider-choice intent signs in or creates a Google account using the existing backend behavior.
- Existing signed-in `Link Google` and `Google Linked` states still work.

## Post-Implementation Notes For Gemini

- Do not change backend auth logic in this plan.
- Do not remove email/password, forgot-password, reset-password, demo login, or Google linking.
- Do not duplicate the Google button inside the email/password form after adding the provider-choice screen.
- Use the existing official Google button wrapper; do not hand-draw a fake Google button.
- Keep the dashboard as the first screen. Do not add a landing page or separate auth page.

## Self-Review

- Spec coverage: The plan covers the current gap, provider-choice UX, all signed-out entry points, styling, tests, and verification.
- Placeholder scan: The plan uses concrete code snippets, commands, and expected behavior; no placeholders are needed.
- Type consistency: `auth-choice`, `AccountEntryIntent`, `openAuthChoice`, `openEmailAuth`, `account-provider-stack`, and `account-choice-primary` are named consistently across steps.
