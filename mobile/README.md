# LineWatchTO Mobile

This directory contains the native Android/iOS prototype for LineWatchTO. It is one React Native + TypeScript app using Expo SDK 57, Expo Router, Continuous Native Generation, and EAS Build. The existing Spring Boot API remains the source of transit data and freshness decisions.

The mobile app is an unofficial client. It never bundles TTC, Metrolinx, database, VAPID, APNs, FCM, or Cloudflare credentials. It does not silently replace failed API reads with fixtures.

## Prerequisites

- Node.js 22.13 or newer.
- Android Studio/emulator or an Android device for local native development.
- An Expo account for EAS builds.
- A physical iPhone/TestFlight tester for iOS validation; local Xcode is not required when builds run on EAS.

## Start locally

```bash
npm --prefix mobile ci
cp mobile/.env.example mobile/.env.local
npm --prefix mobile run start:go
```

`start:go` is useful while the app only uses Expo Go-compatible modules. Use a development build for normal work:

```bash
cd mobile
npx eas-cli@latest build --profile development --platform android
npm run start
```

For a locally installed Android SDK/emulator, `npm run android` generates the native project and builds it locally. Generated `android/` and `ios/` directories remain ignored; app configuration lives in `app.config.ts`.

API URL behavior:

- Android emulator development defaults to `http://10.0.2.2:8080`.
- iOS simulator development defaults to `http://127.0.0.1:8080`.
- Physical devices need a LAN-reachable backend or mobile-compatible HTTPS staging API.
- Preview and production builds must set `EXPO_PUBLIC_LINEWATCH_API_BASE_URL` in the matching EAS environment.
- Do not embed a Cloudflare Access service token in the app.

## Verification

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
npm --prefix mobile run doctor
npm --prefix mobile run export:android
```

The Maestro smoke flow in `.maestro/dashboard-smoke.yml` requires an installed development build and emulator/device.

## Architecture boundaries

- `src/api/`: network client, runtime response schemas, query keys/hooks.
- `src/app/`: Expo Router routes only.
- `src/features/`: screen/domain implementations.
- `src/components/`: reusable native UI.
- `src/providers/`: query persistence and app lifecycle wiring.
- `src/storage/`: sensitive storage adapters. Only opaque native session credentials belong in SecureStore.
- `src/theme/`: typed design tokens and display preferences.

TanStack Query owns server state. React context owns small local preferences. Do not add Redux until a concrete shared-state problem warrants it.

## Current prototype boundary

Implemented here:

- map-first tab shell and persistent TTC / GO & UP selection;
- runtime validation of `GET /api/dashboard?network=ttc|regional`;
- foreground-only 20-second refresh, pull-to-refresh, and a 30-minute persisted cache;
- explicit unavailable, cached, and backend-provided source-live states;
- line status cards and current/planned impact summaries;
- an initial TTC `react-native-svg` segment renderer with impact selection;
- regional renderer boundary without inventing geometry absent from the API;
- station catalog/search shell;
- dark/high-contrast tokens and accessibility labels;
- SecureStore adapter reserved for the future native bearer session;
- unit/contract tests, CI export, EAS profiles, and Maestro smoke skeleton.

Not implemented yet: authored raster map planes, pan/pinch transforms, complete card-to-map selection, station detail endpoints, accounts, native bearer auth, My Stations, My Commutes, or native push. The SecureStore adapter does not imply the backend can issue bearer tokens today.
