package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.alert.AlertHistoryRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;

class PushNotificationDispatchServiceTest {
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final SavedCommutePushPlanner planner = mock(SavedCommutePushPlanner.class);
    private final PushNotificationEventRepository eventRepository = mock(PushNotificationEventRepository.class);
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);
    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final PushNotificationClientEventRepository clientEventRepository = mock(PushNotificationClientEventRepository.class);
    private final WebPushClient webPushClient = mock(WebPushClient.class);
    private final PushNotificationPreferenceService preferenceService = mock(PushNotificationPreferenceService.class);
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner = mock(LineSubscriptionPushPlanner.class);
    private final PushLineEventObservationService lineEventObservationService = mock(PushLineEventObservationService.class);
    private final PushSavedCommuteEventObservationService savedCommuteObservationService = mock(PushSavedCommuteEventObservationService.class);
    private final IngestionFreshness ingestionFreshness = mock(IngestionFreshness.class);
    private final AlertHistoryRepository alertHistoryRepository = mock(AlertHistoryRepository.class);
    private final PushProperties pushProperties = new PushProperties();
    private final PushReceiptTokenService receiptTokenService = new PushReceiptTokenService(pushProperties);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();
    private final PushNotificationDispatchService service = new PushNotificationDispatchService(
        savedCommuteRepository,
        planner,
        eventRepository,
        subscriptionRepository,
        deliveryRepository,
        clientEventRepository,
        webPushClient,
        preferenceService,
        lineSubscriptionPushPlanner,
        lineEventObservationService,
        savedCommuteObservationService,
        formatter,
        receiptTokenService,
        ingestionFreshness,
        alertHistoryRepository,
        pushProperties,
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
        pushProperties.setReceiptSigningSecret("test-receipt-secret");
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(planner.candidatesFor(any(SavedCommuteEntity.class), any(PlannedClosureFollowUpPolicy.class)))
            .thenAnswer(invocation -> planner.candidatesFor(invocation.getArgument(0)));
        when(lineSubscriptionPushPlanner.candidatesFor(
            anyString(), anyList(), any(PlannedClosureFollowUpPolicy.class)
        )).thenAnswer(invocation -> lineSubscriptionPushPlanner.candidatesFor(
            invocation.getArgument(0), invocation.getArgument(1)
        ));
        when(savedCommuteObservationService.observe(
            any(PushNotificationCandidate.class),
            any(),
            any(PushNotificationPreferenceEntity.class),
            any(Instant.class)
        )).thenAnswer(invocation -> {
            PushNotificationCandidate candidate = invocation.getArgument(0);
            Instant now = invocation.getArgument(3);
            return new PushSavedCommuteEventObservationService.ObservationDecision(
                PushSavedCommuteEventObservationEntity.create("saved_obs_default", candidate, now),
                true,
                false
            );
        });
        when(savedCommuteObservationService.activeObservations(anyString())).thenReturn(List.of());
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
    void persistsHardInvalidSubscriptionFromScheduledDispatch() {
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
            "dedupe-gone-1",
            "Finch to Union",
            "Morning commute",
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/expired-subscription",
            "expired-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-gone-1")).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class)))
            .thenReturn(PushDeliveryResult.gone(410));

        service.evaluateSavedCommuteNotifications();

        assertThat(subscription.isEnabled()).isFalse();
        verify(subscriptionRepository).save(subscription);
    }

    @Test
    void silentlyBaselinesExistingSavedCommuteReducedSpeedZoneAfterCommuteCreation() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T14:50:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-current",
            "reduced-speed-zone",
            "on-change",
            "saved-commute-current|commute_1|outbound|reduced-speed-zone|rsz-line-1",
            "dedupe-rsz-1",
            "Eglinton to Davisville",
            "Morning commute",
            Instant.parse("2026-06-05T13:00:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        PushSavedCommuteEventObservationEntity observation = PushSavedCommuteEventObservationEntity.create(
            "saved_obs_rsz",
            candidate,
            clock.instant()
        );

        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(preferences, candidate)).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(savedCommuteObservationService.observe(candidate, commute, preferences, clock.instant()))
            .thenReturn(new PushSavedCommuteEventObservationService.ObservationDecision(observation, true, true));

        service.evaluateSavedCommuteNotifications();

        verify(savedCommuteObservationService).observe(candidate, commute, preferences, clock.instant());
        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository, never()).save(any(PushNotificationDeliveryEntity.class));
    }

    @Test
    void doesNotSendSavedCommuteClearanceWhenEquivalentCurrentImpactExistsUnderNewKey() {
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
            "saved-commute-current",
            "reduced-speed-zone",
            "on-change",
            "saved-commute-current|commute_1|outbound|reduced-speed-zone|rsz-old",
            "dedupe-rsz-old",
            "Eglinton to Davisville",
            "Morning commute",
            Instant.parse("2026-06-05T13:00:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "push_event_rsz_old",
            previousCandidate,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PushNotificationCandidate currentCandidate = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-current",
            "reduced-speed-zone",
            "on-change",
            "saved-commute-current|commute_1|outbound|reduced-speed-zone|rsz-new",
            "dedupe-rsz-new",
            "Eglinton to Davisville",
            "Morning commute",
            Instant.parse("2026-06-05T13:10:00Z"),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        PushSavedCommuteEventObservationEntity observation = PushSavedCommuteEventObservationEntity.create(
            "saved_obs_rsz_new",
            currentCandidate,
            clock.instant()
        );

        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(preferences, currentCandidate)).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(currentCandidate));
        when(savedCommuteObservationService.observe(currentCandidate, commute, preferences, clock.instant()))
            .thenReturn(new PushSavedCommuteEventObservationService.ObservationDecision(observation, true, true));
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact")),
            eq("ACTIVE")
        )).thenReturn(List.of(previousEvent));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
    }

    @Test
    void doesNotSendSavedCommuteClearanceForDeletedCommuteEvent() {
        PushNotificationCandidate previousCandidate = candidate(
            null,
            "outbound",
            "line-1",
            "1",
            "saved-commute-current",
            "reduced-speed-zone",
            "on-change",
            "saved-commute-current|commute_deleted|outbound|reduced-speed-zone|rsz-line-1",
            "dedupe-rsz-deleted",
            "Eglinton to Davisville",
            "Deleted commute",
            Instant.parse("2026-06-05T13:00:00Z"),
            "/?panel=commutes&commute=commute_deleted"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "push_event_deleted_commute",
            previousCandidate,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));

        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact")),
            eq("ACTIVE")
        )).thenReturn(List.of(previousEvent));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
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
        assertThat(payload.timestamp()).isEqualTo("2026-06-05T14:20:00Z");
        assertThat(payload.toJson()).contains("\"sourceEventAt\":\"2026-06-05T14:20:00Z\"");
        assertThat(payload.toJson()).contains("\"sentAt\":\"2026-06-05T15:00:00Z\"");
        assertThat(payload.toJson()).contains("\"expiresAt\":\"2026-06-05T15:10:00Z\"");
        assertThat(payload.ttlSeconds()).isEqualTo(3600);
        assertThat(payload.deliveryId()).startsWith("push_delivery_");
        assertThat(payload.receiptToken()).isNotBlank();
    }

    @Test
    void lineWideActiveNotificationUsesLatestOpenedSnapshotTimeWhenAvailable() {
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
        PushNotificationCandidate candidate = candidate(
            null, null, "line-2", "2", "line-current", "delay", "on-change",
            "line-current|line-2|delay|ttc-route-71720",
            "user_1|line|line-2|delay|on-change|ttc-route-71720",
            "Bay station",
            "Westbound",
            null,
            Instant.parse("2026-06-05T14:46:00Z"),
            "/?panel=delays"
        );
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));
        when(preferenceService.allows(preferences, candidate)).thenReturn(true);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        when(planner.candidatesFor(any())).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-2"))).thenReturn(List.of(candidate));
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create("line_obs_1", candidate, clock.instant());
        when(lineEventObservationService.observe(candidate, preferences, clock.instant()))
            .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, false));
        when(eventRepository.existsByDedupeKey(candidate.dedupeKey())).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(alertHistoryRepository.findLatestOpenedSnapshotTime("ttc-route-71720"))
            .thenReturn(Optional.of(OffsetDateTime.parse("2026-06-05T14:47:00Z")));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class))).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity activeEvent = eventCaptor.getValue();
        assertThat(activeEvent.getSourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:47:00Z"));
        assertThat(activeEvent.getBody()).isEqualTo("""
            Delays westbound at Bay station.
            🕗 Jun 5, 10:47 AM""");

        ArgumentCaptor<WebPushPayload> payloadCaptor = ArgumentCaptor.forClass(WebPushPayload.class);
        verify(webPushClient).send(eq(subscription), anyString(), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue().timestamp()).isEqualTo("2026-06-05T14:47:00Z");
    }

    @Test
    void plannedClosureKeepsWindowStartInsteadOfAlertOpenedTime() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1", account, "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash", "p256dh-key", "auth-secret", "Chrome Android", clock.instant()
        );
        PushNotificationCandidate candidate = withSourceUpdatedAt(candidate(
            null, null, "line-2", "2", "line-planned", "planned-closure", "closure-morning",
            "line-planned|line-2|planned-closure|closure-1",
            "user_1|line|line-2|planned-closure|closure-morning|closure-1|update|revision-1",
            "Jane to Ossington", null, null, Instant.parse("2026-06-05T23:59:00Z"),
            "/?panel=closures"
        ), Instant.parse("2026-06-05T14:45:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));
        when(preferenceService.allows(preferences, candidate)).thenReturn(true);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        when(planner.candidatesFor(any())).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-2"))).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey(candidate.dedupeKey())).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(alertHistoryRepository.findLatestOpenedSnapshotTime("closure-1"))
            .thenReturn(Optional.of(OffsetDateTime.parse("2026-06-05T14:47:00Z")));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class)))
            .thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        assertThat(eventCaptor.getValue().getSourceEventAt()).isEqualTo(Instant.parse("2026-06-05T23:59:00Z"));
        assertThat(eventCaptor.getValue().getBody()).endsWith("🕗 Closure starts Jun 5, 7:59 PM");
        verify(alertHistoryRepository, never()).findLatestOpenedSnapshotTime(anyString());
    }

    @Test
    void plannedClosureCopyRevisionDoesNotResendAnOlderSourceUpdate() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationCandidate previousCandidate = withSourceUpdatedAt(candidate(
            null, null, "line-2", "2", "line-planned", "planned-closure", "closure-morning",
            "line-planned|line-2|planned-closure|closure-1", "old-copy-dedupe",
            "Jane to Ossington", null, null, Instant.parse("2026-06-05T23:59:00Z"),
            "/?panel=closures"
        ), Instant.parse("2026-06-05T14:40:00Z"));
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "push_event_previous", previousCandidate, Instant.parse("2026-06-05T14:50:00Z")
        );
        PushNotificationCandidate revisedCopy = withSourceUpdatedAt(candidate(
            null, null, "line-2", "2", "line-planned", "planned-closure", "closure-morning",
            previousCandidate.notificationKey(), "new-copy-dedupe",
            "Jane to Ossington", null, null, Instant.parse("2026-06-05T23:59:00Z"),
            "/?panel=closures"
        ), Instant.parse("2026-06-05T14:40:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));
        when(preferenceService.allows(preferences, revisedCopy)).thenReturn(true);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        when(planner.candidatesFor(any())).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-2"))).thenReturn(List.of(revisedCopy));
        when(eventRepository.existsByDedupeKey(revisedCopy.dedupeKey())).thenReturn(false);
        when(eventRepository.findFirstByAccountIdAndNotificationKeyAndReminderBucketOrderByCreatedAtDesc(
            "user_1", revisedCopy.notificationKey(), "closure-morning"
        )).thenReturn(Optional.of(previousEvent));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
    }

    @Test
    void plannedClosureSourceUpdateAfterPreviousDeliveryCreatesNewNotification() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1", account, "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash", "p256dh-key", "auth-secret", "Chrome Android", clock.instant()
        );
        PushNotificationCandidate previousCandidate = withSourceUpdatedAt(candidate(
            null, null, "line-2", "2", "line-planned", "planned-closure", "closure-morning",
            "line-planned|line-2|planned-closure|closure-1", "previous-dedupe",
            "Jane to Ossington", null, null, Instant.parse("2026-06-05T23:59:00Z"),
            "/?panel=closures"
        ), Instant.parse("2026-06-05T14:40:00Z"));
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "push_event_previous", previousCandidate, Instant.parse("2026-06-05T14:50:00Z")
        );
        PushNotificationCandidate sourceRevision = withSourceUpdatedAt(candidate(
            null, null, "line-2", "2", "line-planned", "planned-closure", "closure-morning",
            previousCandidate.notificationKey(), "source-revision-dedupe",
            "Jane to Ossington", null, null, Instant.parse("2026-06-05T23:59:00Z"),
            "/?panel=closures"
        ), Instant.parse("2026-06-05T14:55:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));
        when(preferenceService.allows(preferences, sourceRevision)).thenReturn(true);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        when(planner.candidatesFor(any())).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-2"))).thenReturn(List.of(sourceRevision));
        when(eventRepository.existsByDedupeKey(sourceRevision.dedupeKey())).thenReturn(false);
        when(eventRepository.findFirstByAccountIdAndNotificationKeyAndReminderBucketOrderByCreatedAtDesc(
            "user_1", sourceRevision.notificationKey(), "closure-morning"
        )).thenReturn(Optional.of(previousEvent));
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class)))
            .thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
        verify(webPushClient).send(eq(subscription), anyString(), any(WebPushPayload.class));
    }

    @Test
    void keepsNewEventWhenEveryPushSendFailsSoDiagnosticsCanExplainMisses() {
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
        verify(eventRepository, never()).delete(any(PushNotificationEventEntity.class));
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
    void retriesStillCurrentActiveEventToSubscriptionEnabledAfterEventWasCreated() {
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
        PushNotificationEventEntity existingEvent = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity newlyEnabledSubscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            "endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:59:00Z")
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
        when(eventRepository.findByDedupeKey("dedupe-1")).thenReturn(Optional.of(existingEvent));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(newlyEnabledSubscription));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_1"))
            .thenReturn(Optional.empty());
        when(webPushClient.send(eq(newlyEnabledSubscription), anyString(), any(WebPushPayload.class)))
            .thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(webPushClient).send(eq(newlyEnabledSubscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository).save(argThat(delivery ->
            delivery.getEvent() == existingEvent
                && delivery.getSubscription() == newlyEnabledSubscription
                && "accepted".equals(delivery.getStatus())
        ));
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
        commute.updateNotificationRule(
            true, 127, null, null, true, true,
            true, true, true, true, true, Instant.parse("2026-06-05T14:31:00Z")
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
    void newlyObservedOldLineWideReducedSpeedZoneIsBaselinedWithoutPush() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-05-01T12:00:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_old_rsz",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription-old-rsz",
            "endpoint-hash-old-rsz",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            clock.instant()
        );
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-1"));

        PushNotificationCandidate staleRszCandidate = candidate(
            null, null, "line-1", "1", "line-current", "reduced-speed-zone", "on-change",
            "line-current|line-1|reduced-speed-zone|zone-old",
            "user_1|line|line-1|reduced-speed-zone|on-change|zone-old",
            "Eglinton to Davisville", null, Instant.parse("2026-05-31T15:00:00Z"),
            "/?panel=reduced-speed-zones"
        );
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-1")))
            .thenReturn(List.of(staleRszCandidate));
        when(preferenceService.allows(preferences, staleRszCandidate)).thenReturn(true);
        PushLineEventObservationEntity observation = PushLineEventObservationEntity.create(
            "obs-old-rsz", staleRszCandidate, clock.instant()
        );
        when(lineEventObservationService.observe(eq(staleRszCandidate), eq(preferences), any(Instant.class)))
            .thenReturn(new PushLineEventObservationService.ObservationDecision(observation, true, false));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
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
    void routeVisibleButRuleSuppressedSavedCommuteCandidateDoesNotSendOrCreateFalseClearance() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));

        SavedCommuteEntity commute = SavedCommuteEntity.create("commute_1", account, "Work", "queen", "bloor-yonge", false, clock.instant());
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));

        PushNotificationCandidate visibleButSuppressed = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-current",
            "delay",
            "on-change",
            "saved-commute-current|commute_1|outbound|delay|delay-line-1",
            "dedupe-1",
            "Queen to Bloor-Yonge",
            "Work",
            clock.instant(),
            "/?panel=commutes",
            false
        );
        PushNotificationEventEntity existingActive = PushNotificationEventEntity.create(
            "push_event_active",
            visibleButSuppressed,
            clock.instant().minusSeconds(300)
        );
        when(planner.candidatesFor(commute)).thenReturn(List.of(visibleButSuppressed));
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact")),
            eq("ACTIVE")
        )).thenReturn(List.of(existingActive));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
    }

    @Test
    void disablingSavedCommuteServiceRestoredClosesTheLifecycleWithoutDeliveringIt() {
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

        verify(eventRepository).save(argThat(event ->
            "CLEARED".equals(event.getNotificationState()) && !event.isDeliveryAllowed()
        ));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
    }

    @Test
    void routeLevelServiceRestoredSettingSuppressesItsClearance() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());

        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1", account, "Work", "finch", "union", true, clock.instant().minusSeconds(600)
        );
        commute.updateNotificationRule(
            true, 127, null, null, true, true,
            true, true, true, true, false, clock.instant().minusSeconds(300)
        );
        PushNotificationCandidate previousCandidate = candidate(
            "commute_1", "outbound", "line-1", "1", "saved-commute-current", "delay", "on-change",
            "saved-commute-current|commute_1|outbound|delay|delay-line-1", "dedupe-1",
            "Finch to Union", "Work", clock.instant().minusSeconds(900), "/?panel=commutes"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "event-1", previousCandidate, clock.instant().minusSeconds(600)
        );
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(eq("user_1"), anyList(), eq("ACTIVE")))
            .thenReturn(List.of(previousEvent));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(argThat(event ->
            "CLEARED".equals(event.getNotificationState()) && !event.isDeliveryAllowed()
        ));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
    }

    @Test
    void savedCommuteClearanceOutsideItsLegWindowIsNotDeliveredOrRetried() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());

        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1", account, "Work", "finch", "union", true, clock.instant().minusSeconds(600)
        );
        commute.updateNotificationRule(
            true,
            62, 7 * 60, 9 * 60,
            62, 15 * 60, 19 * 60,
            true, true,
            true, true, true, true, true,
            clock.instant().minusSeconds(300)
        );
        PushNotificationCandidate previousCandidate = candidate(
            "commute_1", "outbound", "line-1", "1", "saved-commute-current", "delay", "on-change",
            "saved-commute-current|commute_1|outbound|delay|delay-line-1", "dedupe-1",
            "Finch to Union", "Work", clock.instant().minusSeconds(900), "/?panel=commutes"
        );
        PushNotificationEventEntity previousEvent = PushNotificationEventEntity.create(
            "event-1", previousCandidate, clock.instant().minusSeconds(600)
        );
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(eq("user_1"), anyList(), eq("ACTIVE")))
            .thenReturn(List.of(previousEvent));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(argThat(event ->
            "CLEARED".equals(event.getNotificationState()) && !event.isDeliveryAllowed()
        ));
        verify(webPushClient, never()).send(any(), anyString(), any(WebPushPayload.class));
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
    void lineWideClearedNotificationUsesLatestClearedSnapshotTimeWhenAvailable() {
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
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-2"));
        when(alertHistoryRepository.findLatestClearedSnapshotTime("ttc-route-71720"))
            .thenReturn(Optional.of(OffsetDateTime.parse("2026-06-05T14:49:00Z")));

        PushNotificationCandidate previousCandidate = candidate(
            null, null, "line-2", "2", "line-current", "delay", "on-change",
            "line-current|line-2|delay|ttc-route-71720",
            "user_1|line|line-2|delay|on-change|ttc-route-71720",
            "Bay station",
            "Westbound",
            null,
            Instant.parse("2026-06-05T14:46:00Z"),
            "/?panel=delays"
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
            Service has resumed westbound at Bay station.
            🕗 Jun 5, 10:49 AM""");
        assertThat(clearedEvent.getSourceEventAt()).isEqualTo(Instant.parse("2026-06-05T14:49:00Z"));
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
    void failedLineWideActiveDeliveryKeepsEventForDiagnosticsAndClearance() {
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

        verify(eventRepository, never()).delete(any(PushNotificationEventEntity.class));
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
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
    void retriesRecentClearedLifecycleNotificationForEnabledSubscriptionWithoutDelivery() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            "https://webpush.push.apple.com/ios",
            "ios-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iOS",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushNotificationCandidate activeCandidate = candidate(
            null, null, "line-5", "5", "line-current", "suspension", "on-change",
            "line-current|line-5|suspension|ttc-route-71423",
            "user_1|line|line-5|suspension|on-change|ttc-route-71423",
            "Sloane to Kennedy",
            null,
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=alerts"
        );
        PushNotificationEventEntity activeEvent = PushNotificationEventEntity.create(
            "push_event_active",
            activeCandidate,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationEventEntity clearedEvent = PushNotificationEventEntity.cleared(
            "push_event_cleared",
            activeEvent,
            Instant.parse("2026-06-05T14:55:00Z"),
            formatter
        );
        PushNotificationDeliveryEntity displayedIosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            clearedEvent,
            iosSubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T14:55:05Z")
        );
        displayedIosDelivery.markDisplayed(Instant.parse("2026-06-05T14:55:07Z"));

        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-5"));
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-5"))).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact")),
            eq("ACTIVE")
        )).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationStateAndCreatedAtAfterOrderByCreatedAtDesc(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact", "line-current")),
            eq("CLEARED"),
            eq(Instant.parse("2026-06-04T15:00:00Z")),
            eq(PageRequest.of(0, 25))
        )).thenReturn(List.of(clearedEvent));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_cleared", "push_subscription_android"))
            .thenReturn(Optional.empty());
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_cleared", "push_subscription_ios"))
            .thenReturn(Optional.of(displayedIosDelivery));
        when(webPushClient.send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.cleared("line-current|line-5|suspension|ttc-route-71423"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(webPushClient).send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.cleared("line-current|line-5|suspension|ttc-route-71423"))),
            any(WebPushPayload.class)
        );
        verify(webPushClient, never()).send(eq(iosSubscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository).save(argThat(delivery ->
            delivery.getEvent() == clearedEvent
                && delivery.getSubscription() == androidSubscription
                && "accepted".equals(delivery.getStatus())
        ));
    }

    @Test
    void doesNotReplayClearedLifecycleNotificationCreatedBeforeSubscriptionWasReenabled() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:00:00Z")
        );
        androidSubscription.disable(Instant.parse("2026-06-05T14:58:00Z"));
        androidSubscription.refresh(
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationCandidate activeCandidate = candidate(
            null, null, "line-5", "5", "line-current", "suspension", "on-change",
            "line-current|line-5|suspension|ttc-route-71423",
            "user_1|line|line-5|suspension|on-change|ttc-route-71423",
            "Sloane to Kennedy",
            null,
            Instant.parse("2026-06-05T14:20:00Z"),
            "/?panel=alerts"
        );
        PushNotificationEventEntity activeEvent = PushNotificationEventEntity.create(
            "push_event_active",
            activeCandidate,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationEventEntity clearedEvent = PushNotificationEventEntity.cleared(
            "push_event_cleared",
            activeEvent,
            Instant.parse("2026-06-05T14:55:00Z"),
            formatter
        );

        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(androidSubscription));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-5"));
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-5"))).thenReturn(List.of());
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact")),
            eq("ACTIVE")
        )).thenReturn(List.of());
        when(eventRepository.findByAccountIdAndCategoryInAndNotificationStateAndCreatedAtAfterOrderByCreatedAtDesc(
            eq("user_1"),
            eq(List.of("saved-commute-current", "saved-commute-impact", "line-current")),
            eq("CLEARED"),
            eq(Instant.parse("2026-06-04T15:00:00Z")),
            eq(PageRequest.of(0, 25))
        )).thenReturn(List.of(clearedEvent));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_cleared", "push_subscription_android"))
            .thenReturn(Optional.empty());
        when(webPushClient.send(eq(androidSubscription), anyString(), any(WebPushPayload.class)))
            .thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(webPushClient, never()).send(eq(androidSubscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository, never()).save(argThat(delivery -> delivery.getEvent() == clearedEvent));
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
    void doesNotSendLineObservationClearanceWhenSameSourceAlertChangesEventType() {
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, clock.instant());
        PushNotificationPreferenceEntity spyPrefs = spy(preferences);
        when(spyPrefs.isLineRestoredEnabled()).thenReturn(true);
        PushNotificationCandidate previousCandidate = candidate(
            null, null, "line-5", "5", "line-current", "suspension", "on-change",
            "line-current|line-5|suspension|ttc-route-71001",
            "user_1|line|line-5|suspension|on-change|ttc-route-71001",
            "Sloane to Kennedy",
            "Both Ways",
            null,
            Instant.parse("2026-07-02T03:17:00Z"),
            "/?panel=alerts&impactKind=suspension&impactId=ttc-route-71001"
        );
        PushLineEventObservationEntity previousObservation = PushLineEventObservationEntity.create(
            "line_obs_suspension",
            previousCandidate,
            Instant.parse("2026-07-02T03:18:00Z")
        );
        PushNotificationCandidate currentDelayCandidate = candidate(
            null, null, "line-5", "5", "line-current", "delay", "on-change",
            "line-current|line-5|delay|ttc-route-71001",
            "user_1|line|line-5|delay|on-change|ttc-route-71001",
            "Sloane to Kennedy",
            "Both Ways",
            null,
            Instant.parse("2026-07-02T03:17:00Z"),
            "/?panel=delays&impactKind=delay&impactId=ttc-route-71001"
        );
        assertThat(previousObservation.getSourceIncidentKey()).isEqualTo(currentDelayCandidate.sourceIncidentKey());

        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(spyPrefs);
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of("line-5"));
        when(lineSubscriptionPushPlanner.candidatesFor("user_1", List.of("line-5")))
            .thenReturn(List.of(currentDelayCandidate));
        when(preferenceService.allows(spyPrefs, currentDelayCandidate)).thenReturn(true);
        when(lineEventObservationService.observe(currentDelayCandidate, spyPrefs, clock.instant()))
            .thenReturn(new PushLineEventObservationService.ObservationDecision(previousObservation, false, false));
        when(lineEventObservationService.activeObservations("user_1")).thenReturn(List.of(previousObservation));
        when(eventRepository.existsByDedupeKey("user_1|line|line-5|delay|on-change|ttc-route-71001"))
            .thenReturn(true);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(argThat(event -> "CLEARED".equals(event.getNotificationState())));
        verify(lineEventObservationService, never()).markCleared(previousObservation, clock.instant());
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

    @Test
    void retriesExistingNotificationForSubscriptionWithoutAcceptedDelivery() {
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
        PushNotificationEventEntity existingEvent = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            "https://webpush.push.apple.com/ios",
            "ios-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iOS",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushNotificationDeliveryEntity failedAndroidDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android",
            existingEvent,
            androidSubscription,
            PushDeliveryResult.failed(429, "Push service rejected the request."),
            Instant.parse("2026-06-05T14:59:25Z")
        );
        PushNotificationDeliveryEntity acceptedIosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            existingEvent,
            iosSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T14:45:10Z")
        );
        acceptedIosDelivery.markDisplayed(Instant.parse("2026-06-05T14:45:20Z"));
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(true);
        when(eventRepository.findByDedupeKey("dedupe-1")).thenReturn(Optional.of(existingEvent));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_android"))
            .thenReturn(Optional.of(failedAndroidDelivery));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_ios"))
            .thenReturn(Optional.of(acceptedIosDelivery));
        when(webPushClient.send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient).send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        );
        verify(webPushClient, never()).send(eq(iosSubscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository).save(failedAndroidDelivery);
        assertThat(failedAndroidDelivery.getStatus()).isEqualTo("accepted");
        assertThat(failedAndroidDelivery.getHttpStatus()).isEqualTo(202);
        assertThat(failedAndroidDelivery.getDisplayedAt()).isNull();
        assertThat(failedAndroidDelivery.getCreatedAt()).isEqualTo(clock.instant());
    }

    @Test
    void retriesExistingNotificationForEnabledSubscriptionWithoutAnyDelivery() {
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
        PushNotificationEventEntity existingEvent = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            "https://webpush.push.apple.com/ios",
            "ios-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iOS",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushNotificationDeliveryEntity acceptedIosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            existingEvent,
            iosSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T14:45:10Z")
        );
        acceptedIosDelivery.markDisplayed(Instant.parse("2026-06-05T14:45:20Z"));
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(true);
        when(eventRepository.findByDedupeKey("dedupe-1")).thenReturn(Optional.of(existingEvent));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_android"))
            .thenReturn(Optional.empty());
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_ios"))
            .thenReturn(Optional.of(acceptedIosDelivery));
        when(webPushClient.send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(webPushClient).send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        );
        verify(webPushClient, never()).send(eq(iosSubscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository).save(argThat(delivery ->
            delivery.getEvent() == existingEvent
                && delivery.getSubscription() == androidSubscription
                && "accepted".equals(delivery.getStatus())
        ));
    }

    @Test
    void retriesAcceptedActiveDeliveryWhenDisplayAcknowledgementIsMissing() {
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
        PushNotificationEventEntity existingEvent = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            "https://webpush.push.apple.com/ios",
            "ios-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iOS",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushSubscriptionEntity reportedAndroidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android_reported",
            account,
            "https://fcm.googleapis.com/fcm/send/android-reported",
            "android-reported-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushNotificationDeliveryEntity acceptedAndroidDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android",
            existingEvent,
            androidSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T14:45:10Z")
        );
        PushNotificationDeliveryEntity reportedAndroidDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android_reported",
            existingEvent,
            reportedAndroidSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T14:45:10Z")
        );
        PushNotificationClientEventEntity reportedDisplay = PushNotificationClientEventEntity.create(
            "push_client_event_android_reported",
            "user_1",
            reportedAndroidSubscription,
            reportedAndroidDelivery,
            "android-reported-endpoint-hash",
            existingEvent.getNotificationKey(),
            "ACTIVE",
            "push_received",
            null,
            Instant.parse("2026-06-05T14:45:20Z"),
            Instant.parse("2026-06-05T14:45:20Z")
        );
        PushNotificationDeliveryEntity displayedIosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            existingEvent,
            iosSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T14:45:10Z")
        );
        displayedIosDelivery.markDisplayed(Instant.parse("2026-06-05T14:45:20Z"));

        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.allows(any(), any())).thenReturn(true);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(true);
        when(eventRepository.findByDedupeKey("dedupe-1")).thenReturn(Optional.of(existingEvent));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1"))
            .thenReturn(List.of(androidSubscription, reportedAndroidSubscription, iosSubscription));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_android"))
            .thenReturn(Optional.of(acceptedAndroidDelivery));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_ios"))
            .thenReturn(Optional.of(displayedIosDelivery));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_android_reported"))
            .thenReturn(Optional.of(reportedAndroidDelivery));
        when(clientEventRepository.findCurrentAttemptEvents(
            "push_delivery_android_reported",
            Instant.parse("2026-06-05T14:45:10Z")
        )).thenReturn(List.of(reportedDisplay));
        when(webPushClient.send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        )).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(webPushClient).send(
            eq(androidSubscription),
            eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active("saved-commute-impact|commute_1|outbound|delay|delay-line-1"))),
            any(WebPushPayload.class)
        );
        verify(webPushClient, never()).send(eq(iosSubscription), anyString(), any(WebPushPayload.class));
        verify(webPushClient, never()).send(eq(reportedAndroidSubscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository).save(acceptedAndroidDelivery);
        verify(deliveryRepository, never()).save(reportedAndroidDelivery);
        assertThat(acceptedAndroidDelivery.getStatus()).isEqualTo("accepted");
        assertThat(acceptedAndroidDelivery.getDisplayedAt()).isNull();
        assertThat(acceptedAndroidDelivery.getCreatedAt()).isEqualTo(clock.instant());
    }

    @Test
    void doesNotRetryRecentFailedDeliveryOnEveryEvaluation() {
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
        PushNotificationEventEntity existingEvent = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:40:00Z")
        );
        PushNotificationDeliveryEntity recentFailedDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android",
            existingEvent,
            androidSubscription,
            PushDeliveryResult.failed(429, "Push service rejected the request."),
            Instant.parse("2026-06-05T14:59:45Z")
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
        when(eventRepository.findByDedupeKey("dedupe-1")).thenReturn(Optional.of(existingEvent));
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(androidSubscription));
        when(deliveryRepository.findByEventIdAndSubscriptionId("push_event_1", "push_subscription_android"))
            .thenReturn(Optional.of(recentFailedDelivery));

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
        String commuteLabel,
        Instant sourceEventAt,
        String url,
        boolean deliveryAllowed
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
            url,
            deliveryAllowed
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
            displayDirection,
            commuteLabel,
            sourceEventAt,
            url,
            true
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
        String url,
        boolean deliveryAllowed
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
            sourceIncidentKeyFrom(notificationKey),
            notificationKey,
            dedupeKey,
            notification,
            url,
            deliveryAllowed
        );
    }

    private String sourceIncidentKeyFrom(String notificationKey) {
        String[] parts = notificationKey == null ? new String[0] : notificationKey.split("\\|", -1);
        if (parts.length >= 4 && "line-current".equals(parts[0])) {
            return String.join("|", parts[0], parts[1], parts[3]);
        }
        if (parts.length >= 5 && parts[0].startsWith("saved-commute-")) {
            return String.join("|", parts[0], parts[1], parts[2], parts[4]);
        }
        return notificationKey;
    }

    private PushNotificationCandidate withSourceUpdatedAt(
        PushNotificationCandidate candidate,
        Instant sourceUpdatedAt
    ) {
        return new PushNotificationCandidate(
            candidate.accountId(),
            candidate.commuteId(),
            candidate.legId(),
            candidate.lineId(),
            candidate.lineNumber(),
            candidate.category(),
            candidate.eventType(),
            candidate.reminderBucket(),
            candidate.sourceIncidentKey(),
            candidate.notificationKey(),
            candidate.dedupeKey(),
            candidate.notification(),
            candidate.url(),
            candidate.updateFingerprint(),
            candidate.deliveryAllowed(),
            sourceUpdatedAt
        );
    }
}
