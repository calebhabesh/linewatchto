# Account, Keyboard, And Reduced Speed Zone Polish Design

## Goal

Finish the next portfolio-grade polish slice for LineWatch TO:

- add a small, logical account system whose purpose is saved commute preferences;
- improve keyboard behavior in the hamburger menu and station search;
- recolor all Reduced Speed Zone surfaces to Light Mint Green `#A6FBB2` so they no longer read as ordinary delays.

The dashboard remains public. An account should explain personalization, not gate the transit map.

## Scope

In scope:

- Backend-owned email/password auth for saved commute preferences.
- HTTP-only session cookies.
- Register, login, demo login, logout, and current-user endpoints.
- User-owned saved commute CRUD endpoints.
- Frontend account controls inside the existing hamburger menu.
- Signed-out, signed-in, and demo-account states in the Saved Commutes panel.
- Keyboard focus management and arrow-key navigation for the menu and station search.
- A shared Reduced Speed Zone color token applied to panels, menu badges, map overlays, station impact references, overlap badges, legend buttons, and icons.

Out of scope:

- Full trip planning.
- Push/email notifications.
- Password reset, email verification, OAuth, roles, admin screens, and JWTs.
- Blocking public dashboard access behind login.
- Full backend commute-impact matching or reliability personalization.
- Storing TTC API credentials or user secrets outside local environment variables.

## Account Model

Accounts exist for one reason in this slice: persist saved rapid-transit commute preferences across browsers and demo sessions.

A user record stores:

- normalized email;
- display name;
- BCrypt password hash;
- demo-account flag;
- creation and last-login timestamps.

A saved commute stores:

- owner user id;
- commute id;
- label;
- origin station id;
- destination station id;
- created and updated timestamps.

The first implementation should support same-line rapid-transit saved commutes cleanly because station ordering already exists in the station search layer. Transfer commute impact matching can remain a future backend feature.

## Backend Design

Add an `account` package under `backend/src/main/java/com/calebhabesh/linewatch/account/`.

Core units:

- `AccountEntity`, `AccountRepository`: user persistence.
- `UserSessionEntity`, `UserSessionRepository`: hashed session-token persistence.
- `SavedCommuteEntity`, `SavedCommuteRepository`: user-owned commute preferences.
- `PasswordHasher`: wraps BCrypt from `spring-security-crypto`.
- `SessionTokenService`: generates secure random tokens, stores only SHA-256 token hashes, and resolves the current user from the `linewatch_session` cookie.
- `AccountService`: register, login, demo login, logout, current user.
- `SavedCommuteService`: list, create, and delete saved commutes for the current user.
- `AccountController`: `/api/auth/*`.
- `SavedCommuteController`: `/api/account/commutes`.
- `AuthCorsConfiguration`: development CORS for credentialed browser calls from the Next.js origin.

Use a small dependency on `org.springframework.security:spring-security-crypto` for BCrypt only. Do not add `spring-boot-starter-security` in this slice, because the dashboard APIs should remain public and a manual session-cookie boundary is enough for this account feature.

## API Contract

Authentication endpoints:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/demo
POST /api/auth/logout
GET  /api/auth/me
```

Register request:

```json
{
  "email": "rider@example.com",
  "password": "correct horse battery staple",
  "displayName": "Rider"
}
```

Login request:

```json
{
  "email": "rider@example.com",
  "password": "correct horse battery staple"
}
```

Auth response:

```json
{
  "authenticated": true,
  "user": {
    "id": "user_01",
    "email": "rider@example.com",
    "displayName": "Rider",
    "demo": false
  }
}
```

Signed-out `GET /api/auth/me` response:

```json
{
  "authenticated": false,
  "user": null
}
```

Saved commute endpoints:

```text
GET    /api/account/commutes
POST   /api/account/commutes
DELETE /api/account/commutes/{id}
```

Create saved commute request:

```json
{
  "label": "Morning commute",
  "originStationId": "finch",
  "destinationStationId": "union"
}
```

Saved commute response:

```json
{
  "id": "commute_01",
  "label": "Morning commute",
  "originStationId": "finch",
  "originStationName": "Finch",
  "destinationStationId": "union",
  "destinationStationName": "Union",
  "routeLabel": "Finch -> Union",
  "createdAt": "2026-06-05T14:30:00Z",
  "updatedAt": "2026-06-05T14:30:00Z"
}
```

## Cookie And Security Behavior

Use a cookie named `linewatch_session`.

Cookie attributes:

- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- `Max-Age` matching session expiry;
- `Secure` when `linewatch.auth.secure-cookie=true`.

Session rows store only the token hash. Logout deletes the current session row and sends an expired cookie. Expired sessions are ignored and may be cleaned opportunistically during login or session resolution.

Validation:

- Email is required, normalized to lowercase, and unique.
- Password is required and at least 10 characters.
- Display name is optional and defaults to the email local part.
- Commute origin and destination must be different valid mapped station ids.
- Duplicate saved commute origin/destination pairs for the same user are rejected with a clear 409 response.

Error responses use a small consistent shape:

```json
{
  "error": "invalid_credentials",
  "message": "Email or password is incorrect."
}
```

## Demo Account

`POST /api/auth/demo` signs the browser into a seeded demo account without requiring a password. This is useful for portfolio reviewers.

The demo account should be safe to reset:

- use a fixed normalized email such as `demo@linewatch.local`;
- mark the account as `demo=true`;
- seed two or three saved commutes if none exist;
- allow creating and deleting demo saved commutes during a local session.

The UI labels this state as `Demo account` so it does not look like live user data from a production service.

## Frontend Account UX

Add account state to `LineWatchShell`.

Signed out:

- hamburger menu shows `Sign in`, `Create account`, and `Demo account`;
- Saved Commutes panel keeps the existing fixture-backed commute cards visible but labels them as demo examples;
- panel includes a compact sign-in/create/demo action row.

Signed in:

- hamburger menu shows the display name or email;
- Saved Commutes panel loads `/api/account/commutes`;
- user can add a commute from station selectors backed by the existing station summary list;
- user can delete a saved commute;
- sign-out returns the panel to demo examples.

The account controls should feel like dashboard utilities, not a landing page. Use a compact panel/modal treatment and keep the map-first screen intact.

## Saved Commute Impact Display

This slice should not claim the planned backend commute-impact engine is complete.

For account-owned saved commutes, show route preferences and a source label such as `Saved to account`. If a simple same-line overlap summary can be computed from already-loaded dashboard segments and station ordering, show it as a frontend helper with a conservative label. If the route requires transfer logic, show `Impact matching pending` rather than inventing accuracy.

Fixture commute cards remain available when signed out or when backend auth is unavailable.

## Keyboard Design

Hamburger menu:

- menu toggle has `aria-expanded`, `aria-controls`, and returns focus when the menu closes;
- open menu receives focus on the first actionable item;
- `Escape` closes the menu;
- `ArrowDown`, `ArrowUp`, `Home`, and `End` move between menu actions;
- active submenu buttons expose `aria-current="page"`;
- high-contrast and reduced-motion toggles expose `aria-pressed`;
- icon-only and back buttons receive explicit `aria-label` values.

Station search:

- search toggle has `aria-expanded`, `aria-controls`, and returns focus when search closes;
- opening search focuses the input;
- `Escape` clears a non-empty query, then closes search when the query is empty;
- `ArrowDown` from the input focuses the first result or first line trigger;
- query result buttons support arrow-key cycling;
- browse mode supports arrow-key movement through line triggers and station buttons;
- selecting a station closes search, returns focus to the search button, and keeps the selected station detail visible.

Existing keyboard-accessible surfaces should remain intact:

- map zoom and center controls;
- station hit targets;
- station impact rings;
- station detail buttons;
- legend impact buttons, which need `aria-label` in addition to `title`.

## Reduced Speed Zone Color Design

Define shared color tokens in `frontend/src/app/globals.css`:

```css
:root {
  --impact-rsz: #A6FBB2;
  --impact-rsz-ink: #14532d;
  --impact-rsz-soft: rgba(166, 251, 178, 0.14);
  --impact-rsz-border: rgba(166, 251, 178, 0.55);
}
```

Use these tokens for all Reduced Speed Zone references:

- map overlay glow;
- chevrons and chevron masks;
- overlap badge fill/stroke;
- `ImpactTypeIcon` color;
- overlap impact reference border/background;
- Reduced Speed Zone panel heading icon, count badge, card left border, and active-card background;
- hamburger menu badge and at-a-glance line-status icon;
- line legend Reduced Speed Zone icon button;
- station impact card icon and tone for reduced-speed-zone impacts.

Ordinary delays remain amber/orange. Suspensions remain red. Planned closures remain blue.

Because `#A6FBB2` is light, text on mint surfaces should use dark green ink in light mode and the mint foreground in dark mode. Do not use mint as a large page background.

## Data Flow

Initial dashboard load remains unchanged:

```text
Next.js Server Component
  -> public Spring dashboard APIs
  -> fixture fallback if public dashboard APIs fail
```

Account flow is client-side after hydration:

```text
LineWatchShell
  -> GET /api/auth/me with credentials
  -> Signed-out or signed-in account state
  -> SavedCommutesPanel
  -> GET /api/account/commutes when authenticated
```

Auth mutations:

```text
Register/Login/Demo button
  -> POST /api/auth/*
  -> backend sets linewatch_session cookie
  -> frontend refreshes account state and saved commutes
```

Logout:

```text
Sign out
  -> POST /api/auth/logout
  -> backend expires cookie
  -> frontend clears account-owned commute state
```

## Testing

Backend:

- migration test for `accounts`, `user_sessions`, and `saved_commutes`;
- password hashing test that stored hashes differ from plaintext and verify correctly;
- session token test that only hashes are stored and expired sessions are rejected;
- controller tests for register, duplicate email, login, invalid login, demo login, logout, current user, unauthorized saved commute access, create/list/delete saved commute, invalid station id, and duplicate commute.

Frontend fixture tests:

- account adapter maps signed-out, signed-in, and backend-unavailable states;
- Saved Commutes panel source contains signed-out prompt, demo account state, and account-backed state;
- keyboard structure test verifies menu/search `aria-*`, `Escape`, and arrow-key handlers are present;
- RSZ color test verifies `#A6FBB2` and CSS variables are used for reduced-speed-zone selectors while delay selectors remain amber.

Smoke tests:

- keyboard opens menu, moves through entries, opens Saved Commutes, and closes with Escape;
- keyboard opens station search, cycles results, selects a station, and sees station details;
- demo account login shows account-backed saved commutes;
- Reduced Speed Zone map/card/legend surfaces are visually distinct from delays.

Verification commands:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
mvn -f backend/pom.xml test
```

If smoke tests cannot run because browsers or local services are missing, report the exact failing command and reason.

## Documentation

Update `README.md`, `AGENTS.md`, and `GEMINI.md` after implementation:

- Account system exists for saved commute preferences.
- Demo account is for portfolio review and local demos.
- Public dashboard remains usable without login.
- Saved commute impact matching is conservative and not the future full commute-impact backend unless that engine is implemented.
- Reduced Speed Zones use Light Mint Green `#A6FBB2`.

Do not claim production-grade account recovery, OAuth, notifications, or full commute-impact matching.
