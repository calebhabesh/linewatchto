# Native mobile workspace

There is no native application here yet. `android/` and `ios/` are placeholders
for future platform projects, not generated build output.

- Android may use Kotlin and Jetpack Compose; iOS may use Swift and SwiftUI.
- Choose structure and platform checks when implementing each app. Do not
  assume the former Expo / React Native prototype or its commands still exist.
- Use the backend API as the source of transit data and freshness decisions.
  Keep provider credentials and raw provider payloads server-side.
- Follow the root `AGENTS.md` source and domain rules for any new native feature.
