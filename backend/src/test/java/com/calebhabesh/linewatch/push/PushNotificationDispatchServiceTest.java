package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
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
    private final PushLineEventObservationService lineEventObservationService = mock(PushLineEventObservationService.class);
    private final IngestionFreshness ingestionFreshness = mock(IngestionFreshness.class);
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
        lineEventObservationService,
        formatter,
        ingestionFreshness,
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

    @BeforeEach
    void setUp() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
    }

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
        when(webPushClient.send(
            eq(subscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor =
            ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity saved = eventCaptor.getValue();
        assertThat(saved.getNotificationSubject()).isEqualTo("Line 1 Yonge-University Delay");
        assertThat(saved.getEventLocation()).isEqualTo("Finch to Union");
        assertThat(saved.getScopeLabel()).isEqualTo("Morning commute (Outbound)");
        assertThat(saved.getSourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:20:00Z"));
        verify(webPushClient).send(
            eq(subscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        );
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
    }

    @Test
    void sendsDisplayablePayloadWithNewSavedCommutePush() {
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
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<WebPushPayload> payloadCaptor = ArgumentCaptor.forClass(WebPushPayload.class);
        verify(webPushClient).send(eq(subscription), anyString(), payloadCaptor.capture());
        WebPushPayload payload = payloadCaptor.getValue();
        assertThat(payload.title()).isEqualTo("⚠️ Line 1 Yonge-University Delay");
        assertThat(payload.body()).contains("between Finch and Union stations");
        assertThat(payload.url()).isEqualTo("/?panel=commutes&commute=commute_1");
        assertThat(payload.tag()).isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
        assertThat(payload.state()).isEqualTo("ACTIVE");
        assertThat(payload.timestamp()).isEqualTo("2026-06-05T15:00:00Z");
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
        when(webPushClient.send(
            eq(subscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.failed(null, "Connection refused"));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
        verify(webPushClient).send(
            eq(subscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        );
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
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
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
        when(webPushClient.send(
            eq(subscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.cleared("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity clearedEvent = eventCaptor.getValue();
        assertThat(clearedEvent.getNotificationKey()).isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1");
        assertThat(clearedEvent.getNotificationState()).isEqualTo("CLEARED");
        assertThat(clearedEvent.getTitle())
            .isEqualTo("✅ Line 1 Yonge-University Delay Cleared");
        assertThat(clearedEvent.getBody()).isEqualTo("""
            Service between Finch and Union stations has resumed.
            No longer affects Morning commute (Outbound).
            🕗 Jun 5, 11:00 AM""");
        assertThat(clearedEvent.getUrl()).isEqualTo("/");
        assertThat(clearedEvent.getSourceEventAt())
            .isEqualTo(Instant.parse("2026-06-05T15:00:00Z"));
        verify(webPushClient).send(
            eq(subscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.cleared("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        );
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
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("obs-1", line1Candidate, clock.instant());
        when(lineEventObservationService.observe(eq(line1Candidate), eq(preferences), any(Instant.class)))
            .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, false));

        when(eventRepository.existsByDedupeKey(anyString())).thenReturn(false);
        when(eventRepository.save(any())).thenAnswer(inv -> PushNotificationEventEntity.create("event-1", line1Candidate, clock.instant()));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

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
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("obs-rsz", rszCandidate, clock.instant());
        when(lineEventObservationService.observe(eq(rszCandidate), eq(preferences), any(Instant.class)))
            .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, false));

        when(eventRepository.save(any())).thenAnswer(inv -> PushNotificationEventEntity.create("event-1", rszCandidate, clock.instant()));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

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
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));

        PushNotificationCandidate previousCandidate = candidate(
            null, null, "line-1", "1", "line-current", "delay", "on-change",
            "line-current|line-1|delay|alert-1", "user_1|line|line-1|delay|on-change|alert-1",
            "Finch to Union", null, Instant.parse("2026-06-05T14:20:00Z"), "/?panel=delays"
        );
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("line_obs_1", previousCandidate, clock.instant());

        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity clearedEvent = eventCaptor.getValue();
        assertThat(clearedEvent.getNotificationKey()).isEqualTo("line-current|line-1|delay|alert-1");
        assertThat(clearedEvent.getNotificationState()).isEqualTo("CLEARED");
        assertThat(clearedEvent.getTitle())
            .isEqualTo("✅ Line 1 Yonge-University Delay Cleared");
        assertThat(clearedEvent.getBody()).isEqualTo("""
            Service between Finch and Union stations has resumed.
            🕗 Jun 5, 11:00 AM""");
        assertThat(clearedEvent.getUrl()).isEqualTo("/");
        verify(lineEventObservationService).markCleared(observation, clock.instant());
    }

    @Test
    void lineWideClearedNotificationIncludesPersistedDirection() {
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
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));

        PushNotificationCandidate previousCandidate = candidate(
            null, null, "line-1", "1", "line-current", "delay", "on-change",
            "line-current|line-1|delay|alert-1", "user_1|line|line-1|delay|on-change|alert-1",
            "Bloor-Yonge station", "Northbound", null, Instant.parse("2026-06-05T14:42:00Z"), "/?panel=delays"
        );
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("line_obs_1", previousCandidate, clock.instant());

        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity clearedEvent = eventCaptor.getValue();
        assertThat(clearedEvent.getBody()).isEqualTo("""
            Service has resumed northbound at Bloor-Yonge station.
            🕗 Jun 5, 11:00 AM""");
        verify(lineEventObservationService).markCleared(observation, clock.instant());
    }

    @Test
    void doesNotSendLineWideClearedNotificationWhenDashboardIngestionIsStale() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);

        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));

        PushNotificationCandidate previousCandidate = candidate(
            null, null, "line-5", "5", "line-current", "delay", "on-change",
            "line-current|line-5|delay|ttc-route-71001",
            "user_1|line|line-5|delay|on-change|ttc-route-71001",
            "Pharmacy to Aga Khan Park And Museum",
            null,
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=delays"
        );
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("line_obs_1", previousCandidate, clock.instant());

        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
        verify(lineEventObservationService, never()).markCleared(any(), any());
    }

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
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
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
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
        verify(webPushClient).send(eq(subscription), anyString(), any(WebPushPayload.class));
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
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.failed(null, "Connection refused"));

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
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

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
    void doesNotSendLineWideClearedNotificationAfterLineUnsubscribe() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
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
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of())).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
        verify(lineEventObservationService).markCleared(observation, clock.instant());
    }

    @Test
    void doesNotSendLineWideClearedNotificationAfterEventTypeDisabled() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        when(spyPrefs.isLineReducedSpeedZoneEnabled()).thenReturn(false);
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
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1"))).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(observation));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
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
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
    }

    @Test
    void topicsDifferForActiveAndClearedDisplayTagsOfTheSameLifecycleKey() {
        String lifecycleKey = "line-current|line-1|delay|delay-1";

        String activeTopic = PushNotificationDispatchService.topicFor(
            PushNotificationDisplayTags.active(lifecycleKey)
        );
        String clearedTopic = PushNotificationDispatchService.topicFor(
            PushNotificationDisplayTags.cleared(lifecycleKey)
        );

        assertThat(activeTopic).isNotEqualTo(clearedTopic);
        assertThat(activeTopic).hasSizeLessThanOrEqualTo(32);
        assertThat(clearedTopic).hasSizeLessThanOrEqualTo(32);
    }

    @Test
    void doesNotSendRoutineUpdateWhenLifecycleNotificationAlreadyExists() {
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

        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository, never()).save(any(PushNotificationDeliveryEntity.class));
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
        return candidate(
            commuteId,
            legId,
            lineId,
            lineNumber,
            category,
            eventType,
            reminderBucket,
            notificationKey,
            dedupeKey,
            location,
            null,
            commuteLabel,
            sourceEventAt,
            url
        );
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
        String displayDirection,
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
            displayDirection,
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
