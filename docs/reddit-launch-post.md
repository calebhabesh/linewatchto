# Reddit Post Title
I built LineWatchTO, a free unofficial TTC subway & LRT disruption dashboard

# Reddit Post Body
Hello r/TTC! 👋🏽

I ride the TTC regularly and wanted a faster, map-first way to check disruptions before leaving home—or quickly understand what is happening while travelling.

So I built [LineWatchTO.ca](https://linewatchto.ca/), a free, unofficial TTC subway and LRT reliability dashboard for Lines 1, 2, 4, 5, and 6.

It’s a progressive web app (PWA), so you can install it on your phone’s Home Screen and use it in an app-like layout without downloading it from an app store. It also works as a regular website on mobile and desktop.

No account is required for the main dashboard. A free account is only needed for saved commutes and push notifications.

Here’s what it currently does:

## 🗺️ Interactive Service Map

The map displays current subway and LRT disruptions directly over the affected lines, segments, and stations when fresh TTC alert data is available.

Suspensions, delays, Reduced Speed Zones, and planned closures have distinct visual treatments. Tap an affected segment or station to open the corresponding alert details.

If current TTC data becomes unavailable or stale, LineWatchTO labels that state instead of presenting old alerts as live.

## 🚇 Saved Commutes and Travel-time Impact

Save regular routes and immediately see whether current disruptions affect them. You can monitor an outbound trip, an optional return trip, or only a specific section of the route.

LineWatchTO shows the standard scheduled travel-time estimate alongside a confidence-labelled impact range when one can reasonably be calculated. Suspensions and closures are marked as unreliable instead of inventing a precise detour time.

A free account is required for saved commutes. Google sign-in is also available for convenience if you prefer.

## 🔔 Saved-route and Line Notifications

Set notification rules for the routes, days, time windows, travel directions, route sections, and event types you care about. This is intended to avoid sending every unrelated system-wide alert.

You can also subscribe to specific TTC lines and choose which types of events should generate notifications.

One Honest Caveat: because LineWatchTO is a PWA, its push notifications may not always behave like notifications from a native mobile app you download from the Google Play Store or Apple App Store. I’ve done what I can to make them as dependable as possible, but delivery is still best-effort and can vary by device.

In my testing, notifications from an iOS Home Screen installation have been much more consistent. Android notifications work, but Chrome and Android may delay them while the phone is idle or battery-managed. LineWatchTO includes Android setup guidance for improving delivery, but neither the app nor the website can guarantee immediate notification delivery.

Notifications are useful as an additional signal, but LineWatchTO is unofficial and should not be your only source for critical service information.

After creating an account, remember to enable notifications on the current device and select the saved routes or lines you want to monitor.

## ♿ Station Accessibility Details

Tap a station to view its wheelchair accessibility information, line-specific elevator facilities, and fresh elevator or escalator outage alerts when available.

The station accessibility metadata has been reviewed for every mapped subway and LRT stop rather than being inferred solely from alert text.

## 📋 Upcoming Planned Closures

Browse planned closures for today, this weekend, and later dates when they are available from the current TTC alert data.

## 📊 Source-labelled Train Arrivals

Station cards show upcoming arrivals by line and direction and refresh while the card is open.

Depending on current feed availability, arrivals may use TTC GTFS-RT estimates, TTC scheduled service, or a clearly labelled fallback. The app identifies the source rather than presenting scheduled times as live train predictions.

## 🚆 Estimated Trains on the Map

Enable **View Trains** to display schematic train markers derived from fresh TTC GTFS-RT Subway Trip Updates, the rapid-transit topology, and estimated segment travel times.

These are estimated placements, not exact GPS locations or representations of physical train movement. They are only shown during subway operating hours when sufficiently fresh mapped data is available. Feed coverage can vary by line (Line 5 currently doesn't consistently stream live tram trip updates).

The markers are powered by TTC’s public [GTFS-RT feeds](https://gtfsrt.ttc.ca/).

## 📈 Official TTC Performance Metrics

View the latest available TTC.ca performance statistics for subway, bus, streetcar, Wheel-Trans, elevators, and escalators in one place.

## ➕ Other Features

- Searchable service notices for bus and streetcar routes.
- Alert History covering up to 30 days.
- High-contrast and reduced-motion modes.
- Light and dark themes.
- Mobile and desktop layouts.
- An installable offline-safe app shell that does not present cached TTC alerts as current information.

---

LineWatchTO is free, unofficial, and has no ads. I built it as a portfolio and passion project.

The map and service information use public TTC sources, including Live Alerts, GTFS schedules, GTFS-RT feeds, and TTC.ca performance data. I appreciate that TTC makes this information available because independent tools like this would not otherwise be possible.

Alert descriptions can sometimes be vague, and mapping a text alert to an exact station segment is not always perfect. Please continue checking official TTC sources when making important travel decisions.

**Development Transparency:** I used AI coding tools as part of the development workflow, but I review, test, deploy, and maintain the application myself. The goal was to make TTC service information easier to understand and act on.

## Installing LineWatchTO

**iPhone using Safari**

1. Tap Safari’s Share button.
2. Select **Add to Home Screen**.
3. Tap **Add**.

An iOS Home Screen installation is required before the PWA can request notification permission.

**Android using Chrome**

1. Open Chrome’s three-dot menu.
2. Select **Install app** or **Add to Home screen**.
3. Confirm the installation.

You can also find platform-specific installation and Android notification guidance inside LineWatchTO.

I hope you find [LineWatchTO.ca](https://linewatchto.ca/) useful. I’d love to hear your feedback, feature requests, and bug reports.
