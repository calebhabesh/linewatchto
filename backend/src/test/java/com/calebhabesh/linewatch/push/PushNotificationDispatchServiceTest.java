package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class PushNotificationDispatchServiceTest {
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final SavedCommutePushPlanner planner = mock(SavedCommutePushPlanner.class);
    private final PushNotificationEventRepository eventRepository = mock(PushNotificationEventRepository.class);
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);
    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final WebPushClient webPushClient = mock(WebPushClient.class);
    private final PushNotificationPreferenceService preferenceService = mock(PushNotificationPreferenceService.class);
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner = mock(LineSubscriptionPushPlanner.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
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

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void sendsNewSavedCommuteCandidateToEveryEnabledSubscriptionOnce() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-impact",
            "delay",
            "on-change",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
            "dedupe-1",
            "Finch to Union",
            "Morning commute",
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(webPushClient.send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3")).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor =
            ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity saved = eventCaptor.getValue();
        assertThat(saved.getNotificationSubject()).isEqualTo("Line 1 Yonge-University Delay");
        assertThat(saved.getEventLocation()).isEqualTo("Finch to Union");
        assertThat(saved.getScopeLabel()).isEqualTo("Morning commute (Outbound)");
        assertThat(saved.getSourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:20:00Z"));
        verify(webPushClient).send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3");
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
    }

    @Test
    void removesNewEventWhenEveryPushSendFailsSoLaterEvaluationsCanRetry() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-impact",
            "delay",
            "on-change",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
            "dedupe-1",
            "Finch to Union",
            "Morning commute",
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(webPushClient.send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3")).thenReturn(PushDeliveryResult.failed(null, "Connection refused"));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
        verify(webPushClient).send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3");
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
        verify(eventRepository).delete(any(PushNotificationEventEntity.class));
    }

    @Test
    void doesNotSendCandidateAgainWhenDedupeKeyAlreadyExists() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-impact",
            "delay",
            "on-change",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
            "dedupe-1",
            "Finch to Union",
            "Morning commute",
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(true);

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), any());
        verify(deliveryRepository, never()).save(any(PushNotificationDeliveryEntity.class));
    }

    @Test
    void sendsClearedNotificationWhenCurrentImpactNoLongerMatchesSavedCommute() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate previousCandidate = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-impact",
            "delay",
            "on-change",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
            "dedupe-1",
            "Finch to Union",
            "Morning commute",
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "push_event_1",
            previousCandidate,
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            eq("user_1"),
            anyList(),
            eq("ACTIVE")
        )).thenReturn(List.of(previousEvent));
        when(eventRepository.existsByNotificationKeyAndNotificationState(
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
            "CLEARED"
        )).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(webPushClient.send(eq(subscription), eq("AVEPD-AuDIedMxfArNYRpmed5ppkzhC3"))).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity clearedEvent = eventCaptor.getValue();
        assertThat(clearedEvent.getNotificationKey()).isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1");
        assertThat(clearedEvent.getNotificationState()).isEqualTo("CLEARED");
        assertThat(clearedEvent.getTitle())
            .isEqualTo("✅ Line 1 Yonge-University Delay Cleared");
        assertThat(clearedEvent.getBody()).isEqualTo("""
            Service between Finch and Union has been restored.
            No longer affects Morning commute (Outbound).
            🕗 Jun 5, 11:00 AM""");
        assertThat(clearedEvent.getUrl()).isEqualTo("/");
        assertThat(clearedEvent.getSourceEventAt())
            .isEqualTo(Instant.parse("2026-06-05T15:00:00Z"));
        verify(webPushClient).send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3");
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
    }

    @Test
    void lineWideDelaySendsOnlyWhenLineIsSubscribed() {
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
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));

        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
        
        PushNotificationCandidate line1Candidate = candidate(
            null, null, "line-1", "1", "line-current", "delay", "on-change",
            "line-current|line-1|delay|alert-1", "user_1|line|line-1|delay|on-change|alert-1",
            "Finch to Union", null, clock.instant(), "/?panel=delays"
        );
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of(line1Candidate));
        when(preferenceService.allows(preferences, line1Candidate)).thenReturn(true);

        when(eventRepository.existsByDedupeKey(anyString())).thenReturn(false);
        when(eventRepository.save(any())).thenAnswer(inv -> PushNotificationEventEntity.create("event-1", line1Candidate, clock.instant()));
        when(webPushClient.send(eq(subscription), anyString())).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
    }

    @Test
    void lineWideReducedSpeedZoneDoesNotSendByDefault() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));

        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
        
        PushNotificationCandidate rszCandidate = candidate(
            null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
            "line-current|line-1|reduced-speed-zone|zone-1", "user_1|line|line-1|reduced-speed-zone|on-change|zone-1",
            "Finch to Union", null, clock.instant(), "/?panel=reduced-speed-zones"
        );
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of(rszCandidate));
        
        when(preferenceService.allows(preferences, rszCandidate)).thenReturn(false);

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
    }

    @Test
    void enablingLineWideReducedSpeedZonesAllowsThatCandidate() {
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
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));

        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
        
        PushNotificationCandidate rszCandidate = candidate(
            null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
            "line-current|line-1|reduced-speed-zone|zone-1", "user_1|line|line-1|reduced-speed-zone|on-change|zone-1",
            "Finch to Union", null, clock.instant(), "/?panel=reduced-speed-zones"
        );
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of(rszCandidate));
        
        when(preferenceService.allows(preferences, rszCandidate)).thenReturn(true);
        when(eventRepository.save(any())).thenAnswer(inv -> PushNotificationEventEntity.create("event-1", rszCandidate, clock.instant()));
        when(webPushClient.send(eq(subscription), anyString())).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
    }

    @Test
    void disablingSavedCommuteCurrentDisruptionsSuppressesSavedCommuteCurrentCandidates() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));

        SavedCommuteEntity commute = SavedCommuteEntity.create("commute_1", account, "Work", "glencairn", "lawrence-west", false, clock.instant());
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));

        PushNotificationCandidate commuteImpact = candidate(
            "commute_1", "outbound", "line-1", "1", "saved-commute-current", "delay", "on-change",
            "saved-commute-current|commute_1|outbound|delay|delay-line-1", "dedupe-1", "Finch to Union", "Work", clock.instant(), "/?panel=commutes"
        );
        when(planner.candidatesFor(commute)).thenReturn(List.of(commuteImpact));
        
        when(preferenceService.allows(preferences, commuteImpact)).thenReturn(false);

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
    }

    @Test
    void disablingSavedCommuteServiceRestoredSuppressesSavedCommuteClearedNotifications() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isSavedCommuteRestoredEnabled()).thenReturn(false);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
        
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));

        PushNotificationCandidate previousCandidate = candidate(
            "commute_1", "outbound", "line-1", "1", "saved-commute-current", "delay", "on-change",
            "saved-commute-current|commute_1|outbound|delay|delay-line-1", "dedupe-1", "Finch to Union", "Work", clock.instant(), "/?panel=commutes"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create("event-1", previousCandidate, clock.instant());

        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(eq("user_1"), anyList(), eq("ACTIVE")))
            .thenReturn(List.of(previousEvent));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
    }

    @Test
    void enablingLineServiceRestoredSendsALineWideClearedNotificationWhenPreviousLineCurrentEventNoLongerMatches() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));

        PushNotificationCandidate previousCandidate = candidate(
            null, null, "line-1", "1", "line-current", "delay", "on-change",
            "line-current|line-1|delay|alert-1", "user_1|line|line-1|delay|on-change|alert-1",
            "Finch to Union", null, Instant.parse("2026-06-05T14:20:00Z"), "/?panel=delays"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create("event-1", previousCandidate, clock.instant());

        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(eq("user_1"), anyList(), eq("ACTIVE")))
            .thenReturn(List.of(previousEvent));
        when(eventRepository.existsByNotificationKeyAndNotificationState("line-current|line-1|delay|alert-1", "CLEARED")).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity clearedEvent = eventCaptor.getValue();
        assertThat(clearedEvent.getNotificationKey()).isEqualTo("line-current|line-1|delay|alert-1");
        assertThat(clearedEvent.getNotificationState()).isEqualTo("CLEARED");
        assertThat(clearedEvent.getTitle())
            .isEqualTo("✅ Line 1 Yonge-University Delay Cleared");
        assertThat(clearedEvent.getBody()).isEqualTo("""
            Service between Finch and Union has been restored.
            🕗 Jun 5, 11:00 AM""");
        assertThat(clearedEvent.getUrl()).isEqualTo("/");
    }

    @Test
    void doesNotSendClearedWhenEquivalentLineAlertStillExistsUnderANewKey() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));

        PushNotificationCandidate previousGtfsRtCandidate = candidate(
            null, null, "line-2", "2", "line-current", "suspension", "on-change",
            "line-current|line-2|suspension|ttc-route-gtfsrt-70483",
            "user_1|line|line-2|suspension|on-change|ttc-route-gtfsrt-70483",
            "",
            null,
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=alerts"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "event-gtfs",
            previousGtfsRtCandidate,
            clock.instant()
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

        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-2")))
            .thenReturn(List.of(currentLiveCandidate));
        when(preferenceService.allows(spyPrefs, currentLiveCandidate)).thenReturn(true);
        when(eventRepository.existsByDedupeKey("user_1|line|line-2|suspension|on-change|ttc-route-70500"))
            .thenReturn(true);
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(eq("user_1"), anyList(), eq("ACTIVE")))
            .thenReturn(List.of(previousEvent));
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of());

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), any());
    }

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
}
