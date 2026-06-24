# Mobile Push Notification Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every supported LineWatchTO mobile Web Push alert identify the TTC line, line name, event type, lifecycle state, location, saved-commute context, and trustworthy Toronto event time in a consistent Android-friendly format.

**Architecture:** Add a shared rapid-transit line catalog and one backend notification formatter. Planners provide structured facts, persisted push events retain the facts needed for precise same-tag clearances, and the service worker displays the backend content with both an Android icon and monochrome badge while suppressing stale generic fallback noise.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway, PostgreSQL, Java Time, Next.js PWA service worker JavaScript, Node built-in tests, Maven.

---

## Implementation Constraints

- Preserve the existing notification preference model, stable notification keys, Web Push topics, dedupe keys, deep links, and freshness checks.
- Do not add push delivery for accessibility outages or surface service notices.
- Do not copy full TTC descriptions into notification bodies.
- Do not invent an alert start time. If the source start is absent, omit the clock line.
- Clearance time means the injected dispatch clock instant when LineWatch detects that the event no longer matches.
- The clock line is only `🕗 MMM d, h:mm a`; it never includes `Started`, `Cleared`, `Updated`, or `Detected`.
- User-authored saved-commute labels retain their capitalization.
- Clearances keep the original notification tag and remain silent.
- `PendingPushNotification.timestamp` remains event creation time for Android ordering. It is not replaced with the source event time.
- Update `AGENTS.md` and `GEMINI.md` together.
- Treat scenario feeds as synthetic unless a captured source sample is explicitly documented.

## Gemini 3.5 Flash Execution Notes

- Execute tasks in order; later constructor and entity steps depend on earlier record changes.
- Do not replace the formatter architecture with planner-specific string concatenation.
- Do not preserve compilation by adding a legacy candidate constructor that lacks lifecycle context.
- Use the exact tests and copy in this plan as the acceptance contract.
- Keep unrelated worktree changes untouched.
- If a command fails because a service or credential is unavailable, record the exact command and error; continue only when the remaining work can still be verified honestly.

## Approved Copy

Active:

```text
⚠️ Line 2 Bloor-Danforth Suspension
Broadview to Victoria Park.
🕗 Jun 21, 7:19 PM
```

Cleared:

```text
✅ Line 2 Bloor-Danforth Suspension Cleared
Service between Broadview and Victoria Park has been restored.
🕗 Jun 21, 8:04 PM
```

Saved commute:

```text
⚠️ Line 1 Yonge-University Delay
Finch to Union.
Affects Morning commute (Outbound).
🕗 Jun 5, 10:20 AM
```

## File Map

Create:

- `backend/src/main/resources/db/migration/V28__push_notification_content.sql`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineCatalog.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationFacts.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/FormattedPushNotification.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationFormatter.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineCatalogTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationFormatterTest.java`

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/VapidWebPushClient.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/VapidWebPushClientSpringContextTest.java`
- `frontend/public/sw.js`
- `frontend/tests/pwa.test.mjs`
- `README.md`
- `AGENTS.md`
- `GEMINI.md`

## Task 1: Establish The Baseline

**Files:**

- Read: `AGENTS.md`
- Read: `GEMINI.md`
- Read: `docs/superpowers/specs/2026-06-22-mobile-push-notification-content-design.md`
- Read: `backend/src/main/java/com/calebhabesh/linewatch/push/`
- Read: `frontend/public/sw.js`
- Read: `frontend/tests/pwa.test.mjs`

- [ ] **Step 1: Confirm worktree state**

Run:

```bash
git status --short
```

Expected: no unexpected edits. Preserve every pre-existing user change and do not reset unrelated files.

- [ ] **Step 2: Run the focused backend baseline**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.*Test'
```

Expected: PASS before behavior changes. If it fails, record the failing test names and stop before modifying notification behavior.

- [ ] **Step 3: Run the frontend PWA baseline**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: PASS before service-worker behavior changes.

- [ ] **Step 4: Record the current generic behavior**

Confirm these existing assertions are present:

```text
Commute alert cleared
Line alert cleared
LineWatchTO commute update
TTL = 300
no notification icon
```

Expected: these strings identify the exact behavior replaced by later tasks.

## Task 2: Add The Persisted Notification Context Migration

**Files:**

- Create: `backend/src/main/resources/db/migration/V28__push_notification_content.sql`

- [ ] **Step 1: Add the Flyway migration**

Create `V28__push_notification_content.sql` with:

```sql
alter table push_notification_events
    add column notification_subject varchar(120);

alter table push_notification_events
    add column event_location text;

alter table push_notification_events
    add column scope_label varchar(180);

alter table push_notification_events
    add column source_event_at timestamp with time zone;

alter table push_notification_events
    alter column body type text;

update push_notification_events
set notification_subject =
    case
        when line_id in ('line-1', 'line-2', 'line-4', 'line-5', 'line-6') then
            case line_id
                when 'line-1' then 'Line 1 Yonge-University'
                when 'line-2' then 'Line 2 Bloor-Danforth'
                when 'line-4' then 'Line 4 Sheppard'
                when 'line-5' then 'Line 5 Eglinton'
                when 'line-6' then 'Line 6 Finch West'
            end
            || ' '
            || case event_type
                when 'suspension' then 'Suspension'
                when 'delay' then 'Delay'
                when 'reduced-speed-zone' then 'Reduced Speed Zone'
                when 'planned-closure' then 'Planned Closure'
                else 'Service Alert'
            end
        else 'TTC Service Alert'
    end
where notification_subject is null;

alter table push_notification_events
    alter column notification_subject set not null;
```

Do not backfill `event_location`, `scope_label`, or `source_event_at`. Existing rows do not contain enough reliable structured information.

- [ ] **Step 2: Check migration ordering and SQL style**

Run:

```bash
ls backend/src/main/resources/db/migration | sort -V | tail -8
```

Expected:

```text
V21__line_segment_fallback_travel_times.sql
V22__push_notifications.sql
V23__push_notification_lifecycle.sql
V24__notification_preferences.sql
V25__surface_service_notices.sql
V26__surface_service_notice_direction.sql
V27__gtfs_schedule_refresh_runs.sql
V28__push_notification_content.sql
```

- [ ] **Step 3: Check the migration diff**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V28__push_notification_content.sql
git commit -m "feat: persist push notification content context"
```

## Task 3: Add The Shared Line Catalog

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineCatalog.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineCatalogTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`

- [ ] **Step 1: Write the failing catalog test**

Create `PushLineCatalogTest.java`:

```java
package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PushLineCatalogTest {
    @Test
    void exposesSupportedRapidTransitLinesInDisplayOrder() {
        assertThat(PushLineCatalog.supportedLines())
            .extracting(PushLineCatalog.LineMetadata::id)
            .containsExactly("line-1", "line-2", "line-4", "line-5", "line-6");

        assertThat(PushLineCatalog.supportedLines())
            .extracting(PushLineCatalog.LineMetadata::identity)
            .containsExactly(
                "Line 1 Yonge-University",
                "Line 2 Bloor-Danforth",
                "Line 4 Sheppard",
                "Line 5 Eglinton",
                "Line 6 Finch West"
            );
    }

    @Test
    void usesAvailableLineNumberWithoutInventingAnUnknownLineName() {
        assertThat(PushLineCatalog.identity("line-3", "3")).isEqualTo("Line 3");
        assertThat(PushLineCatalog.identity("unknown", null)).isEqualTo("TTC");
    }
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushLineCatalogTest'
```

Expected: FAIL because `PushLineCatalog` does not exist.

- [ ] **Step 3: Implement the catalog**

Create `PushLineCatalog.java`:

```java
package com.calebhabesh.linewatch.push;

import java.util.List;

public final class PushLineCatalog {
    private static final List<LineMetadata> SUPPORTED_LINES = List.of(
        new LineMetadata("line-1", "1", "Yonge-University"),
        new LineMetadata("line-2", "2", "Bloor-Danforth"),
        new LineMetadata("line-4", "4", "Sheppard"),
        new LineMetadata("line-5", "5", "Eglinton"),
        new LineMetadata("line-6", "6", "Finch West")
    );

    private PushLineCatalog() {}

    public static List<LineMetadata> supportedLines() {
        return SUPPORTED_LINES;
    }

    public static String identity(String lineId, String fallbackLineNumber) {
        return SUPPORTED_LINES.stream()
            .filter(line -> line.id().equals(lineId))
            .findFirst()
            .map(LineMetadata::identity)
            .orElseGet(() -> {
                String number = normalize(fallbackLineNumber);
                return number.isEmpty() ? "TTC" : "Line " + number;
            });
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    public record LineMetadata(String id, String number, String label) {
        public String identity() {
            return "Line " + number + " " + label;
        }
    }
}
```

- [ ] **Step 4: Replace preference-service line duplication**

In `PushNotificationPreferenceService.java`:

1. Delete the private `LineMetadata` record.
2. Delete the private `SUPPORTED_LINES` list.
3. Replace each `SUPPORTED_LINES` reference with `PushLineCatalog.supportedLines()`.
4. Change loop types to `PushLineCatalog.LineMetadata`.

The supported-line validation becomes:

```java
boolean isSupported = PushLineCatalog.supportedLines().stream()
    .anyMatch(line -> line.id().equals(lineId));
```

- [ ] **Step 5: Run catalog and preference tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushLineCatalogTest,com.calebhabesh.linewatch.push.PushNotificationPreferenceServiceTest'
```

Expected: PASS. The preferences API still returns Lines 1, 2, 4, 5, and 6 in the same order and with the same labels.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushLineCatalog.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushLineCatalogTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java
git commit -m "refactor: share rapid transit push line metadata"
```

## Task 4: Implement The Canonical Notification Formatter

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationFacts.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/FormattedPushNotification.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationFormatter.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationFormatterTest.java`

- [ ] **Step 1: Define formatter input and output records**

Create `PushNotificationFacts.java`:

```java
package com.calebhabesh.linewatch.push;

import java.time.Instant;

public record PushNotificationFacts(
    String lineId,
    String lineNumber,
    String eventType,
    String reminderBucket,
    String location,
    String displayDirection,
    boolean shuttle,
    String commuteLabel,
    String legId,
    Instant sourceEventAt
) {}
```

Create `FormattedPushNotification.java`:

```java
package com.calebhabesh.linewatch.push;

import java.time.Instant;

public record FormattedPushNotification(
    String title,
    String body,
    String notificationSubject,
    String eventLocation,
    String scopeLabel,
    Instant sourceEventAt
) {}
```

- [ ] **Step 2: Write the failing formatter tests**

Create `PushNotificationFormatterTest.java` with these tests:

```java
package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushNotificationFormatterTest {
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();

    @Test
    void formatsActiveSuspensionWithCanonicalTitleAndTorontoTime() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-2",
            "2",
            "suspension",
            "on-change",
            "Broadview to Victoria Park",
            null,
            false,
            null,
            null,
            Instant.parse("2026-06-21T23:19:00Z")
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Suspension");
        assertThat(result.body()).isEqualTo("""
            Broadview to Victoria Park.
            🕗 Jun 21, 7:19 PM""");
        assertThat(result.notificationSubject()).isEqualTo("Line 2 Bloor-Danforth Suspension");
        assertThat(result.eventLocation()).isEqualTo("Broadview to Victoria Park");
        assertThat(result.scopeLabel()).isNull();
        assertThat(result.sourceEventAt()).isEqualTo(Instant.parse("2026-06-21T23:19:00Z"));
    }

    @Test
    void formatsSavedCommuteContextWithoutChangingUserCapitalization() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-1",
            "1",
            "delay",
            "on-change",
            "Finch to Union",
            "Southbound",
            false,
            "Morning commute",
            "outbound",
            Instant.parse("2026-06-05T14:20:00Z")
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 1 Yonge-University Delay");
        assertThat(result.body()).isEqualTo("""
            Finch to Union.
            Southbound.
            Affects Morning commute (Outbound).
            🕗 Jun 5, 10:20 AM""");
        assertThat(result.scopeLabel()).isEqualTo("Morning commute (Outbound)");
    }

    @Test
    void formatsReturnLegAndPlannedReminder() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-2",
            "2",
            "planned-closure",
            "closure-morning",
            "Keele to Union",
            null,
            true,
            "Evening Route",
            "return",
            Instant.parse("2026-06-07T04:00:00Z")
        ));

        assertThat(result.body()).isEqualTo("""
            Keele to Union.
            Shuttle buses are running.
            Starts today.
            Affects Evening Route (Return).
            🕗 Jun 7, 12:00 AM""");
    }

    @Test
    void omitsClockLineWhenSourceStartIsUnknown() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-4",
            "4",
            "delay",
            "on-change",
            null,
            null,
            false,
            null,
            null,
            null
        ));

        assertThat(result.title()).isEqualTo("⚠️ Line 4 Sheppard Delay");
        assertThat(result.body()).isEqualTo("Service is affected on this line.");
        assertThat(result.body()).doesNotContain("🕗");
    }

    @Test
    void formatsClearanceFromPersistedContextAndSuppliedClock() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 2 Bloor-Danforth Suspension",
            "Broadview to Victoria Park",
            null,
            Instant.parse("2026-06-22T00:04:00Z")
        );

        assertThat(result.title()).isEqualTo("✅ Line 2 Bloor-Danforth Suspension Cleared");
        assertThat(result.body()).isEqualTo("""
            Service between Broadview and Victoria Park has been restored.
            🕗 Jun 21, 8:04 PM""");
        assertThat(result.sourceEventAt()).isEqualTo(Instant.parse("2026-06-22T00:04:00Z"));
    }

    @Test
    void formatsStationOnlyClearanceAndSavedCommuteContext() {
        FormattedPushNotification result = formatter.formatCleared(
            "Line 2 Bloor-Danforth Delay",
            "Main Street Station",
            "Work Trip (Outbound)",
            Instant.parse("2026-06-05T15:00:00Z")
        );

        assertThat(result.body()).isEqualTo("""
            Service affecting Main Street Station has been restored.
            No longer affects Work Trip (Outbound).
            🕗 Jun 5, 11:00 AM""");
    }

    @Test
    void formatsWinterTimeUsingTorontoStandardTime() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-5",
            "5",
            "reduced-speed-zone",
            "on-change",
            "Mount Dennis to Keelesdale",
            null,
            false,
            null,
            null,
            Instant.parse("2026-01-21T00:19:00Z")
        ));

        assertThat(result.body()).endsWith("🕗 Jan 20, 7:19 PM");
    }

    @Test
    void usesControlledFallbacksForUnknownLineAndEvent() {
        FormattedPushNotification numbered = formatter.formatActive(new PushNotificationFacts(
            "line-3", "3", "unknown", "on-change", "Test location", null, false, null, null, null
        ));
        FormattedPushNotification unnumbered = formatter.formatActive(new PushNotificationFacts(
            "unknown", null, "delay", "on-change", null, null, false, null, null, null
        ));

        assertThat(numbered.title()).isEqualTo("⚠️ Line 3 Service Alert");
        assertThat(unnumbered.title()).isEqualTo("⚠️ TTC Service Alert");
    }

    @Test
    void normalizesWhitespaceAndAvoidsDuplicateDirectionAndPunctuation() {
        FormattedPushNotification result = formatter.formatActive(new PushNotificationFacts(
            "line-1",
            "1",
            "delay",
            "closure-24h",
            "  Delays   southbound at Eglinton Station... ",
            "Southbound",
            false,
            null,
            null,
            null
        ));

        assertThat(result.body()).isEqualTo("""
            Delays southbound at Eglinton Station.
            Starts within 24 hours.""");
    }
}
```

- [ ] **Step 3: Run the formatter tests and verify failure**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationFormatterTest'
```

Expected: FAIL because `PushNotificationFormatter` does not exist.

- [ ] **Step 4: Implement the formatter**

Create `PushNotificationFormatter.java`:

```java
package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class PushNotificationFormatter {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter EVENT_TIME_FORMATTER =
        DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.ENGLISH).withZone(TORONTO_ZONE);
    private static final Pattern BETWEEN_PATTERN =
        Pattern.compile("(?i)^between\\s+(.+?)\\s+and\\s+(.+)$");
    private static final Pattern TO_PATTERN =
        Pattern.compile("(?i)^(.+?)\\s+to\\s+(.+)$");

    public FormattedPushNotification formatActive(PushNotificationFacts facts) {
        String subject = notificationSubject(facts.lineId(), facts.lineNumber(), facts.eventType());
        String location = normalizeText(facts.location());
        String scopeLabel = scopeLabel(facts.commuteLabel(), facts.legId());
        List<String> bodyParts = new ArrayList<>();

        bodyParts.add(location.isEmpty() ? "Service is affected on this line." : sentence(location));

        String direction = normalizeText(facts.displayDirection());
        if (!direction.isEmpty() && !containsIgnoreCase(location, direction)) {
            bodyParts.add(sentence(direction));
        }
        if (facts.shuttle()) {
            bodyParts.add("Shuttle buses are running.");
        }
        if ("closure-24h".equals(facts.reminderBucket())) {
            bodyParts.add("Starts within 24 hours.");
        } else if ("closure-morning".equals(facts.reminderBucket())) {
            bodyParts.add("Starts today.");
        }
        if (scopeLabel != null) {
            bodyParts.add("Affects " + scopeLabel + ".");
        }
        if (facts.sourceEventAt() != null) {
            bodyParts.add(clockLine(facts.sourceEventAt()));
        }

        return new FormattedPushNotification(
            "⚠️ " + subject,
            String.join("\n", bodyParts),
            subject,
            location.isEmpty() ? null : location,
            scopeLabel,
            facts.sourceEventAt()
        );
    }

    public FormattedPushNotification formatCleared(
        String notificationSubject,
        String eventLocation,
        String scopeLabel,
        Instant clearedAt
    ) {
        String subject = normalizeText(notificationSubject);
        if (subject.isEmpty()) {
            subject = "TTC Service Alert";
        }
        String location = normalizeText(eventLocation);
        String normalizedScope = emptyToNull(normalizeText(scopeLabel));
        List<String> bodyParts = new ArrayList<>();
        bodyParts.add(clearanceSentence(location));
        if (normalizedScope != null) {
            bodyParts.add("No longer affects " + normalizedScope + ".");
        }
        bodyParts.add(clockLine(clearedAt));

        return new FormattedPushNotification(
            "✅ " + subject + " Cleared",
            String.join("\n", bodyParts),
            subject,
            location.isEmpty() ? null : location,
            normalizedScope,
            clearedAt
        );
    }

    private String notificationSubject(String lineId, String lineNumber, String eventType) {
        String identity = PushLineCatalog.identity(lineId, lineNumber);
        if ("TTC".equals(identity)) {
            return "TTC Service Alert";
        }
        return identity + " " + eventLabel(eventType);
    }

    private String eventLabel(String eventType) {
        return switch (normalizeText(eventType).toLowerCase(Locale.ROOT)) {
            case "suspension" -> "Suspension";
            case "delay" -> "Delay";
            case "reduced-speed-zone" -> "Reduced Speed Zone";
            case "planned-closure" -> "Planned Closure";
            default -> "Service Alert";
        };
    }

    private String scopeLabel(String commuteLabel, String legId) {
        String label = normalizeText(commuteLabel);
        if (label.isEmpty()) {
            return null;
        }
        String leg = "return".equalsIgnoreCase(normalizeText(legId)) ? "Return" : "Outbound";
        return label + " (" + leg + ")";
    }

    private String clearanceSentence(String location) {
        if (location.isEmpty()) {
            return "Service on this line has been restored.";
        }

        String withoutPunctuation = stripTerminalPunctuation(location);
        Matcher betweenMatcher = BETWEEN_PATTERN.matcher(withoutPunctuation);
        if (betweenMatcher.matches()) {
            return "Service between "
                + betweenMatcher.group(1).trim()
                + " and "
                + betweenMatcher.group(2).trim()
                + " has been restored.";
        }

        Matcher toMatcher = TO_PATTERN.matcher(withoutPunctuation);
        if (toMatcher.matches()) {
            return "Service between "
                + toMatcher.group(1).trim()
                + " and "
                + toMatcher.group(2).trim()
                + " has been restored.";
        }

        return "Service affecting " + withoutPunctuation + " has been restored.";
    }

    private String sentence(String value) {
        return stripTerminalPunctuation(value) + ".";
    }

    private String stripTerminalPunctuation(String value) {
        return value.replaceFirst("[.!?:;]+$", "").trim();
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    private String emptyToNull(String value) {
        return value.isEmpty() ? null : value;
    }

    private boolean containsIgnoreCase(String text, String expectedPart) {
        return text.toLowerCase(Locale.ROOT).contains(expectedPart.toLowerCase(Locale.ROOT));
    }

    private String clockLine(Instant instant) {
        return "🕗 " + EVENT_TIME_FORMATTER.format(instant);
    }
}
```

- [ ] **Step 5: Run formatter and catalog tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationFormatterTest,com.calebhabesh.linewatch.push.PushLineCatalogTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationFacts.java backend/src/main/java/com/calebhabesh/linewatch/push/FormattedPushNotification.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationFormatter.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationFormatterTest.java
git commit -m "feat: format precise mobile push content"
```

## Task 5: Refactor Notification Candidates To Carry Structured Content

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
- Modify: backend push tests that directly construct candidates

- [ ] **Step 1: Change the candidate record**

Replace `PushNotificationCandidate.java` with:

```java
package com.calebhabesh.linewatch.push;

import java.time.Instant;

public record PushNotificationCandidate(
    String accountId,
    String commuteId,
    String legId,
    String lineId,
    String lineNumber,
    String category,
    String eventType,
    String reminderBucket,
    String notificationKey,
    String dedupeKey,
    FormattedPushNotification notification,
    String url
) {
    public boolean savedCommuteScoped() {
        return commuteId != null && !commuteId.isBlank();
    }

    public boolean lineScoped() {
        return lineId != null && !lineId.isBlank() && !savedCommuteScoped();
    }

    public boolean clearedUpdate() {
        return "service-restored".equals(eventType);
    }

    public String title() {
        return notification.title();
    }

    public String body() {
        return notification.body();
    }

    public String notificationSubject() {
        return notification.notificationSubject();
    }

    public String eventLocation() {
        return notification.eventLocation();
    }

    public String scopeLabel() {
        return notification.scopeLabel();
    }

    public Instant sourceEventAt() {
        return notification.sourceEventAt();
    }
}
```

- [ ] **Step 2: Add a candidate helper to tests that construct candidates directly**

In `PushNotificationDispatchServiceTest.java` and `PushNotificationServiceTest.java`, add:

```java
private final PushNotificationFormatter formatter = new PushNotificationFormatter();

private PushNotificationCandidate candidate(
    String commuteId,
    String legId,
    String lineId,
    String lineNumber,
    String category,
    String eventType,
    String reminderBucket,
    String notificationKey,
    String dedupeKey,
    String location,
    String commuteLabel,
    Instant sourceEventAt,
    String url
) {
    FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
        lineId,
        lineNumber,
        eventType,
        reminderBucket,
        location,
        null,
        false,
        commuteLabel,
        legId,
        sourceEventAt
    ));
    return new PushNotificationCandidate(
        "user_1",
        commuteId,
        legId,
        lineId,
        lineNumber,
        category,
        eventType,
        reminderBucket,
        notificationKey,
        dedupeKey,
        notification,
        url
    );
}
```

Replace each direct `new PushNotificationCandidate(...)` in those two tests with this helper. Use:

- `lineNumber = "1"` for `line-1`;
- `location = "Finch to Union"` for the existing Line 1 delay fixtures;
- `commuteLabel = "Morning commute"` or `"Work"` for saved-commute candidates;
- `commuteLabel = null` for line-wide candidates;
- `Instant.parse("2026-06-05T14:20:00Z")` for the first saved-commute delay and its later clearance fixture;
- source times already present in another test fixture, otherwise `clock.instant()`.

- [ ] **Step 3: Continue directly to both planner refactors**

The candidate signature intentionally breaks both planners. Do not run Maven and do not commit this intermediate state. Complete Tasks 6 and 7, then compile both planners together. Do not add a legacy constructor that can create candidates without structured lifecycle context.

## Task 6: Use The Formatter In Line-Wide Planning

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java`

- [ ] **Step 1: Expand line planner assertions before implementation**

In `LineSubscriptionPushPlannerTest`, instantiate:

```java
private final PushNotificationFormatter formatter = new PushNotificationFormatter();
private final LineSubscriptionPushPlanner planner =
    new LineSubscriptionPushPlanner(dashboardService, clock, formatter);
```

Add exact assertions to the existing suspension candidate:

```java
assertThat(c.title()).isEqualTo("⚠️ Line 1 Yonge-University Suspension");
assertThat(c.body()).isEqualTo("""
    St George to Sheppard West.
    🕗 Jun 5, 6:00 AM""");
assertThat(c.notificationSubject()).isEqualTo("Line 1 Yonge-University Suspension");
assertThat(c.eventLocation()).isEqualTo("St George to Sheppard West");
assertThat(c.sourceEventAt()).isEqualTo(Instant.parse("2026-06-05T10:00:00Z"));
```

Add assertions to the Reduced Speed Zone candidate:

```java
assertThat(c.title()).isEqualTo("⚠️ Line 1 Yonge-University Reduced Speed Zone");
assertThat(c.body()).contains("Eglinton to Davisville.");
```

For each planned-closure candidate, assert:

```java
assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Planned Closure");
assertThat(candidate.sourceEventAt()).isEqualTo(eventStart.toInstant());
```

For the `closure-24h` candidate, assert:

```java
assertThat(candidate.body()).contains("Starts within 24 hours.");
```

- [ ] **Step 2: Confirm the new assertions describe the intended failure**

Do not run Maven in this intermediate state because the unchanged saved-commute planner still prevents main-source compilation. Confirm the line planner assertions now require the canonical title, multiline body, and structured event time before implementing the line planner changes below.

- [ ] **Step 3: Inject the formatter**

Change the planner constructor to:

```java
@Autowired
public LineSubscriptionPushPlanner(
    AlertDashboardService dashboardService,
    Clock clock,
    PushNotificationFormatter formatter
) {
    this.dashboardService = dashboardService;
    this.clock = clock;
    this.formatter = formatter;
}
```

Add:

```java
private final PushNotificationFormatter formatter;
```

- [ ] **Step 4: Pass complete facts for current alerts**

For suspension candidates, pass:

```java
candidates.add(createLineCandidate(
    accountId,
    alert.lineId(),
    alert.lineNumber(),
    "line-current",
    "suspension",
    "on-change",
    alert.id(),
    alert.location(),
    alert.displayDirection(),
    alert.shuttle(),
    alert.startedAt() == null ? null : alert.startedAt().toInstant(),
    "/?panel=alerts"
));
```

For delays, pass:

```java
candidates.add(createLineCandidate(
    accountId,
    delay.lineId(),
    delay.lineNumber(),
    "line-current",
    "delay",
    "on-change",
    delay.id(),
    delay.location(),
    delay.displayDirection(),
    false,
    delay.startedAt() == null ? null : delay.startedAt().toInstant(),
    "/?panel=delays"
));
```

For Reduced Speed Zones, pass:

```java
candidates.add(createLineCandidate(
    accountId,
    zone.lineId(),
    zone.lineNumber(),
    "line-current",
    "reduced-speed-zone",
    "on-change",
    zone.id(),
    zone.location(),
    zone.displayDirection(),
    false,
    zone.startedAt() == null ? null : zone.startedAt().toInstant(),
    "/?panel=reduced-speed-zones"
));
```

- [ ] **Step 5: Calculate planned start before creating any closure candidate**

Move the existing `eventStartAt` selection before the on-change candidate:

```java
OffsetDateTime eventStartAt = closure.nextWindowStart() != null
    ? closure.nextWindowStart()
    : closure.activeWindowStart() != null
        ? closure.activeWindowStart()
        : closure.startedAt();
Instant sourceEventAt = eventStartAt == null ? null : eventStartAt.toInstant();
```

Use `sourceEventAt` for on-change, 24-hour, and morning candidates. Do not use `updatedAt`.

Create the on-change closure candidate with:

```java
candidates.add(createLineCandidate(
    accountId,
    closure.lineId(),
    closure.lineNumber(),
    "line-planned",
    "planned-closure",
    "on-change",
    closure.id(),
    closure.location(),
    closure.displayDirection(),
    closure.shuttle(),
    sourceEventAt,
    "/?panel=closures"
));
```

Use the same arguments for reminder candidates, changing only `reminderBucket` to `closure-24h` or `closure-morning`.

- [ ] **Step 6: Replace `createLineCandidate` with the structured version**

Use:

```java
private PushNotificationCandidate createLineCandidate(
    String accountId,
    String lineId,
    String lineNumber,
    String category,
    String eventType,
    String reminderBucket,
    String sourceId,
    String location,
    String displayDirection,
    boolean shuttle,
    Instant sourceEventAt,
    String url
) {
    String notificationKey = String.join("|", category, lineId, eventType, sourceId);
    String dedupeKey = String.join("|", accountId, "line", lineId, eventType, reminderBucket, sourceId);
    FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
        lineId,
        lineNumber,
        eventType,
        reminderBucket,
        location,
        displayDirection,
        shuttle,
        null,
        null,
        sourceEventAt
    ));

    return new PushNotificationCandidate(
        accountId,
        null,
        null,
        lineId,
        lineNumber,
        category,
        eventType,
        reminderBucket,
        notificationKey,
        dedupeKey,
        notification,
        url
    );
}
```

Delete all planner-built title and body strings.

- [ ] **Step 7: Continue directly to saved-commute planning**

Do not run Maven yet because `SavedCommutePushPlanner` still uses the removed constructor. Complete Task 7 before compiling or committing the candidate/planner slice.

## Task 7: Use The Formatter In Saved-Commute Planning

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java`

- [ ] **Step 1: Update the test constructor**

In `SavedCommutePushPlannerTest`:

```java
private final PushNotificationFormatter formatter = new PushNotificationFormatter();
private final SavedCommutePushPlanner planner =
    new SavedCommutePushPlanner(commutePathService, commuteImpactService, clock, formatter);
```

- [ ] **Step 2: Replace old expected copy with the approved contract**

For the outbound current delay test:

```java
assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Delay");
assertThat(candidate.body()).isEqualTo("""
    Finch to Union.
    Southbound.
    Affects Morning commute (Outbound).
    🕗 Jun 5, 10:20 AM""");
assertThat(candidate.notificationSubject()).isEqualTo("Line 1 Yonge-University Delay");
assertThat(candidate.scopeLabel()).isEqualTo("Morning commute (Outbound)");
assertThat(candidate.sourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:20:00Z"));
```

For the planned return-trip test:

```java
assertThat(candidate.title()).isEqualTo("⚠️ Line 2 Bloor-Danforth Planned Closure");
assertThat(candidate.body()).contains("Affects Evening Route (Return).");
assertThat(candidate.body()).endsWith("🕗 Jun 7, 12:00 AM");
```

For Reduced Speed Zone:

```java
assertThat(candidate.title()).isEqualTo("⚠️ Line 1 Yonge-University Reduced Speed Zone");
```

For all planned reminder candidates:

```java
assertThat(candidate.sourceEventAt()).isEqualTo(eventStart.toInstant());
```

- [ ] **Step 3: Run the saved-commute planner test and verify failure**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.SavedCommutePushPlannerTest'
```

Expected: FAIL because the planner still builds commute-centric titles and uses the old candidate constructor.

- [ ] **Step 4: Inject the formatter**

Use these constructors:

```java
@Autowired
public SavedCommutePushPlanner(
    CommutePathService commutePathService,
    CommuteImpactService commuteImpactService,
    Clock clock,
    PushNotificationFormatter formatter
) {
    this.commutePathService = commutePathService;
    this.commuteImpactService = commuteImpactService;
    this.clock = clock;
    this.formatter = formatter;
}

public SavedCommutePushPlanner(
    CommutePathService commutePathService,
    CommuteImpactService commuteImpactService
) {
    this(
        commutePathService,
        commuteImpactService,
        Clock.systemUTC(),
        new PushNotificationFormatter()
    );
}
```

Add:

```java
private final PushNotificationFormatter formatter;
```

- [ ] **Step 5: Format the candidate from matched-impact facts**

Inside `candidateFor(...)`, select the timestamp:

```java
OffsetDateTime eventTime = planned ? match.eventStartAt() : match.startedAt();
Instant sourceEventAt = eventTime == null ? null : eventTime.toInstant();
```

Create the notification:

```java
FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
    match.lineId(),
    match.lineNumber(),
    eventType,
    reminderBucket,
    match.location(),
    match.displayDirection(),
    false,
    commute.getLabel(),
    legId,
    sourceEventAt
));
```

Return:

```java
return new PushNotificationCandidate(
    commute.getAccount().getId(),
    commute.getId(),
    legId,
    match.lineId(),
    match.lineNumber(),
    category,
    eventType,
    reminderBucket,
    notificationKey,
    dedupeKey,
    notification,
    "/?panel=commutes&commute=" + commute.getId()
);
```

Delete `titleCase`, `impactKindLabel`, `linePart`, and `locationPart`. Keep `safe`, `stableImpactPart`, and key-generation behavior unchanged.

Do not add shuttle data to `MatchedImpactResponse` in this slice. The current commute impact contract does not expose it, and expanding that API is unrelated to notification clarity.

- [ ] **Step 6: Run planner tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.SavedCommutePushPlannerTest,com.calebhabesh.linewatch.push.LineSubscriptionPushPlannerTest'
```

Expected: PASS. Both planner types now compile against the structured candidate and produce the same event-focused title for the same line/event type.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java
git commit -m "feat: format push alert candidates"
```

## Task 8: Persist Structured Context And Generate Precise Clearances

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [ ] **Step 1: Add entity fields**

Add to `PushNotificationEventEntity`:

```java
@Column(name = "notification_subject")
private String notificationSubject;
@Column(name = "event_location")
private String eventLocation;
@Column(name = "scope_label")
private String scopeLabel;
@Column(name = "source_event_at")
private Instant sourceEventAt;
```

In the active constructor:

```java
this.notificationSubject = candidate.notificationSubject();
this.eventLocation = candidate.eventLocation();
this.scopeLabel = candidate.scopeLabel();
this.sourceEventAt = candidate.sourceEventAt();
```

Add getters:

```java
public String getNotificationSubject() { return notificationSubject; }
public String getEventLocation() { return eventLocation; }
public String getScopeLabel() { return scopeLabel; }
public Instant getSourceEventAt() { return sourceEventAt; }
```

- [ ] **Step 2: Replace body-parsing clearance generation**

Change the static factory to:

```java
public static PushNotificationEventEntity cleared(
    String id,
    PushNotificationEventEntity activeEvent,
    Instant now,
    PushNotificationFormatter formatter
) {
    FormattedPushNotification notification = formatter.formatCleared(
        activeEvent.notificationSubject,
        activeEvent.eventLocation,
        activeEvent.scopeLabel,
        now
    );

    PushNotificationEventEntity event = new PushNotificationEventEntity();
    event.id = id;
    event.accountId = activeEvent.accountId;
    event.commuteId = activeEvent.commuteId;
    event.legId = activeEvent.legId;
    event.lineId = activeEvent.lineId;
    event.category = activeEvent.category;
    event.notificationKey = activeEvent.notificationKey;
    event.notificationState = "CLEARED";
    event.dedupeKey = activeEvent.dedupeKey + "|cleared";
    event.eventType = "service-restored";
    event.reminderBucket = "on-change";
    event.title = notification.title();
    event.body = notification.body();
    event.notificationSubject = notification.notificationSubject();
    event.eventLocation = notification.eventLocation();
    event.scopeLabel = notification.scopeLabel();
    event.sourceEventAt = notification.sourceEventAt();
    event.url = activeEvent.url;
    event.createdAt = now;
    return event;
}
```

Delete `clearedBody` and `clearedLineBody`.

- [ ] **Step 3: Inject the formatter into dispatch**

Add:

```java
private final PushNotificationFormatter formatter;
```

Add it to both `PushNotificationDispatchService` constructors immediately before `Clock`.

The Spring constructor delegates with:

```java
formatter,
Clock.systemUTC()
```

Change clearance creation to:

```java
PushNotificationEventEntity.cleared(
    nextId("push_event"),
    activeEvent,
    now,
    formatter
)
```

- [ ] **Step 4: Update dispatch test construction**

Add `formatter` to the test service constructor:

```java
private final PushNotificationFormatter formatter = new PushNotificationFormatter();

private final PushNotificationDispatchService service = new PushNotificationDispatchService(
    savedCommuteRepository,
    planner,
    eventRepository,
    subscriptionRepository,
    deliveryRepository,
    webPushClient,
    preferenceService,
    lineSubscriptionPushPlanner,
    formatter,
    clock
);
```

- [ ] **Step 5: Assert persisted active lifecycle context**

In `sendsNewSavedCommuteCandidateToEveryEnabledSubscriptionOnce`, capture the entity passed to `eventRepository.save` rather than returning a separately created event:

```java
when(eventRepository.save(any(PushNotificationEventEntity.class)))
    .thenAnswer(invocation -> invocation.getArgument(0));
```

Assert:

```java
ArgumentCaptor<PushNotificationEventEntity> eventCaptor =
    ArgumentCaptor.forClass(PushNotificationEventEntity.class);
verify(eventRepository).save(eventCaptor.capture());
PushNotificationEventEntity saved = eventCaptor.getValue();
assertThat(saved.getNotificationSubject()).isEqualTo("Line 1 Yonge-University Delay");
assertThat(saved.getEventLocation()).isEqualTo("Finch to Union");
assertThat(saved.getScopeLabel()).isEqualTo("Morning commute (Outbound)");
assertThat(saved.getSourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:20:00Z"));
```

- [ ] **Step 6: Replace clearance expectations**

For saved-commute clearance at fixed `2026-06-05T15:00:00Z`:

```java
assertThat(clearedEvent.getTitle())
    .isEqualTo("✅ Line 1 Yonge-University Delay Cleared");
assertThat(clearedEvent.getBody()).isEqualTo("""
    Service between Finch and Union has been restored.
    No longer affects Morning commute (Outbound).
    🕗 Jun 5, 11:00 AM""");
assertThat(clearedEvent.getNotificationKey())
    .isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1");
assertThat(clearedEvent.getSourceEventAt())
    .isEqualTo(Instant.parse("2026-06-05T15:00:00Z"));
```

For line-wide clearance:

```java
assertThat(clearedEvent.getTitle())
    .isEqualTo("✅ Line 1 Yonge-University Delay Cleared");
assertThat(clearedEvent.getBody()).isEqualTo("""
    Service between Finch and Union has been restored.
    🕗 Jun 5, 11:00 AM""");
```

- [ ] **Step 7: Preserve Android ordering semantics**

In `PushNotificationServiceTest.latestPendingNotificationUsesStableTagAndLifecycleState`, use a candidate with:

```java
sourceEventAt = Instant.parse("2026-06-05T14:20:00Z")
```

Keep event creation at:

```java
Instant.parse("2026-06-05T15:00:00Z")
```

Assert both:

```java
assertThat(response.notification().body()).endsWith("🕗 Jun 5, 10:20 AM");
assertThat(response.notification().timestamp()).isEqualTo("2026-06-05T15:00:00Z");
```

- [ ] **Step 8: Run all backend push tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.*Test'
```

Expected: PASS. No assertion should contain `Commute alert cleared`, `Line alert cleared`, `Morning Commute Affected`, or `Delay on Line`.

- [ ] **Step 9: Search for legacy user-visible push copy**

Run:

```bash
rg -n 'Commute alert cleared|Line alert cleared|Morning Commute Affected|Line [0-9] service alert|Delay on Line|Suspension on Line|Planned Closure on Line|Reduced Speed Zone on Line' backend/src/main/java/com/calebhabesh/linewatch/push backend/src/test/java/com/calebhabesh/linewatch/push
```

Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java
git commit -m "feat: send precise push clearance updates"
```

## Task 9: Improve Android Service-Worker Presentation And Stale Handling

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/tests/pwa.test.mjs`

- [ ] **Step 1: Update the PWA push fixture**

Change the default `serviceWorkerPush` notification fixture to:

```javascript
notification: {
  title: "⚠️ Line 1 Yonge-University Reduced Speed Zone",
  body: "Glencairn to Lawrence West.\nAffects Work (Outbound).\n🕗 Jun 5, 10:20 AM",
  url: "/?panel=commutes&commute=commute_1",
  tag: "saved-commute-impact|commute_1|dedupe-1",
  state: "ACTIVE",
  timestamp: "2026-06-05T15:00:00Z",
},
activeTags: ["saved-commute-impact|commute_1|dedupe-1"],
```

- [ ] **Step 2: Change the active notification assertions**

Assert:

```javascript
assert.equal(
  shownNotifications[0].title,
  "⚠️ Line 1 Yonge-University Reduced Speed Zone",
);
assert.equal(
  shownNotifications[0].options.body,
  "Glencairn to Lawrence West.\nAffects Work (Outbound).\n🕗 Jun 5, 10:20 AM",
);
assert.equal(
  shownNotifications[0].options.icon,
  "/assets/linewatch/pwa/app-icon-192.png",
);
assert.equal(
  shownNotifications[0].options.badge,
  "/assets/linewatch/pwa/notification-badge-96.png",
);
```

Remove the old assertion that `icon` is absent.

- [ ] **Step 3: Replace the stale fallback test**

Rename the test to:

```javascript
it("does not show a stale active notification or generic fallback", async () => {
```

Use an active notification whose tag is absent from `activeTags`, then assert:

```javascript
assert.equal(shownNotifications.length, 0);
```

- [ ] **Step 4: Add a no-pending-notification test**

Add:

```javascript
it("does not show a generic fallback when there is no pending notification", async () => {
  const { shownNotifications } = await serviceWorkerPush({
    fetchBody: {
      notification: null,
      activeTags: [],
    },
  });

  assert.equal(shownNotifications.length, 0);
});
```

- [ ] **Step 5: Keep fallback only for API failure**

Add:

```javascript
it("shows the controlled fallback only when the pending API request fails", async () => {
  const { shownNotifications } = await serviceWorkerPush({ fetchOk: false });

  assert.equal(shownNotifications.length, 1);
  assert.equal(shownNotifications[0].title, "⚠️ LineWatchTO Service Alert");
  assert.equal(
    shownNotifications[0].options.body,
    "Open LineWatchTO to view the latest service update.",
  );
});
```

- [ ] **Step 6: Update the clearance fixture**

Use:

```javascript
notification: {
  title: "✅ Line 1 Yonge-University Delay Cleared",
  body: "Service between Finch and Union has been restored.\nNo longer affects Work (Outbound).\n🕗 Jun 5, 11:00 AM",
  url: "/?panel=commutes&commute=commute_1",
  tag: "saved-commute-impact|commute_1|outbound|delay-line-1",
  state: "CLEARED",
  timestamp: "2026-06-05T15:00:00Z",
},
```

Keep assertions for:

```javascript
assert.equal(shownNotifications[0].options.silent, true);
assert.equal(shownNotifications[0].options.renotify, false);
assert.equal(shownNotifications[0].options.requireInteraction, false);
assert.equal(shownNotifications[0].options.timestamp, Date.parse("2026-06-05T15:00:00Z"));
assert.equal(shownNotifications[0].options.data.state, "CLEARED");
```

- [ ] **Step 7: Run the PWA tests and verify failure**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: FAIL because the service worker still omits the icon and displays fallbacks for empty/stale pending events.

- [ ] **Step 8: Implement service-worker behavior**

In `frontend/public/sw.js`, add:

```javascript
const NOTIFICATION_ICON_URL = "/assets/linewatch/pwa/app-icon-192.png";
```

Ensure `APP_SHELL_URLS` includes `NOTIFICATION_ICON_URL` instead of duplicating the literal icon path.

In `showPendingPushNotification()`:

```javascript
if (!notification) {
  return;
}
```

For a stale active tag:

```javascript
if (
  notificationState !== "CLEARED"
  && Array.isArray(activeTags)
  && !activeTags.includes(notification.tag)
) {
  return;
}
```

Add to notification options:

```javascript
icon: NOTIFICATION_ICON_URL,
```

Change `showFallbackPushNotification()` to:

```javascript
async function showFallbackPushNotification() {
  await self.registration.showNotification("⚠️ LineWatchTO Service Alert", {
    body: "Open LineWatchTO to view the latest service update.",
    tag: FALLBACK_PUSH_TAG,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    data: {
      url: "/",
    },
  });
}
```

Do not call the fallback for `notification === null` or a stale active tag. Keep fallback calls for request failure, non-OK latest response, malformed JSON, or thrown exceptions.

- [ ] **Step 9: Run PWA tests**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/public/sw.js frontend/tests/pwa.test.mjs
git commit -m "feat: improve Android push presentation"
```

## Task 10: Extend Web Push Delivery TTL

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/VapidWebPushClient.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/VapidWebPushClientSpringContextTest.java`

- [ ] **Step 1: Change the TTL expectation first**

In `VapidWebPushClientSpringContextTest`, change:

```java
assertThat(request.headers().firstValue("TTL")).contains("3600");
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.VapidWebPushClientSpringContextTest'
```

Expected: FAIL because the request still sends `TTL: 300`.

- [ ] **Step 3: Introduce a named TTL constant**

In `VapidWebPushClient.java`, add:

```java
private static final long PUSH_TTL_SECONDS = 60 * 60;
```

Replace:

```java
.header("TTL", "300")
```

with:

```java
.header("TTL", Long.toString(PUSH_TTL_SECONDS))
```

Do not change urgency or topic behavior.

- [ ] **Step 4: Run the focused test**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.VapidWebPushClientSpringContextTest'
```

Expected: PASS with `TTL: 3600`, the existing topic, and `Urgency: normal`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/VapidWebPushClient.java backend/src/test/java/com/calebhabesh/linewatch/push/VapidWebPushClientSpringContextTest.java
git commit -m "feat: extend mobile push delivery ttl"
```

## Task 11: Update Product And Agent Documentation

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Replace the README clearance description**

Replace the sentence that describes a generic `Commute alert cleared` notification with:

```markdown
Notification titles use the controlled format `⚠️ Line {N} {Line Name} {Event Type}`. When a current disruption clears, LineWatch sends a quiet same-tag `✅ Line {N} {Line Name} {Event Type} Cleared` replacement where delivery is allowed. Active bodies include the TTC-provided start time in `America/Toronto` when available; cleared bodies include the LineWatch clearance-detection time. The clock line uses `🕗 MMM d, h:mm AM/PM` without an additional Started/Cleared label.
```

Keep the adjacent explanation of active-tag cleanup and browser-controlled delivery.

- [ ] **Step 2: Add the implementation fact to both agent guides**

In both `AGENTS.md` and `GEMINI.md`, extend the Web Push current-reality bullet with:

```text
Supported rapid-transit push titles identify the line, official line name, and event type; active bodies show the source start time when available, and silent same-tag clearance replacements show the LineWatch clearance-detection time in America/Toronto.
```

Keep the configuration and freshness limitation in the same bullet.

- [ ] **Step 3: Preserve guardrails**

Confirm both files still state:

- push delivery requires browser permission, configured VAPID keys, enabled push, and fresh dashboard-visible impacts;
- global accessibility outages and surface notices do not send push notifications;
- email notifications are not implemented;
- the project is unofficial.

- [ ] **Step 4: Confirm paired guide equality**

Run:

```bash
cmp AGENTS.md GEMINI.md
```

Expected: no output and exit status 0.

- [ ] **Step 5: Search for obsolete README copy**

Run:

```bash
rg -n 'Commute alert cleared|Line alert cleared|LineWatchTO commute update' README.md AGENTS.md GEMINI.md
```

Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document precise push notification copy"
```

## Task 12: Run Full Automated Verification

**Files:**

- Verify all files changed by Tasks 2-11

- [ ] **Step 1: Run complete backend tests**

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

Expected: PASS, including `frontend/tests/pwa.test.mjs`.

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

- [ ] **Step 5: Run frontend production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Check formatting and worktree**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Only intended notification implementation and documentation changes remain.

- [ ] **Step 7: Review exact contract coverage**

Run:

```bash
rg -n '⚠️ Line 2 Bloor-Danforth Suspension|✅ Line 2 Bloor-Danforth Suspension Cleared|🕗 Jun 21, 7:19 PM|Starts within 24 hours|No longer affects' backend/src/test frontend/tests
```

Expected: matches in formatter, planner, dispatch, and service-worker tests.

## Task 13: Validate Flyway And The Mobile Notification Path

**Files:**

- Runtime validation only

- [ ] **Step 1: Start local data services**

Run:

```bash
docker compose up -d postgres redis
```

Expected: PostgreSQL/PostGIS and Redis containers become healthy.

- [ ] **Step 2: Start the backend once to apply V28**

Run:

```bash
mvn -f backend/pom.xml spring-boot:run
```

Expected startup log includes successful Flyway migration through version 28 and the backend starts on port 8080. Stop the process after:

```bash
curl http://localhost:8080/api/health
```

returns a healthy response.

- [ ] **Step 3: Confirm migrated columns**

Run:

```bash
docker compose exec postgres psql -U linewatch -d linewatch -c '\d push_notification_events'
```

If the local Compose database/user names differ, read them from `docker-compose.yml` and substitute those exact non-secret development values.

Expected columns:

```text
notification_subject
event_location
scope_label
source_event_at
```

Expected `body` type: `text`.

- [ ] **Step 4: Run a configured device test**

Use the existing HTTPS/VAPID helper:

```bash
scripts/dev-cloudflare-push.sh
```

On the installed Android PWA:

1. Sign in.
2. Enable push for the browser.
3. Subscribe to a supported line or enable a saved commute.
4. Use only fresh dashboard-visible data.
5. Trigger an active supported alert.
6. Verify the expanded notification shows:
   - the LineWatch application icon;
   - the monochrome status-bar badge;
   - `⚠️ Line {N} {Line Name} {Event Type}`;
   - location and optional commute context;
   - a final clock line when the source start exists.
7. Remove or clear the same alert.
8. Verify the notification is silently replaced by:
   - `✅ Line {N} {Line Name} {Event Type} Cleared`;
   - restoration copy;
   - the clearance-detection clock line.
9. Tap the notification and verify the existing matching panel deep link opens.

If using an alert scenario fixture, label the observation as synthetic scenario data. Do not describe it as live TTC service.

- [ ] **Step 5: Stop local services when validation is complete**

Run:

```bash
docker compose down
```

Expected: local PostgreSQL and Redis containers stop without deleting volumes.

## Task 14: Final Review And Handoff

**Files:**

- Review all changed files

- [ ] **Step 1: Review the commit sequence**

Run:

```bash
git log --oneline --decorate -12
```

Expected implementation commits:

```text
feat: persist push notification content context
refactor: share rapid transit push line metadata
feat: format precise mobile push content
feat: format push alert candidates
feat: send precise push clearance updates
feat: improve Android push presentation
feat: extend mobile push delivery ttl
docs: document precise push notification copy
```

- [ ] **Step 2: Review scope**

Confirm the diff does not:

- add push categories for accessibility or surface notices;
- change notification preferences;
- change stable notification tags or dedupe keys;
- change commute matching;
- claim guaranteed push delivery;
- add dependencies;
- expose secrets.

- [ ] **Step 3: Prepare the implementation handoff**

Report:

- exact files changed;
- exact automated commands run and whether they passed;
- whether V28 was applied against local PostgreSQL;
- whether an Android device test was completed;
- any environment limitation that prevented manual Web Push validation;
- the exact active and cleared notification examples now implemented.

Do not claim the task is complete unless the full automated verification has passed. If device validation cannot run because VAPID keys, HTTPS, browser permission, or fresh/scenario alert data are unavailable, report that separately without weakening the automated completion claim.
