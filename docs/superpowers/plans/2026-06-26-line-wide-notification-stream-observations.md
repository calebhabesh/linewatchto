# Line-Wide Notification Stream Observations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make line-wide Reduced Speed Zone notifications default on while treating line subscriptions as a stream of observed events, so clearances can be sent for events observed while subscribed even when the active push was not delivered or was intentionally suppressed as catch-up.

**Architecture:** Keep `push_notification_events` as the table for notifications that were actually sent or attempted. Add a small `push_line_event_observations` table that records line-current candidates seen while an account is subscribed and allowed for that event type. `PushNotificationDispatchService` will observe eligible line-current candidates before sending, suppress catch-up active RSZ pushes that predate the effective stream start, and emit line-wide clearances from observations instead of requiring a previous active push event.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway SQL migrations, JUnit 5, Mockito, AssertJ, Next.js/TypeScript fixture defaults, Node built-in test runner.

---

## Product Policy To Preserve

- Line-wide Reduced Speed Zones default on for new preferences.
- Saved-commute Reduced Speed Zones remain default on.
- Reduced Speed Zones remain `on-change` notifications, not daily reminders.
- Existing active RSZs at line subscription or RSZ preference enablement time are recorded silently and do not send an immediate catch-up active push.
- New RSZs after the effective stream start send an active notification once.
- Any line-current event observed while subscribed can send a cleared notification when it disappears from fresh dashboard data.
- Delivery failure for an active push must not prevent a later cleared notification.
- Surface notices and global accessibility outages remain outside push notifications.

## File Structure

Create:

- `backend/src/main/resources/db/migration/V31__push_line_event_observations.sql`
  Creates the observation table, indexes it for active account lookups, changes the default for `line_reduced_speed_zone_enabled`, and backfills observations from existing active line-current push events.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationEntity.java`
  JPA entity for one account observing one line-current notification key.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationRepository.java`
  Repository for active observations by account and notification key.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationService.java`
  Small service that creates or refreshes observations and decides whether an RSZ active push is a silent baseline.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationSchemaMigrationTest.java`
  String-level migration coverage, matching existing migration tests.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationServiceTest.java`
  Unit coverage for observe/refresh and silent baseline decisions.

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java`
  Change line-wide RSZ default from `false` to `true`.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
  Change compatibility default response from RSZ off to on.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
  Add a `clearedFromObservation(...)` factory for clear-only line stream notifications.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
  Observe eligible line-current candidates, suppress stale RSZ catch-up active sends, and clear line observations.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`
  Update default expectation.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`
  Add stream semantics tests and wire the new service mock.
- `frontend/src/app/account-data.ts`
  Change frontend fixture/default line-wide RSZ preference to true.
- `frontend/tests/account-data.test.mjs`
  Update expected defaults.
- `frontend/tests/smoke/api-stub.mjs`
  Change stubbed default if present.
- `README.md`
  Replace the old line-wide RSZ default-off wording with the stream-observation protocol.

Do not modify `LineSubscriptionPushPlanner` unless a test proves the candidate shape is wrong. Its existing `notificationKey` and `dedupeKey` are the right stable identifiers.

---

### Task 1: Change Line-Wide RSZ Defaults

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/tests/account-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`

- [ ] **Step 1: Write failing backend expectation**

In `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`, change the default assertion:

```java
assertThat(response.lineSubscriptions().eventTypes().reducedSpeedZones()).isTrue();
```

- [ ] **Step 2: Write failing frontend expectations**

In `frontend/tests/account-data.test.mjs`, replace the two expected `lineSubscriptions.eventTypes.reducedSpeedZones` values currently set to `false` with `true`.

In `frontend/tests/smoke/api-stub.mjs`, change the stubbed line subscription event type:

```js
reducedSpeedZones: true,
```

- [ ] **Step 3: Run the focused failing checks**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationPreferenceServiceTest test
npm --prefix frontend run test:fixtures
```

Expected before implementation: backend and frontend fail on the old `false` default.

- [ ] **Step 4: Implement defaults**

In `PushNotificationPreferenceEntity`, set:

```java
@Column(name = "line_reduced_speed_zone_enabled")
private boolean lineReducedSpeedZoneEnabled = true;
```

In `PushResponses.PushPreferencesResponse(boolean, boolean)`, change:

```java
new EventTypePreferencesResponse(true, true, true, true, true)
```

for the `lineSubscriptions` event type response.

In `frontend/src/app/account-data.ts`, change:

```ts
lineSubscriptions: {
  eventTypes: {
    reducedSpeedZones: true,
  },
},
```

keeping all other values as they are.

- [ ] **Step 5: Run the focused checks**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationPreferenceServiceTest test
npm --prefix frontend run test:fixtures
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java frontend/src/app/account-data.ts frontend/tests/account-data.test.mjs frontend/tests/smoke/api-stub.mjs
git commit -m "feat: enable line-wide reduced speed zone defaults"
```

---

### Task 2: Add Line Event Observation Schema

**Files:**
- Create: `backend/src/main/resources/db/migration/V31__push_line_event_observations.sql`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationSchemaMigrationTest.java`

- [ ] **Step 1: Write migration test**

Create `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationSchemaMigrationTest.java`:

```java
package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class PushLineEventObservationSchemaMigrationTest {

    @Test
    void v31AddsLineEventObservationsAndEnablesRszDefault() throws IOException {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V31__push_line_event_observations.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertThat(sql).contains("create table push_line_event_observations");
            assertThat(sql).contains("notification_key varchar(512) not null");
            assertThat(sql).contains("unique (account_id, notification_key)");
            assertThat(sql).contains("idx_push_line_event_observations_account_active");
            assertThat(sql).contains("alter column line_reduced_speed_zone_enabled set default true");
            assertThat(sql).contains("from push_notification_events");
            assertThat(sql).contains("category = 'line-current'");
            assertThat(sql).contains("notification_state = 'ACTIVE'");
        }
    }
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushLineEventObservationSchemaMigrationTest test
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create migration**

Create `backend/src/main/resources/db/migration/V31__push_line_event_observations.sql`:

```sql
create table push_line_event_observations (
    id varchar(120) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    line_id varchar(32) not null,
    event_type varchar(40) not null,
    notification_key varchar(512) not null,
    notification_subject varchar(120) not null,
    event_location text,
    scope_label varchar(180),
    source_event_at timestamp with time zone,
    url varchar(512) not null,
    observed_at timestamp with time zone not null,
    last_seen_at timestamp with time zone not null,
    cleared_at timestamp with time zone,
    unique (account_id, notification_key)
);

create index idx_push_line_event_observations_account_active
    on push_line_event_observations(account_id, last_seen_at desc)
    where cleared_at is null;

create index idx_push_line_event_observations_line_active
    on push_line_event_observations(account_id, line_id, event_type, last_seen_at desc)
    where cleared_at is null;

alter table push_notification_preferences
    alter column line_reduced_speed_zone_enabled set default true;

insert into push_line_event_observations (
    id,
    account_id,
    line_id,
    event_type,
    notification_key,
    notification_subject,
    event_location,
    scope_label,
    source_event_at,
    url,
    observed_at,
    last_seen_at,
    cleared_at
)
select
    'line_obs_' || md5(account_id || '|' || notification_key),
    account_id,
    line_id,
    event_type,
    notification_key,
    notification_subject,
    event_location,
    scope_label,
    source_event_at,
    url,
    created_at,
    created_at,
    null
from push_notification_events
where category = 'line-current'
  and notification_state = 'ACTIVE'
  and line_id is not null
  and notification_key is not null
on conflict (account_id, notification_key) do nothing;
```

This migration intentionally does not update existing `push_notification_preferences` rows from false to true. It changes the default for new rows while preserving any existing account preference. Existing beta accounts can opt in through the settings UI.

- [ ] **Step 4: Run the migration test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushLineEventObservationSchemaMigrationTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V31__push_line_event_observations.sql backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationSchemaMigrationTest.java
git commit -m "feat: add line event observation schema"
```

---

### Task 3: Add Observation Entity, Repository, And Service

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationServiceTest.java`

- [ ] **Step 1: Write service tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationServiceTest.java`:

```java
package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class PushLineEventObservationServiceTest {
    private final PushLineEventObservationRepository observationRepository = mock(PushLineEventObservationRepository.class);
    private final PushLineSubscriptionRepository lineSubscriptionRepository = mock(PushLineSubscriptionRepository.class);
    private final PushLineEventObservationService service = new PushLineEventObservationService(
        observationRepository,
        lineSubscriptionRepository
    );

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void createsSilentBaselineForReducedSpeedZoneThatStartedBeforeStream() {
        PushLineSubscriptionEntity lineSub = PushLineSubscriptionEntity.create(
            account,
            "line-1",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "line-1",
            "1",
            "reduced-speed-zone",
            "line-current|line-1|reduced-speed-zone|rsz-1",
            Instant.parse("2026-06-05T13:00:00Z")
        );

        when(observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
            "user_1",
            "line-current|line-1|reduced-speed-zone|rsz-1"
        )).thenReturn(Optional.empty());
        when(lineSubscriptionRepository.findById("user_1:line-1")).thenReturn(Optional.of(lineSub));
        when(observationRepository.save(any(PushLineEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushLineEventObservationService.ObservationDecision decision =
            service.observe(candidate, preferences, Instant.parse("2026-06-05T15:01:00Z"));

        assertThat(decision.firstObserved()).isTrue();
        assertThat(decision.silentBaseline()).isTrue();
        assertThat(decision.shouldSendActive()).isFalse();
    }

    @Test
    void sendsActiveForReducedSpeedZoneThatStartedAfterStream() {
        PushLineSubscriptionEntity lineSub = PushLineSubscriptionEntity.create(
            account,
            "line-1",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "line-1",
            "1",
            "reduced-speed-zone",
            "line-current|line-1|reduced-speed-zone|rsz-2",
            Instant.parse("2026-06-05T15:05:00Z")
        );

        when(observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
            "user_1",
            "line-current|line-1|reduced-speed-zone|rsz-2"
        )).thenReturn(Optional.empty());
        when(lineSubscriptionRepository.findById("user_1:line-1")).thenReturn(Optional.of(lineSub));
        when(observationRepository.save(any(PushLineEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushLineEventObservationService.ObservationDecision decision =
            service.observe(candidate, preferences, Instant.parse("2026-06-05T15:06:00Z"));

        assertThat(decision.firstObserved()).isTrue();
        assertThat(decision.silentBaseline()).isFalse();
        assertThat(decision.shouldSendActive()).isTrue();
    }

    @Test
    void refreshesExistingObservationWithoutSendingActiveAgain() {
        PushNotificationCandidate candidate = candidate(
            "line-1",
            "1",
            "reduced-speed-zone",
            "line-current|line-1|reduced-speed-zone|rsz-1",
            Instant.parse("2026-06-05T15:05:00Z")
        );
        PushLineEventObservationEntity existing = PushLineEventObservationEntity.create(
            "line_obs_existing",
            candidate,
            Instant.parse("2026-06-05T15:06:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );

        when(observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
            "user_1",
            "line-current|line-1|reduced-speed-zone|rsz-1"
        )).thenReturn(Optional.of(existing));
        when(observationRepository.save(existing)).thenReturn(existing);

        PushLineEventObservationService.ObservationDecision decision =
            service.observe(candidate, preferences, Instant.parse("2026-06-05T15:10:00Z"));

        assertThat(decision.firstObserved()).isFalse();
        assertThat(decision.shouldSendActive()).isFalse();
        assertThat(existing.getLastSeenAt()).isEqualTo(Instant.parse("2026-06-05T15:10:00Z"));
    }

    @Test
    void activeObservationsReturnsRepositoryRows() {
        when(observationRepository.findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc("user_1"))
            .thenReturn(List.of());

        assertThat(service.activeObservations("user_1")).isEmpty();
    }

    private PushNotificationCandidate candidate(
        String lineId,
        String lineNumber,
        String eventType,
        String notificationKey,
        Instant sourceEventAt
    ) {
        FormattedPushNotification notification = new PushNotificationFormatter().formatActive(
            new PushNotificationFacts(
                lineId,
                lineNumber,
                eventType,
                "on-change",
                "Eglinton to Davisville",
                null,
                false,
                null,
                null,
                sourceEventAt
            )
        );
        return new PushNotificationCandidate(
            "user_1",
            null,
            null,
            lineId,
            lineNumber,
            "line-current",
            eventType,
            "on-change",
            notificationKey,
            "user_1|line|" + lineId + "|" + eventType + "|on-change|source",
            notification,
            "/?panel=reduced-speed-zones"
        );
    }
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushLineEventObservationServiceTest test
```

Expected: FAIL because the entity, repository, and service do not exist.

- [ ] **Step 3: Create entity**

Create `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationEntity.java`:

```java
package com.calebhabesh.linewatch.push;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

@Entity
@Table(name = "push_line_event_observations")
public class PushLineEventObservationEntity {
    @Id
    private String id;

    @Column(name = "account_id")
    private String accountId;

    @Column(name = "line_id")
    private String lineId;

    @Column(name = "event_type")
    private String eventType;

    @Column(name = "notification_key")
    private String notificationKey;

    @Column(name = "notification_subject")
    private String notificationSubject;

    @Column(name = "event_location")
    private String eventLocation;

    @Column(name = "scope_label")
    private String scopeLabel;

    @Column(name = "source_event_at")
    private Instant sourceEventAt;

    private String url;

    @Column(name = "observed_at")
    private Instant observedAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    @Column(name = "cleared_at")
    private Instant clearedAt;

    protected PushLineEventObservationEntity() {}

    public static String idFor(String accountId, String notificationKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String encoded = HexFormat.of().formatHex(
                digest.digest((accountId + "|" + notificationKey).getBytes(StandardCharsets.UTF_8))
            );
            return "line_obs_" + encoded.substring(0, 48);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not build line event observation id", ex);
        }
    }

    public static PushLineEventObservationEntity create(String id, PushNotificationCandidate candidate, Instant now) {
        PushLineEventObservationEntity entity = new PushLineEventObservationEntity();
        entity.id = id;
        entity.accountId = candidate.accountId();
        entity.lineId = candidate.lineId();
        entity.eventType = candidate.eventType();
        entity.notificationKey = candidate.notificationKey();
        entity.notificationSubject = candidate.notificationSubject();
        entity.eventLocation = candidate.eventLocation();
        entity.scopeLabel = candidate.scopeLabel();
        entity.sourceEventAt = candidate.sourceEventAt();
        entity.url = candidate.url();
        entity.observedAt = now;
        entity.lastSeenAt = now;
        return entity;
    }

    public void refresh(PushNotificationCandidate candidate, Instant now) {
        this.notificationSubject = candidate.notificationSubject();
        this.eventLocation = candidate.eventLocation();
        this.scopeLabel = candidate.scopeLabel();
        this.sourceEventAt = candidate.sourceEventAt();
        this.url = candidate.url();
        this.lastSeenAt = now;
    }

    public void markCleared(Instant now) {
        this.clearedAt = now;
    }

    public String getId() { return id; }
    public String getAccountId() { return accountId; }
    public String getLineId() { return lineId; }
    public String getEventType() { return eventType; }
    public String getNotificationKey() { return notificationKey; }
    public String getNotificationSubject() { return notificationSubject; }
    public String getEventLocation() { return eventLocation; }
    public String getScopeLabel() { return scopeLabel; }
    public Instant getSourceEventAt() { return sourceEventAt; }
    public String getUrl() { return url; }
    public Instant getObservedAt() { return observedAt; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public Instant getClearedAt() { return clearedAt; }
}
```

- [ ] **Step 4: Create repository**

Create `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationRepository.java`:

```java
package com.calebhabesh.linewatch.push;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PushLineEventObservationRepository extends JpaRepository<PushLineEventObservationEntity, String> {
    Optional<PushLineEventObservationEntity> findByAccountIdAndNotificationKeyAndClearedAtIsNull(
        String accountId,
        String notificationKey
    );

    List<PushLineEventObservationEntity> findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc(String accountId);
}
```

- [ ] **Step 5: Create service**

Create `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationService.java`:

```java
package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushLineEventObservationService {
    private final PushLineEventObservationRepository observationRepository;
    private final PushLineSubscriptionRepository lineSubscriptionRepository;

    public PushLineEventObservationService(
        PushLineEventObservationRepository observationRepository,
        PushLineSubscriptionRepository lineSubscriptionRepository
    ) {
        this.observationRepository = observationRepository;
        this.lineSubscriptionRepository = lineSubscriptionRepository;
    }

    @Transactional
    public ObservationDecision observe(
        PushNotificationCandidate candidate,
        PushNotificationPreferenceEntity preferences,
        Instant now
    ) {
        return observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
                candidate.accountId(),
                candidate.notificationKey()
            )
            .map(existing -> {
                existing.refresh(candidate, now);
                PushLineEventObservationEntity saved = observationRepository.save(existing);
                return new ObservationDecision(saved, false, false);
            })
            .orElseGet(() -> {
                PushLineEventObservationEntity created = PushLineEventObservationEntity.create(
                    PushLineEventObservationEntity.idFor(candidate.accountId(), candidate.notificationKey()),
                    candidate,
                    now
                );
                PushLineEventObservationEntity saved = observationRepository.save(created);
                return new ObservationDecision(saved, true, silentBaseline(candidate, preferences));
            });
    }

    @Transactional(readOnly = true)
    public List<PushLineEventObservationEntity> activeObservations(String accountId) {
        return observationRepository.findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc(accountId);
    }

    @Transactional
    public void markCleared(PushLineEventObservationEntity observation, Instant now) {
        observation.markCleared(now);
        observationRepository.save(observation);
    }

    private boolean silentBaseline(PushNotificationCandidate candidate, PushNotificationPreferenceEntity preferences) {
        if (!"line-current".equals(candidate.category())) {
            return false;
        }
        if (!"reduced-speed-zone".equals(candidate.eventType())) {
            return false;
        }

        Instant streamStartedAt = streamStartedAt(candidate, preferences);
        Instant sourceEventAt = candidate.sourceEventAt();
        return sourceEventAt == null || !sourceEventAt.isAfter(streamStartedAt);
    }

    private Instant streamStartedAt(PushNotificationCandidate candidate, PushNotificationPreferenceEntity preferences) {
        Instant lineEnabledAt = lineSubscriptionRepository
            .findById(PushLineSubscriptionEntity.idFor(candidate.accountId(), candidate.lineId()))
            .map(PushLineSubscriptionEntity::getUpdatedAt)
            .orElseGet(preferences::getUpdatedAt);

        return Stream.of(lineEnabledAt, preferences.getUpdatedAt())
            .filter(value -> value != null)
            .max(Comparator.naturalOrder())
            .orElse(Instant.EPOCH);
    }

    public record ObservationDecision(
        PushLineEventObservationEntity observation,
        boolean firstObserved,
        boolean silentBaseline
    ) {
        public boolean shouldSendActive() {
            return firstObserved && !silentBaseline;
        }
    }
}
```

- [ ] **Step 6: Run the service tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushLineEventObservationServiceTest test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationEntity.java backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationRepository.java backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationServiceTest.java
git commit -m "feat: track line event observations"
```

---

### Task 4: Create Cleared Events From Observations

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`

- [ ] **Step 1: Add focused entity-level assertion inside dispatch test class**

In `PushNotificationDispatchServiceTest`, add this test near the other cleared-notification tests:

```java
@Test
void clearedLineObservationBuildsClearOnlyEventWithSameNotificationKey() {
    PushNotificationCandidate candidate = candidate(
        null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
        "line-current|line-1|reduced-speed-zone|rsz-1",
        "user_1|line|line-1|reduced-speed-zone|on-change|rsz-1",
        "Eglinton to Davisville",
        null,
        Instant.parse("2026-06-05T14:20:00Z"),
        "/?panel=reduced-speed-zones"
    );
    PushLineEventObservationEntity observation = PushLineEventObservationEntity.create(
        "line_obs_1",
        candidate,
        Instant.parse("2026-06-05T14:30:00Z")
    );

    PushNotificationEventEntity cleared = PushNotificationEventEntity.clearedFromObservation(
        "push_event_clear",
        observation,
        Instant.parse("2026-06-05T15:00:00Z"),
        formatter
    );

    assertThat(cleared.getNotificationKey()).isEqualTo("line-current|line-1|reduced-speed-zone|rsz-1");
    assertThat(cleared.getNotificationState()).isEqualTo("CLEARED");
    assertThat(cleared.getEventType()).isEqualTo("service-restored");
    assertThat(cleared.getReminderBucket()).isEqualTo("on-change");
    assertThat(cleared.getTitle()).isEqualTo("✅ Line 1 Yonge-University Reduced Speed Zone Cleared");
    assertThat(cleared.getBody()).isEqualTo("""
        Service between Eglinton and Davisville stations has resumed.
        🕗 Jun 5, 11:00 AM""");
}
```

- [ ] **Step 2: Run the focused failing test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest#clearedLineObservationBuildsClearOnlyEventWithSameNotificationKey test
```

Expected: FAIL because `clearedFromObservation` does not exist.

- [ ] **Step 3: Add factory to entity**

In `PushNotificationEventEntity`, add:

```java
public static PushNotificationEventEntity clearedFromObservation(
    String id,
    PushLineEventObservationEntity observation,
    Instant now,
    PushNotificationFormatter formatter
) {
    FormattedPushNotification notification = formatter.formatCleared(
        observation.getNotificationSubject(),
        observation.getEventLocation(),
        observation.getScopeLabel(),
        now
    );

    PushNotificationEventEntity event = new PushNotificationEventEntity();
    event.id = id;
    event.accountId = observation.getAccountId();
    event.commuteId = null;
    event.legId = null;
    event.lineId = observation.getLineId();
    event.category = "line-current";
    event.notificationKey = observation.getNotificationKey();
    event.notificationState = "CLEARED";
    event.dedupeKey = observation.getAccountId()
        + "|line|"
        + observation.getLineId()
        + "|"
        + observation.getEventType()
        + "|on-change|"
        + observation.getNotificationKey()
        + "|cleared";
    event.eventType = "service-restored";
    event.reminderBucket = "on-change";
    event.title = notification.title();
    event.body = notification.body();
    event.notificationSubject = notification.notificationSubject();
    event.eventLocation = notification.eventLocation();
    event.scopeLabel = notification.scopeLabel();
    event.sourceEventAt = notification.sourceEventAt();
    event.url = "/";
    event.createdAt = now;
    return event;
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest#clearedLineObservationBuildsClearOnlyEventWithSameNotificationKey test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java
git commit -m "feat: build cleared notifications from line observations"
```

---

### Task 5: Wire Observations Into Dispatch

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`

- [ ] **Step 1: Add service mock and constructor argument in tests**

In `PushNotificationDispatchServiceTest`, add a field:

```java
private final PushLineEventObservationService lineEventObservationService = mock(PushLineEventObservationService.class);
```

Pass it to the `PushNotificationDispatchService` constructor immediately after `lineSubscriptionPushPlanner`.

- [ ] **Step 2: Write failing tests for stream semantics**

Add these tests to `PushNotificationDispatchServiceTest`:

```java
@Test
void silentlyObservesPreExistingLineWideReducedSpeedZoneWithoutActivePush() {
    PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
    PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
        "push_subscription_1",
        account,
        "https://fcm.googleapis.com/fcm/send/subscription",
        "endpoint-hash",
        "p256dh-key",
        "auth-secret",
        "Chrome Android",
        clock.instant()
    );
    PushNotificationCandidate rszCandidate = candidate(
        null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
        "line-current|line-1|reduced-speed-zone|rsz-old",
        "user_1|line|line-1|reduced-speed-zone|on-change|rsz-old",
        "Eglinton to Davisville",
        null,
        Instant.parse("2026-06-05T13:00:00Z"),
        "/?panel=reduced-speed-zones"
    );
    PushLineEventObservationEntity observation = PushLineEventObservationEntity.create(
        "line_obs_old",
        rszCandidate,
        clock.instant()
    );

    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
    when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
    when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
    when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of(rszCandidate));
    when(preferenceService.allows(preferences, rszCandidate)).thenReturn(true);
    when(lineEventObservationService.observe(rszCandidate, preferences, clock.instant()))
        .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, true));
    when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));

    service.evaluateSavedCommuteNotifications();

    verify(lineEventObservationService).observe(rszCandidate, preferences, clock.instant());
    verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
    verify(webPushClient, never()).send(any(), any());
}

@Test
void sendsActiveForNewLineWideReducedSpeedZoneAfterObservationStart() {
    PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
    PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
        "push_subscription_1",
        account,
        "https://fcm.googleapis.com/fcm/send/subscription",
        "endpoint-hash",
        "p256dh-key",
        "auth-secret",
        "Chrome Android",
        clock.instant()
    );
    PushNotificationCandidate rszCandidate = candidate(
        null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
        "line-current|line-1|reduced-speed-zone|rsz-new",
        "user_1|line|line-1|reduced-speed-zone|on-change|rsz-new",
        "Eglinton to Davisville",
        null,
        Instant.parse("2026-06-05T15:05:00Z"),
        "/?panel=reduced-speed-zones"
    );
    PushLineEventObservationEntity observation = PushLineEventObservationEntity.create(
        "line_obs_new",
        rszCandidate,
        clock.instant()
    );

    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
    when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
    when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
    when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of(rszCandidate));
    when(preferenceService.allows(preferences, rszCandidate)).thenReturn(true);
    when(lineEventObservationService.observe(rszCandidate, preferences, clock.instant()))
        .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, false));
    when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));
    when(eventRepository.existsByDedupeKey("user_1|line|line-1|reduced-speed-zone|on-change|rsz-new"))
        .thenReturn(false);
    when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(webPushClient.send(eq(subscription), anyString())).thenReturn(PushDeliveryResult.accepted(202));

    service.evaluateSavedCommuteNotifications();

    verify(eventRepository).save(any(PushNotificationEventEntity.class));
    verify(webPushClient).send(eq(subscription), anyString());
}

@Test
void activeDeliveryFailureStillLeavesObservationAvailableForClearance() {
    PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
    PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
        "push_subscription_1",
        account,
        "https://fcm.googleapis.com/fcm/send/subscription",
        "endpoint-hash",
        "p256dh-key",
        "auth-secret",
        "Chrome Android",
        clock.instant()
    );
    PushNotificationCandidate rszCandidate = candidate(
        null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
        "line-current|line-1|reduced-speed-zone|rsz-new",
        "user_1|line|line-1|reduced-speed-zone|on-change|rsz-new",
        "Eglinton to Davisville",
        null,
        Instant.parse("2026-06-05T15:05:00Z"),
        "/?panel=reduced-speed-zones"
    );
    PushLineEventObservationEntity observation = PushLineEventObservationEntity.create(
        "line_obs_new",
        rszCandidate,
        clock.instant()
    );

    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
    when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
    when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
    when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of(rszCandidate));
    when(preferenceService.allows(preferences, rszCandidate)).thenReturn(true);
    when(lineEventObservationService.observe(rszCandidate, preferences, clock.instant()))
        .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, false));
    when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));
    when(eventRepository.existsByDedupeKey("user_1|line|line-1|reduced-speed-zone|on-change|rsz-new"))
        .thenReturn(false);
    when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(webPushClient.send(eq(subscription), anyString())).thenReturn(PushDeliveryResult.failed(null, "Connection refused"));

    service.evaluateSavedCommuteNotifications();

    verify(eventRepository).delete(any(PushNotificationEventEntity.class));
    verify(lineEventObservationService, never()).markCleared(any(), any());
}

@Test
void sendsLineWideClearedNotificationFromObservationEvenWithoutPriorActiveEvent() {
    PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
    PushNotificationPreferenceEntity spyPrefs = spy(preferences);
    when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
    PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
        "push_subscription_1",
        account,
        "https://fcm.googleapis.com/fcm/send/subscription",
        "endpoint-hash",
        "p256dh-key",
        "auth-secret",
        "Chrome Android",
        clock.instant()
    );
    PushNotificationCandidate previousCandidate = candidate(
        null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
        "line-current|line-1|reduced-speed-zone|rsz-old",
        "user_1|line|line-1|reduced-speed-zone|on-change|rsz-old",
        "Eglinton to Davisville",
        null,
        Instant.parse("2026-06-05T13:00:00Z"),
        "/?panel=reduced-speed-zones"
    );
    PushLineEventObservationEntity observation = PushLineEventObservationEntity.create(
        "line_obs_old",
        previousCandidate,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
    when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
    when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
    when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of());
    when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));
    when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    when(webPushClient.send(eq(subscription), anyString())).thenReturn(PushDeliveryResult.accepted(202));

    service.evaluateSavedCommuteNotifications();

    ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
    verify(eventRepository).save(eventCaptor.capture());
    PushNotificationEventEntity cleared = eventCaptor.getValue();
    assertThat(cleared.getNotificationKey()).isEqualTo("line-current|line-1|reduced-speed-zone|rsz-old");
    assertThat(cleared.getNotificationState()).isEqualTo("CLEARED");
    assertThat(cleared.getTitle()).isEqualTo("✅ Line 1 Yonge-University Reduced Speed Zone Cleared");
    verify(lineEventObservationService).markCleared(observation, clock.instant());
}

@Test
void doesNotSendLineObservationClearanceWhenEquivalentLineAlertStillExistsUnderNewKey() {
    PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
    PushNotificationPreferenceEntity spyPrefs = spy(preferences);
    when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
    PushNotificationCandidate previousCandidate = candidate(
        null, null, "line-2", "2", "line-current", "suspension", "on-change",
        "line-current|line-2|suspension|ttc-route-gtfsrt-70483",
        "user_1|line|line-2|suspension|on-change|ttc-route-gtfsrt-70483",
        "",
        null,
        Instant.parse("2026-06-05T14:20:00Z"),
        "/?panel=alerts"
    );
    PushLineEventObservationEntity previousObservation = PushLineEventObservationEntity.create(
        "line_obs_gtfs",
        previousCandidate,
        Instant.parse("2026-06-05T14:30:00Z")
    );
    PushNotificationCandidate currentLiveCandidate = candidate(
        null, null, "line-2", "2", "line-current", "suspension", "on-change",
        "line-current|line-2|suspension|ttc-route-70500",
        "user_1|line|line-2|suspension|on-change|ttc-route-70500",
        "Warden",
        null,
        Instant.parse("2026-06-05T14:22:00Z"),
        "/?panel=alerts&impactKind=suspension&impactId=ttc-route-70500"
    );
    PushLineEventObservationEntity currentObservation = PushLineEventObservationEntity.create(
        "line_obs_live",
        currentLiveCandidate,
        clock.instant()
    );

    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
    when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));
    when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-2")))
        .thenReturn(List.of(currentLiveCandidate));
    when(preferenceService.allows(spyPrefs, currentLiveCandidate)).thenReturn(true);
    when(lineEventObservationService.observe(currentLiveCandidate, spyPrefs, clock.instant()))
        .thenReturn(new PushLineEventObservationService.ObservationDecision(currentObservation, true, false));
    when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(previousObservation, currentObservation));
    when(eventRepository.existsByDedupeKey("user_1|line|line-2|suspension|on-change|ttc-route-70500"))
        .thenReturn(true);

    service.evaluateSavedCommuteNotifications();

    verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
    verify(lineEventObservationService).markCleared(previousObservation, clock.instant());
    verify(webPushClient, never()).send(any(), any());
}
```

- [ ] **Step 3: Run focused failing tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest test
```

Expected: FAIL because `PushNotificationDispatchService` does not accept or use `PushLineEventObservationService`.

- [ ] **Step 4: Update dispatch constructor and field**

In `PushNotificationDispatchService`, add:

```java
private final PushLineEventObservationService lineEventObservationService;
```

Add the constructor parameter immediately after `LineSubscriptionPushPlanner lineSubscriptionPushPlanner` in both constructors, assign it, and update the `@Autowired` constructor delegation.

- [ ] **Step 5: Split line-current clearing from saved-commute clearing**

In `evaluateSavedCommuteNotifications`, after building `allowedCandidates`, split line-current candidates before sending:

```java
List<PushNotificationCandidate> sendableCandidates = new java.util.ArrayList<>();
Set<String> currentLineNotificationKeys = new java.util.HashSet<>();
List<PushNotificationCandidate> currentLineCandidates = new java.util.ArrayList<>();

for (PushNotificationCandidate candidate : allowedCandidates) {
    if ("line-current".equals(candidate.category())) {
        currentLineNotificationKeys.add(candidate.notificationKey());
        currentLineCandidates.add(candidate);
        PushLineEventObservationService.ObservationDecision decision =
            lineEventObservationService.observe(candidate, preferences, clock.instant());
        if (decision.shouldSendActive()) {
            sendableCandidates.add(candidate);
        }
    } else {
        sendableCandidates.add(candidate);
    }
}
```

Then use `sendableCandidates` in the existing send loop:

```java
List<String> savedCurrentCategories = List.of("saved-commute-current", "saved-commute-impact");
Set<String> savedCurrentNotificationKeys = new java.util.HashSet<>();

for (PushNotificationCandidate candidate : sendableCandidates) {
    if (savedCurrentCategories.contains(candidate.category())) {
        savedCurrentNotificationKeys.add(candidate.notificationKey());
    }
    sendIfNew(candidate);
}

sendClearedNotifications(accountId, preferences, savedCurrentNotificationKeys, sendableCandidates);
sendClearedLineObservationNotifications(accountId, preferences, currentLineNotificationKeys, currentLineCandidates);
```

Do not include `"line-current"` in `savedCurrentCategories`. Line-current clearances now come from observations.

- [ ] **Step 6: Add line observation clearance method**

Add this method to `PushNotificationDispatchService`:

```java
private void sendClearedLineObservationNotifications(
    String accountId,
    PushNotificationPreferenceEntity preferences,
    Set<String> currentLineNotificationKeys,
    List<PushNotificationCandidate> currentLineCandidates
) {
    if (!ingestionFreshness.isDashboardFresh()) {
        return;
    }
    Instant now = clock.instant();

    for (PushLineEventObservationEntity observation : lineEventObservationService.activeObservations(accountId)) {
        if (currentLineNotificationKeys.contains(observation.getNotificationKey())) {
            continue;
        }
        if (hasEquivalentLineCandidate(observation, currentLineCandidates)) {
            lineEventObservationService.markCleared(observation, now);
            continue;
        }

        if (!preferences.isLineRestoredEnabled()) {
            lineEventObservationService.markCleared(observation, now);
            continue;
        }

        PushNotificationEventEntity clearedEvent = eventRepository.save(PushNotificationEventEntity.clearedFromObservation(
            nextId("push_event"),
            observation,
            now,
            formatter
        ));
        if (sendEventToSubscriptions(clearedEvent, now)) {
            lineEventObservationService.markCleared(observation, now);
        } else {
            eventRepository.delete(clearedEvent);
        }
    }
}
```

- [ ] **Step 7: Add equivalent-candidate guard for line observations**

Add these helpers to `PushNotificationDispatchService`. They mirror the existing active-event equivalence logic but read from `PushLineEventObservationEntity`:

```java
private boolean hasEquivalentLineCandidate(
    PushLineEventObservationEntity observation,
    List<PushNotificationCandidate> currentLineCandidates
) {
    return currentLineCandidates.stream()
        .filter(candidate -> !candidate.notificationKey().equals(observation.getNotificationKey()))
        .anyMatch(candidate -> equivalentLineObservationEvent(observation, candidate));
}

private boolean equivalentLineObservationEvent(
    PushLineEventObservationEntity observation,
    PushNotificationCandidate candidate
) {
    if (!"line-current".equals(candidate.category())) {
        return false;
    }
    if (!same(observation.getLineId(), candidate.lineId())) {
        return false;
    }
    if (!same(observation.getEventType(), candidate.eventType())) {
        return false;
    }
    if (!compatibleLocations(observation.getEventLocation(), candidate.eventLocation())) {
        return false;
    }
    return compatibleSourceTimes(observation.getSourceEventAt(), candidate.sourceEventAt());
}
```

When this guard matches, the old observation is marked cleared silently. The current key's observation remains active, so a later true clearance produces one notification instead of a false clearance for the stale source key.

- [ ] **Step 8: Keep equivalent-candidate fallback only for saved commutes**

The existing `sendClearedNotifications(...)` should keep the equivalent-current-candidate guard for saved commutes. Its `currentCategories` list should be:

```java
List<String> currentCategories = List.of("saved-commute-current", "saved-commute-impact");
```

This avoids duplicate line clearances because line-current events are handled through observations.

- [ ] **Step 9: Update existing line-current clearance tests**

The existing tests named like `enablingLineServiceRestoredSendsALineWideClearedNotificationWhenPreviousLineCurrentEventNoLongerMatches`, `doesNotSendLineWideClearedNotificationWhenDashboardIngestionIsStale`, and `doesNotSendClearedWhenEquivalentLineAlertStillExistsUnderANewKey` were written for event-table-backed line clearances. Update them to use `PushLineEventObservationEntity` rows or remove them if the new observation tests above cover the same behavior. Keep saved-commute clearance tests unchanged.

- [ ] **Step 10: Run dispatch tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java
git commit -m "feat: send line stream clearances from observations"
```

---

### Task 6: Update Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace old default-off statement**

Replace the current README line that says:

```text
Reduced Speed Zone line-wide alerts default off to avoid noisy long-running notifications.
```

with:

```text
Reduced Speed Zone line-wide alerts default on for new notification preferences. Existing active Reduced Speed Zones are recorded silently when a line stream becomes eligible, new Reduced Speed Zones send one active notification, and observed Reduced Speed Zones can send a clearance when fresh dashboard data shows they are gone.
```

- [ ] **Step 2: Expand the push lifecycle paragraph**

In the Web Push section, add this sentence after the paragraph that describes cleared notifications:

```text
Line-wide current alerts use a stream-observation layer: LineWatch records eligible subscribed-line events separately from delivered push events, so a clearance can be sent for an event observed while subscribed even if the active push was suppressed as catch-up or failed delivery.
```

- [ ] **Step 3: Check for stale wording**

Run:

```bash
rg -n "Reduced Speed Zone line-wide alerts default off|line-wide alerts default off|reducedSpeedZones: false" README.md frontend/src/app frontend/tests backend/src/test backend/src/main
```

Expected: no stale README or source product claim remains. Test fixtures may still contain `false` only if they are explicitly modeling a user-disabled preference. If a fixture represents the default, change it to `true`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: describe line notification stream observations"
```

---

### Task 7: Run Verification

**Files:**
- No source edits unless verification exposes a defect from the previous tasks.

- [ ] **Step 1: Backend focused push tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest='PushNotificationPreferenceServiceTest,PushLineEventObservationSchemaMigrationTest,PushLineEventObservationServiceTest,PushNotificationDispatchServiceTest,LineSubscriptionPushPlannerTest,PushNotificationServiceTest' test
```

Expected: PASS.

- [ ] **Step 2: Full backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 3: Frontend fixture/type checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Final grep**

Run:

```bash
rg -n "default off|Reduced Speed Zone line-wide alerts default off|lineReducedSpeedZoneEnabled = false|reducedSpeedZones: false" README.md backend/src/main backend/src/test frontend/src/app frontend/tests
```

Expected: no default-off product claim or default value remains. Any remaining `reducedSpeedZones: false` must be a test case for a user-disabled preference.

- [ ] **Step 5: Commit verification-only fixes**

If verification required fixes, commit them:

```bash
git add backend frontend README.md
git commit -m "test: verify line notification stream observations"
```

Skip this commit if there were no changes after Task 6.

---

## Implementation Notes For Gemini

- Keep the new observation service small. It should not know about dashboard DTOs, Web Push delivery, saved commutes, or service-worker cleanup.
- Do not create a generic event bus. The observation table is only for account-scoped line-current notification lifecycle.
- Do not change saved-commute notification behavior in this slice.
- Do not add daily RSZ reminders. RSZ stays in the `on-change` reminder bucket.
- Do not send push notifications for global accessibility outages or surface notices.
- Do not remove `sendIfNew`; it remains the delivery dedupe gate for active and planned notifications.
- Do not mark line observations cleared when ingestion is stale.
- Preserve user preferences. The migration changes the database default for new rows but does not force existing preference rows from false to true.

## Self-Review

- Spec coverage: The plan covers RSZ default-on behavior, silent catch-up observation, active notification dedupe, clearance independent of prior active delivery, stale-ingestion protection, docs, and verification.
- Placeholder scan: The plan contains concrete file paths, code snippets, commands, and expected outcomes.
- Type consistency: The plan uses existing `PushNotificationCandidate`, `PushNotificationPreferenceEntity`, `PushLineSubscriptionEntity`, `PushNotificationEventEntity`, and `PushNotificationFormatter` types. The new observation entity and service are introduced before dispatch uses them.
