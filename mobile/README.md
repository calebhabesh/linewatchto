# Native mobile workspace

This is a blank slate for a future LineWatchTO mobile app. No Android or iOS
application is implemented, and there is no mobile build or test command yet.
The responsive website and installable PWA live in `frontend/`.

The `android/` and `ios/` directories are reserved for independent native
projects. Android can use Kotlin and Jetpack Compose; iOS can use Swift and
SwiftUI. No shared mobile framework or cross-platform architecture has been
selected. Start each project when its product scope and API needs are clear.

Future clients should use the Spring Boot API for transit data and its
source/freshness decisions. Keep provider credentials and raw provider payloads
server-side. Consult the root and platform guidance before implementation.
