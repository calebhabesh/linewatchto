package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;

class PushNotificationServiceTest {
    private final PushProperties properties = new PushProperties();
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);
    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final PushNotificationEventRepository eventRepository = mock(PushNotificationEventRepository.class);
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final SavedCommutePushPlanner planner = mock(SavedCommutePushPlanner.class);
    private final PushNotificationPreferenceService preferenceService = mock(PushNotificationPreferenceService.class);
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner = mock(LineSubscriptionPushPlanner.class);
    private final PushNotificationClientEventRepository clientEventRepository = mock(PushNotificationClientEventRepository.class);
    private final WebPushClient webPushClient = mock(WebPushClient.class);
    private final IngestionFreshness ingestionFreshness = mock(IngestionFreshness.class);
    private final PushReceiptTokenService receiptTokenService = new PushReceiptTokenService(properties);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();
    private final PushNotificationService service = new PushNotificationService(
        properties,
        subscriptionRepository,
        deliveryRepository,
        eventRepository,
        savedCommuteRepository,
        planner,
        preferenceService,
        lineSubscriptionPushPlanner,
        clientEventRepository,
        webPushClient,
        ingestionFreshness,
        receiptTokenService,
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
        properties.setClearedNotificationRetention(Duration.ofHours(4));
        properties.setReceiptSigningSecret("test-receipt-secret");
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        when(deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
            anyString(),
            anyString(),
            anyList(),
            any(Instant.class)
        )).thenReturn(List.of());
    }

    @Test
    void activeNotificationsReturnsCurrentSavedCommuteTagsAllowedBySubscriptionPreferences() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Work",
            "glencairn",
            "lawrence-west",
            false,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationCandidate commuteImpact = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-impact",
            "reduced-speed-zone",
            "on-change",
            "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1",
            "dedupe-1",
            "Glencairn to Lawrence West",
            "Work",
            clock.instant(),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationCandidate plannedClosure = candidate(
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-planned",
            "planned-closure",
            "on-change",
            "saved-commute-planned|commute_1|outbound|planned-closure|closure-line-1",
            "planned-dedupe-1",
            "Glencairn to Lawrence West",
            "Work",
            clock.instant(),
            "/?panel=commutes&commute=commute_1"
        );
        subscription.updatePreferences(true, false, Instant.parse("2026-06-05T14:50:00Z"));
        when(subscriptionRepository.findByAccountIdAndEndpointHash(
            "user_1",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription")
        )).thenReturn(Optional.of(subscription));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(commuteImpact, plannedClosure));
        PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(eq("user_1"), any())).thenReturn(List.of());
        when(preferenceService.allows(eq(preferences), eq(commuteImpact))).thenReturn(true);
        when(preferenceService.allows(eq(preferences), eq(plannedClosure))).thenReturn(false);

        PushResponses.ActivePushNotificationsResponse response = service.activeNotifications(
            account,
            new PushRequests.SubscriptionEndpointRequest("https://fcm.googleapis.com/fcm/send/subscription")
        );

        assertThat(response.activeTags()).containsExactly("saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1|active");
        assertThat(response.retainedTags()).containsExactly(
            "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1|active",
            "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1"
        );
        assertThat(response.cleanupAllowed()).isTrue();
    }

    @Test
    void activeNotificationsDisablesCleanupWhenDashboardIngestionIsStale() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash(
            "user_1",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription")
        )).thenReturn(Optional.of(subscription));

        PushResponses.ActivePushNotificationsResponse response = service.activeNotifications(
            account,
            new PushRequests.SubscriptionEndpointRequest("https://fcm.googleapis.com/fcm/send/subscription")
        );

        assertThat(response.activeTags()).isEmpty();
        assertThat(response.retainedTags()).isEmpty();
        assertThat(response.cleanupAllowed()).isFalse();
    }

    @Test
    void activeNotificationsRetainsDisplayedClearedNotificationsForConfiguredGracePeriod() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/subscription";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
            .thenReturn(Optional.of(subscription));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(eq("user_1"), anyList())).thenReturn(List.of());
        when(deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
            eq("user_1"),
            eq(endpointHash),
            eq(List.of("saved-commute-current", "saved-commute-impact", "line-current")),
            eq(Instant.parse("2026-06-05T11:00:00Z"))
        )).thenReturn(List.of("saved-commute-impact|commute_1|outbound|delay|delay-line-1"));

        PushResponses.ActivePushNotificationsResponse response = service.activeNotifications(
            account,
            new PushRequests.SubscriptionEndpointRequest(endpoint)
        );

        assertThat(response.activeTags()).isEmpty();
        assertThat(response.retainedTags())
            .containsExactly(
                "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
                "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
                "saved-commute-impact|commute_1|outbound|delay|delay-line-1"
            );
        assertThat(response.cleanupAllowed()).isTrue();
    }

    @Test
    void activeNotificationsDoesNotRetainClearedNotificationsWhenRetentionIsDisabled() {
        properties.setClearedNotificationRetention(Duration.ZERO);
        String endpoint = "https://fcm.googleapis.com/fcm/send/subscription";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
            .thenReturn(Optional.of(subscription));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
        PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
        when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
        when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
        when(lineSubscriptionPushPlanner.candidatesFor(eq("user_1"), anyList())).thenReturn(List.of());

        PushResponses.ActivePushNotificationsResponse response = service.activeNotifications(
            account,
            new PushRequests.SubscriptionEndpointRequest(endpoint)
        );

        assertThat(response.activeTags()).isEmpty();
        assertThat(response.retainedTags()).isEmpty();
        verify(deliveryRepository, never()).findRecentlyDisplayedClearedNotificationKeys(
            anyString(),
            anyString(),
            anyList(),
            any(Instant.class)
        );
    }

    @Test
    void latestPendingNotificationUsesStableTagAndLifecycleState() {
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
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
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:30Z")
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash(
            "user_1",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription")
        )).thenReturn(Optional.of(subscription));
        when(deliveryRepository.findPendingBatchForSubscription(
            eq("user_1"),
            eq(PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription")),
            eq(Instant.parse("2026-06-05T14:45:00Z")),
            eq(PageRequest.of(0, 5))
        )).thenReturn(List.of(delivery));

        PushResponses.PendingPushNotificationResponse response = service.latestPendingNotification(
            account,
            new PushRequests.SubscriptionEndpointRequest("https://fcm.googleapis.com/fcm/send/subscription")
        );

        assertThat(response.notification()).isNotNull();
        assertThat(response.notification().tag()).isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
        assertThat(response.notifications()).extracting(PushResponses.PendingPushNotification::tag)
            .containsExactly("saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
        assertThat(response.notification().state()).isEqualTo("ACTIVE");
        assertThat(response.notification().body()).endsWith("🕗 Jun 5, 10:20 AM");
        assertThat(response.notification().timestamp()).isEqualTo("2026-06-05T14:20:00Z");
        assertThat(response.notification().sourceEventAt()).isEqualTo("2026-06-05T14:20:00Z");
        assertThat(response.notification().sentAt()).isEqualTo("2026-06-05T15:00:30Z");
        assertThat(response.notification().expiresAt()).isEqualTo("2026-06-05T15:10:30Z");
        assertThat(response.notification().deliveryId()).isEqualTo("push_delivery_1");
        assertThat(response.notification().receiptToken()).isNotBlank();
    }

    @Test
    void latestPendingNotificationReturnsPendingBatchWithoutMarkingDisplayed() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/subscription";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
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
        PushNotificationEventEntity activeEvent = PushNotificationEventEntity.create(
            "push_event_active",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationEventEntity clearedEvent = PushNotificationEventEntity.cleared(
            "push_event_cleared",
            activeEvent,
            Instant.parse("2026-06-05T15:20:00Z"),
            formatter
        );
        PushNotificationDeliveryEntity activeDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_active",
            activeEvent,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:30Z")
        );
        PushNotificationDeliveryEntity clearedDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_cleared",
            clearedEvent,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:20:30Z")
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
            .thenReturn(Optional.of(subscription));
        when(deliveryRepository.findPendingBatchForSubscription(
            "user_1",
            endpointHash,
            Instant.parse("2026-06-05T14:45:00Z"),
            PageRequest.of(0, 5)
        ))
            .thenReturn(List.of(activeDelivery, clearedDelivery));

        PushResponses.PendingPushNotificationResponse response = service.latestPendingNotification(
            account,
            new PushRequests.SubscriptionEndpointRequest(endpoint)
        );

        assertThat(response.notifications()).extracting(PushResponses.PendingPushNotification::tag)
            .containsExactly(
                "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
                "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared"
            );
        assertThat(response.notification().tag())
            .isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared");
        assertThat(activeDelivery.getDisplayedAt()).isNull();
        assertThat(clearedDelivery.getDisplayedAt()).isNull();
    }

    @Test
    void latestPendingNotificationUsesCurrentSubscriptionEnablementBoundary() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/subscription";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:00:00Z")
        );
        subscription.disable(Instant.parse("2026-06-05T14:58:00Z"));
        subscription.refresh(
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T15:00:00Z")
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
            .thenReturn(Optional.of(subscription));
        when(deliveryRepository.findPendingBatchForSubscription(
            "user_1",
            endpointHash,
            Instant.parse("2026-06-05T15:00:00Z"),
            PageRequest.of(0, 5)
        )).thenReturn(List.of());

        PushResponses.PendingPushNotificationResponse response = service.latestPendingNotification(
            account,
            new PushRequests.SubscriptionEndpointRequest(endpoint)
        );

        assertThat(response.notification()).isNull();
        assertThat(response.notifications()).isEmpty();
    }

    @Test
    void marksPayloadNotificationDisplayedByEndpointAndDisplayTag() {
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
            clock.instant(),
            "/?panel=commutes&commute=commute_1"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create("push_event_1", candidate, clock.instant());
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_1",
            account,
            "https://fcm.googleapis.com/fcm/send/subscription",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            clock.instant()
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            clock.instant()
        );
        when(deliveryRepository.findPendingDeliveryForNotification(
            "user_1",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
            "ACTIVE",
            PageRequest.of(0, 1)
        )).thenReturn(List.of(delivery));

        service.markPayloadNotificationDisplayed(
            account,
            new PushRequests.DisplayedNotificationRequest(
                "https://fcm.googleapis.com/fcm/send/subscription",
                "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
            )
        );

        assertThat(delivery.getDisplayedAt()).isEqualTo(clock.instant());
    }

    @Test
    void recordsSignedReceiptEventWithoutAccountSession() {
        PushProperties tokenProperties = new PushProperties();
        tokenProperties.setVapidPrivateKey("test-receipt-secret");
        PushReceiptTokenService tokenService = new PushReceiptTokenService(tokenProperties);
        PushNotificationService receiptService = new PushNotificationService(
            properties,
            subscriptionRepository,
            deliveryRepository,
            eventRepository,
            savedCommuteRepository,
            planner,
            preferenceService,
            lineSubscriptionPushPlanner,
            clientEventRepository,
            webPushClient,
            ingestionFreshness,
            tokenService,
            clock
        );
        PushNotificationCandidate candidate = candidate(
            null,
            null,
            "line-2",
            "2",
            "line-current",
            "suspension",
            "on-change",
            "line-current|line-2|suspension|ttc-route-70610",
            "user_1|line|line-2|suspension|on-change|ttc-route-70610",
            "Broadview to St George",
            null,
            Instant.parse("2026-06-05T14:50:00Z"),
            "/?panel=alerts&impactKind=suspension&impactId=ttc-route-70610"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create("push_event_1", candidate, clock.instant());
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            clock.instant()
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            clock.instant()
        );
        when(deliveryRepository.findById("push_delivery_1")).thenReturn(Optional.of(delivery));
        when(clientEventRepository.save(any(PushNotificationClientEventEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        receiptService.recordReceiptEvent(new PushRequests.ReceiptEventRequest(
            "push_delivery_1",
            tokenService.tokenFor(delivery),
            "displayed_acknowledged",
            null
        ));

        assertThat(delivery.getDisplayedAt()).isEqualTo(clock.instant());
        org.mockito.ArgumentCaptor<PushNotificationClientEventEntity> eventCaptor =
            org.mockito.ArgumentCaptor.forClass(PushNotificationClientEventEntity.class);
        verify(clientEventRepository).save(eventCaptor.capture());
        PushNotificationClientEventEntity saved = eventCaptor.getValue();
        assertThat(saved.getAccountId()).isEqualTo("user_1");
        assertThat(saved.getDelivery().getId()).isEqualTo("push_delivery_1");
        assertThat(saved.getSubscription().getId()).isEqualTo("push_subscription_android");
        assertThat(saved.getNotificationKey()).isEqualTo("line-current|line-2|suspension|ttc-route-70610");
        assertThat(saved.getNotificationState()).isEqualTo("ACTIVE");
        assertThat(saved.getStage()).isEqualTo("displayed_acknowledged");
    }

    @Test
    void deliveryDiagnosticsReturnsRecentPerDeviceDeliveryTimeline() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/android";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushNotificationCandidate candidate = candidate(
            null,
            null,
            "line-2",
            "2",
            "line-current",
            "suspension",
            "on-change",
            "line-current|line-2|suspension|ttc-route-70610",
            "user_1|line|line-2|suspension|on-change|ttc-route-70610",
            "Victoria Park to Kennedy",
            null,
            Instant.parse("2026-06-05T14:50:00Z"),
            "/?panel=alerts&impactKind=suspension&impactId=ttc-route-70610"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );
        PushNotificationClientEventEntity received = PushNotificationClientEventEntity.create(
            "push_client_event_1",
            account.getId(),
            subscription,
            delivery,
            endpointHash,
            "line-current|line-2|suspension|ttc-route-70610",
            "ACTIVE",
            "push_received",
            null,
            Instant.parse("2026-06-05T15:00:07Z"),
            Instant.parse("2026-06-05T15:00:08Z")
        );
        PushNotificationClientEventEntity displayed = PushNotificationClientEventEntity.create(
            "push_client_event_2",
            account.getId(),
            subscription,
            delivery,
            endpointHash,
            "line-current|line-2|suspension|ttc-route-70610",
            "ACTIVE",
            "displayed_acknowledged",
            null,
            Instant.parse("2026-06-05T15:00:09Z"),
            Instant.parse("2026-06-05T15:00:10Z")
        );
        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(delivery));
        when(clientEventRepository.findByDeliveryIds(List.of("push_delivery_1")))
            .thenReturn(List.of(received, displayed));

        PushResponses.PushDeliveryDiagnosticsResponse response = service.deliveryDiagnostics(account);

        assertThat(response.deliveries()).hasSize(1);
        PushResponses.PushDeliveryDiagnosticResponse diagnostic = response.deliveries().getFirst();
        assertThat(diagnostic.deviceLabel()).isEqualTo("Android Chrome");
        assertThat(diagnostic.endpointHashPrefix()).isEqualTo(endpointHash.substring(0, 12));
        assertThat(diagnostic.tag()).isEqualTo("line-current|line-2|suspension|ttc-route-70610|active");
        assertThat(diagnostic.deliveryStatus()).isEqualTo("accepted");
        assertThat(diagnostic.httpStatus()).isEqualTo(202);
        assertThat(diagnostic.displayedAt()).isNull();
        assertThat(diagnostic.attemptCount()).isEqualTo(1);
        assertThat(diagnostic.clientEvents())
            .extracting(PushResponses.PushClientEventResponse::stage)
            .containsExactly("push_received", "displayed_acknowledged");
    }

    @Test
    void deliveryDiagnosticsReturnsGroupedNotificationAttempts() {
        String androidEndpoint = "https://fcm.googleapis.com/fcm/send/android";
        String androidEndpointHash = PushNotificationService.hashEndpoint(androidEndpoint);
        String iosEndpoint = "https://webpush.push.apple.com/ios";
        String iosEndpointHash = PushNotificationService.hashEndpoint(iosEndpoint);
        PushNotificationCandidate candidate = candidate(
            null,
            null,
            "line-2",
            "2",
            "line-current",
            "suspension",
            "on-change",
            "line-current|line-2|suspension|ttc-route-70610",
            "user_1|line|line-2|suspension|on-change|ttc-route-70610",
            "Victoria Park to Kennedy",
            null,
            Instant.parse("2026-06-05T14:50:00Z"),
            "/?panel=alerts&impactKind=suspension&impactId=ttc-route-70610"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            androidEndpoint,
            androidEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            iosEndpoint,
            iosEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationDeliveryEntity androidDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android",
            event,
            androidSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );
        PushNotificationDeliveryEntity iosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            event,
            iosSubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T15:00:06Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(iosDelivery, androidDelivery));
        when(clientEventRepository.findByDeliveryIds(List.of("push_delivery_ios", "push_delivery_android")))
            .thenReturn(List.of());

        PushResponses.PushDeliveryDiagnosticsResponse response = service.deliveryDiagnostics(account);

        assertThat(response.deliveries()).hasSize(2);
        assertThat(response.notifications()).hasSize(1);
        PushResponses.PushNotificationDiagnosticGroupResponse notification = response.notifications().getFirst();
        assertThat(notification.id()).isEqualTo("push_event_1");
        assertThat(notification.notificationKey()).isEqualTo("line-current|line-2|suspension|ttc-route-70610");
        assertThat(notification.sourceIncidentKey()).isEqualTo("line-current|line-2|ttc-route-70610");
        assertThat(notification.attempts())
            .extracting(PushResponses.PushDeliveryDiagnosticResponse::deviceLabel)
            .containsExactly("iOS Safari", "Android Chrome");
        assertThat(notification.attempts())
            .extracting(PushResponses.PushDeliveryDiagnosticResponse::endpointHashPrefix)
            .containsExactly(iosEndpointHash.substring(0, 12), androidEndpointHash.substring(0, 12));
    }

    @Test
    void deliveryDiagnosticsIncludesRecipientsThatWereNotAttempted() {
        String iosEndpoint = "https://webpush.push.apple.com/ios";
        String iosEndpointHash = PushNotificationService.hashEndpoint(iosEndpoint);
        String androidEndpoint = "https://fcm.googleapis.com/fcm/send/android";
        String androidEndpointHash = PushNotificationService.hashEndpoint(androidEndpoint);
        PushNotificationCandidate candidate = candidate(
            null,
            null,
            "line-1",
            "1",
            "line-current",
            "delay",
            "on-change",
            "line-current|line-1|delay|ttc-route-71768",
            "user_1|line|line-1|delay|on-change|ttc-route-71768",
            "St Andrew station",
            "Northbound",
            Instant.parse("2026-06-05T14:50:00Z"),
            "/?panel=delays"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            iosEndpoint,
            iosEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            androidEndpoint,
            androidEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T20:30:00Z")
        );
        PushNotificationDeliveryEntity iosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            event,
            iosSubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T15:00:05Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(iosDelivery));
        when(clientEventRepository.findByDeliveryIds(List.of("push_delivery_ios")))
            .thenReturn(List.of());
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription));

        PushResponses.PushDeliveryDiagnosticsResponse response = service.deliveryDiagnostics(account);

        PushResponses.PushNotificationDiagnosticGroupResponse notification = response.notifications().getFirst();
        assertThat(notification.recipients())
            .extracting(PushResponses.PushRecipientDiagnosticResponse::deviceLabel)
            .containsExactly("Android Chrome", "iOS Safari");
        PushResponses.PushRecipientDiagnosticResponse androidRecipient = notification.recipients().getFirst();
        assertThat(androidRecipient.status()).isEqualTo("not-attempted");
        assertThat(androidRecipient.reasonCode()).isEqualTo("subscription-registered-after-event");
        assertThat(androidRecipient.reason()).isEqualTo("Device was registered after this notification was created.");
        assertThat(androidRecipient.delivery()).isNull();
        PushResponses.PushRecipientDiagnosticResponse iosRecipient = notification.recipients().get(1);
        assertThat(iosRecipient.status()).isEqualTo("attempted");
        assertThat(iosRecipient.delivery().id()).isEqualTo("push_delivery_ios");
    }

    @Test
    void rotatedEndpointArchivesPreviousSubscriptionForSameInstallation() {
        String installationId = "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324";
        PushSubscriptionEntity previous = PushSubscriptionEntity.create(
            "push_subscription_previous",
            account,
            "https://fcm.googleapis.com/fcm/send/previous",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/previous"),
            "old-p256dh",
            "old-auth",
            "Chrome Android",
            installationId,
            "app-refresh",
            Instant.parse("2026-06-05T14:00:00Z")
        );
        String replacementEndpoint = "https://fcm.googleapis.com/fcm/send/replacement";
        when(subscriptionRepository.findByAccountIdAndEndpointHash(
            "user_1", PushNotificationService.hashEndpoint(replacementEndpoint)
        )).thenReturn(Optional.empty());
        when(subscriptionRepository.findByAccountIdAndInstallationIdAndEnabledTrue("user_1", installationId))
            .thenReturn(List.of(previous));
        when(subscriptionRepository.save(any(PushSubscriptionEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushResponses.PushSubscriptionResponse response = service.saveSubscription(
            account,
            new PushRequests.SaveSubscriptionRequest(
                replacementEndpoint,
                new PushRequests.PushSubscriptionKeys("new-p256dh", "new-auth"),
                "Chrome Android",
                "subscription-change",
                installationId
            )
        );

        assertThat(previous.isEnabled()).isFalse();
        assertThat(previous.getDisabledReason()).isEqualTo("superseded-by-installation");
        ArgumentCaptor<PushSubscriptionEntity> subscriptions = ArgumentCaptor.forClass(PushSubscriptionEntity.class);
        verify(subscriptionRepository, times(2)).save(subscriptions.capture());
        PushSubscriptionEntity replacement = subscriptions.getAllValues().get(1);
        assertThat(replacement.getInstallationId()).isEqualTo(installationId);
        assertThat(replacement.getRegistrationReason()).isEqualTo("subscription-change");
        assertThat(response.enabled()).isTrue();
    }

    @Test
    void appRefreshDoesNotReenableEndpointRejectedByPushService() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/gone";
        PushSubscriptionEntity invalid = PushSubscriptionEntity.create(
            "push_subscription_invalid",
            account,
            endpoint,
            PushNotificationService.hashEndpoint(endpoint),
            "p256dh",
            "auth",
            "Chrome Android",
            "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324",
            "app-refresh",
            Instant.parse("2026-06-05T14:00:00Z")
        );
        invalid.disable(Instant.parse("2026-06-05T14:30:00Z"), "push-service-410");
        when(subscriptionRepository.findByAccountIdAndEndpointHash(
            "user_1", PushNotificationService.hashEndpoint(endpoint)
        )).thenReturn(Optional.of(invalid));

        PushResponses.PushSubscriptionResponse response = service.saveSubscription(
            account,
            new PushRequests.SaveSubscriptionRequest(
                endpoint,
                new PushRequests.PushSubscriptionKeys("p256dh", "auth"),
                "Chrome Android",
                "app-refresh",
                "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324"
            )
        );

        assertThat(response.enabled()).isFalse();
        assertThat(invalid.getDisabledReason()).isEqualTo("push-service-410");
        verify(subscriptionRepository, never()).save(any(PushSubscriptionEntity.class));
    }

    @Test
    void testDeviceSendsManualDiagnosticPushAndRecordsDelivery() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/android";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324",
            "invalid-endpoint-replacement",
            Instant.parse("2026-06-05T14:30:00Z")
        );
        when(subscriptionRepository.findByIdAndAccountId("push_subscription_android", "user_1"))
            .thenReturn(Optional.of(subscription));
        when(eventRepository.save(any(PushNotificationEventEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(webPushClient.send(eq(subscription), anyString(), any(WebPushPayload.class)))
            .thenReturn(PushDeliveryResult.accepted(201));
        when(deliveryRepository.save(any(PushNotificationDeliveryEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushResponses.PushDeviceTestResponse response = service.testDevice(account, "push_subscription_android");

        ArgumentCaptor<PushNotificationEventEntity> eventCaptor = ArgumentCaptor.forClass(PushNotificationEventEntity.class);
        verify(eventRepository).save(eventCaptor.capture());
        PushNotificationEventEntity event = eventCaptor.getValue();
        assertThat(event.getCategory()).isEqualTo("diagnostic-test");
        assertThat(event.getEventType()).isEqualTo("test");
        assertThat(event.getTitle()).isEqualTo("LineWatchTO test notification");
        assertThat(event.getNotificationKey()).startsWith("diagnostic-test|push_subscription_android|");
        verify(webPushClient).send(eq(subscription), anyString(), any(WebPushPayload.class));
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
        assertThat(response.delivery().deviceLabel()).isEqualTo("Android Chrome");
        assertThat(response.delivery().deliveryStatus()).isEqualTo("accepted");
        assertThat(response.delivery().httpStatus()).isEqualTo(201);
    }

    @Test
    void devicesReturnsEnabledSubscriptionsWithDeliveryHealth() {
        String androidEndpoint = "https://fcm.googleapis.com/fcm/send/android";
        String androidEndpointHash = PushNotificationService.hashEndpoint(androidEndpoint);
        String iosEndpoint = "https://webpush.push.apple.com/ios";
        String iosEndpointHash = PushNotificationService.hashEndpoint(iosEndpoint);
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            androidEndpoint,
            androidEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324",
            "invalid-endpoint-replacement",
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            iosEndpoint,
            iosEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T13:30:00Z")
        );
        String staleAfterDisplayEndpoint = "https://webpush.push.apple.com/ios-restored";
        String staleAfterDisplayEndpointHash = PushNotificationService.hashEndpoint(staleAfterDisplayEndpoint);
        PushSubscriptionEntity staleAfterDisplaySubscription = PushSubscriptionEntity.create(
            "push_subscription_ios_restored",
            account,
            staleAfterDisplayEndpoint,
            staleAfterDisplayEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T12:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            null,
            null,
            "line-1",
            "1",
            "line-current",
            "delay",
            "on-change",
            "line-current|line-1|delay|ttc-route-71299",
            "user_1|line|line-1|delay|on-change|ttc-route-71299",
            "Finch to Union",
            null,
            Instant.parse("2026-06-05T14:50:00Z"),
            "/?panel=delays&impactKind=delay&impactId=ttc-route-71299"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationDeliveryEntity androidDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android",
            event,
            androidSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );
        androidDelivery.markDisplayed(Instant.parse("2026-06-05T15:00:07Z"));
        PushNotificationDeliveryEntity iosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            event,
            iosSubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T15:00:06Z")
        );
        PushNotificationDeliveryEntity olderDisplayedDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios_restored_old",
            event,
            staleAfterDisplaySubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T13:00:06Z")
        );
        olderDisplayedDelivery.markDisplayed(Instant.parse("2026-06-05T13:00:09Z"));
        PushNotificationDeliveryEntity newerUndisplayedDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios_restored_new",
            event,
            staleAfterDisplaySubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T15:05:06Z")
        );

        when(subscriptionRepository.findByAccountIdAndEnabledTrueOrderByUpdatedAtDesc("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription, staleAfterDisplaySubscription));
        when(deliveryRepository.findTopBySubscription_IdOrderByCreatedAtDesc("push_subscription_android"))
            .thenReturn(Optional.of(androidDelivery));
        when(deliveryRepository.findTopBySubscription_IdAndStatusOrderByCreatedAtDesc("push_subscription_android", "accepted"))
            .thenReturn(Optional.of(androidDelivery));
        when(deliveryRepository.findTopBySubscription_IdAndDisplayedAtIsNotNullOrderByDisplayedAtDesc("push_subscription_android"))
            .thenReturn(Optional.of(androidDelivery));
        when(deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNull("push_subscription_android", "accepted"))
            .thenReturn(0L);
        when(deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNullAndCreatedAtAfter(
            "push_subscription_android",
            "accepted",
            Instant.parse("2026-06-05T15:00:07Z")
        )).thenReturn(0L);
        when(deliveryRepository.findTopBySubscription_IdOrderByCreatedAtDesc("push_subscription_ios"))
            .thenReturn(Optional.of(iosDelivery));
        when(deliveryRepository.findTopBySubscription_IdAndStatusOrderByCreatedAtDesc("push_subscription_ios", "accepted"))
            .thenReturn(Optional.of(iosDelivery));
        when(deliveryRepository.findTopBySubscription_IdAndDisplayedAtIsNotNullOrderByDisplayedAtDesc("push_subscription_ios"))
            .thenReturn(Optional.empty());
        when(deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNull("push_subscription_ios", "accepted"))
            .thenReturn(3L);
        when(deliveryRepository.findTopBySubscription_IdOrderByCreatedAtDesc("push_subscription_ios_restored"))
            .thenReturn(Optional.of(newerUndisplayedDelivery));
        when(deliveryRepository.findTopBySubscription_IdAndStatusOrderByCreatedAtDesc("push_subscription_ios_restored", "accepted"))
            .thenReturn(Optional.of(newerUndisplayedDelivery));
        when(deliveryRepository.findTopBySubscription_IdAndDisplayedAtIsNotNullOrderByDisplayedAtDesc("push_subscription_ios_restored"))
            .thenReturn(Optional.of(olderDisplayedDelivery));
        when(deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNull("push_subscription_ios_restored", "accepted"))
            .thenReturn(2L);
        when(deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNullAndCreatedAtAfter(
            "push_subscription_ios_restored",
            "accepted",
            Instant.parse("2026-06-05T13:00:09Z")
        )).thenReturn(2L);
        when(subscriptionRepository.countByAccountIdAndInstallationId(
            "user_1",
            "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324"
        )).thenReturn(3L);

        PushResponses.PushDevicesResponse response = service.devices(account);

        assertThat(response.devices()).hasSize(3);
        PushResponses.PushDeviceResponse android = response.devices().get(0);
        assertThat(android.id()).isEqualTo("push_subscription_android");
        assertThat(android.deviceLabel()).isEqualTo("Android Chrome");
        assertThat(android.endpointHashPrefix()).isEqualTo(androidEndpointHash.substring(0, 12));
        assertThat(android.installationIdPrefix()).isEqualTo("6d0e67af");
        assertThat(android.registrationReason()).isEqualTo("invalid-endpoint-replacement");
        assertThat(android.previousEndpointCount()).isEqualTo(2);
        assertThat(android.lastAttemptAt()).isEqualTo("2026-06-05T15:00:05Z");
        assertThat(android.lastAcceptedAt()).isEqualTo("2026-06-05T15:00:05Z");
        assertThat(android.lastDisplayedAt()).isEqualTo("2026-06-05T15:00:07Z");
        assertThat(android.acceptedWithoutDisplayCount()).isZero();
        assertThat(android.deliveryHealth()).isEqualTo("displayed");
        assertThat(android.staleCandidate()).isFalse();

        PushResponses.PushDeviceResponse ios = response.devices().get(1);
        assertThat(ios.id()).isEqualTo("push_subscription_ios");
        assertThat(ios.deviceLabel()).isEqualTo("iOS Safari");
        assertThat(ios.endpointHashPrefix()).isEqualTo(iosEndpointHash.substring(0, 12));
        assertThat(ios.lastAttemptAt()).isEqualTo("2026-06-05T15:00:06Z");
        assertThat(ios.lastAcceptedAt()).isEqualTo("2026-06-05T15:00:06Z");
        assertThat(ios.lastDisplayedAt()).isNull();
        assertThat(ios.acceptedWithoutDisplayCount()).isEqualTo(3);
        assertThat(ios.deliveryHealth()).isEqualTo("accepted-no-display");
        assertThat(ios.staleCandidate()).isTrue();

        PushResponses.PushDeviceResponse restoredIos = response.devices().get(2);
        assertThat(restoredIos.id()).isEqualTo("push_subscription_ios_restored");
        assertThat(restoredIos.lastDisplayedAt()).isEqualTo("2026-06-05T13:00:09Z");
        assertThat(restoredIos.lastAcceptedAt()).isEqualTo("2026-06-05T15:05:06Z");
        assertThat(restoredIos.acceptedWithoutDisplayCount()).isEqualTo(2);
        assertThat(restoredIos.deliveryHealth()).isEqualTo("accepted-no-display");
        assertThat(restoredIos.staleCandidate()).isTrue();
    }

    @Test
    void disablesDeviceOnlyWhenItBelongsToAccount() {
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account,
            "https://webpush.push.apple.com/ios",
            PushNotificationService.hashEndpoint("https://webpush.push.apple.com/ios"),
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T13:30:00Z")
        );
        when(subscriptionRepository.findByIdAndAccountId("push_subscription_ios", "user_1"))
            .thenReturn(Optional.of(subscription));
        when(subscriptionRepository.findByIdAndAccountId("push_subscription_other", "user_1"))
            .thenReturn(Optional.empty());

        service.disableDevice(account, "push_subscription_ios");
        service.disableDevice(account, "push_subscription_other");

        assertThat(subscription.isEnabled()).isFalse();
        assertThat(subscription.getDisabledAt()).isEqualTo(clock.instant());
    }

    @Test
    void recordsClientEventForCurrentSubscriptionAndNotificationTag() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/android";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushNotificationCandidate candidate = candidate(
            null,
            null,
            "line-2",
            "2",
            "line-current",
            "suspension",
            "on-change",
            "line-current|line-2|suspension|ttc-route-70610",
            "user_1|line|line-2|suspension|on-change|ttc-route-70610",
            "Victoria Park to Kennedy",
            null,
            Instant.parse("2026-06-05T14:50:00Z"),
            "/?panel=alerts&impactKind=suspension&impactId=ttc-route-70610"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create("push_event_1", candidate, clock.instant());
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            clock.instant()
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            clock.instant()
        );
        when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
            .thenReturn(Optional.of(subscription));
        when(deliveryRepository.findLatestDeliveryForNotification(
            "user_1",
            endpointHash,
            "line-current|line-2|suspension|ttc-route-70610",
            "ACTIVE",
            PageRequest.of(0, 1)
        )).thenReturn(List.of(delivery));
        when(clientEventRepository.save(any(PushNotificationClientEventEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        service.recordClientEvent(
            account,
            new PushRequests.ClientEventRequest(
                endpoint,
                "line-current|line-2|suspension|ttc-route-70610|active",
                "push_received",
                ""
            )
        );

        org.mockito.ArgumentCaptor<PushNotificationClientEventEntity> eventCaptor =
            org.mockito.ArgumentCaptor.forClass(PushNotificationClientEventEntity.class);
        verify(clientEventRepository).save(eventCaptor.capture());
        PushNotificationClientEventEntity saved = eventCaptor.getValue();
        assertThat(saved.getAccountId()).isEqualTo("user_1");
        assertThat(saved.getDelivery().getId()).isEqualTo("push_delivery_1");
        assertThat(saved.getSubscription().getId()).isEqualTo("push_subscription_android");
        assertThat(saved.getNotificationKey()).isEqualTo("line-current|line-2|suspension|ttc-route-70610");
        assertThat(saved.getNotificationState()).isEqualTo("ACTIVE");
        assertThat(saved.getStage()).isEqualTo("push_received");
        assertThat(saved.getOccurredAt()).isEqualTo(clock.instant());
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
            sourceIncidentKeyFrom(notificationKey),
            notificationKey,
            dedupeKey,
            notification,
            url
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

    @Test
    void configIncludesAccountDeviceSummaryWithoutChangingPreferences() {
        properties.setEnabled(true);
        properties.setVapidPublicKey("BPublicVapidKey");
        properties.setVapidPrivateKey("BPrivateVapidKey");
        PushResponses.PushPreferencesResponse preferences = new PushResponses.PushPreferencesResponse(true, true);
        when(preferenceService.preferencesFor(account)).thenReturn(preferences);
        when(subscriptionRepository.countByAccountIdAndEnabledTrue("user_1")).thenReturn(2L);

        PushResponses.PushConfigResponse response = service.config(account);

        assertThat(response.webPushAvailable()).isTrue();
        assertThat(response.vapidPublicKey()).isEqualTo("BPublicVapidKey");
        assertThat(response.preferences()).isEqualTo(preferences);
        assertThat(response.deviceSummary().enabledDeviceCount()).isEqualTo(2);
        assertThat(response.deviceSummary().hasEnabledDevices()).isTrue();
    }

    @Test
    void updatePreferencesReturnsAccountPreferencesAndDoesNotRequireDeviceSubscription() {
        PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
            true,
            false,
            null,
            null,
            null
        );
        PushResponses.PushPreferencesResponse updated = new PushResponses.PushPreferencesResponse(true, false);
        when(preferenceService.updatePreferences(account, request)).thenReturn(updated);

        PushResponses.PushPreferencesResponse response = service.updatePreferences(account, request);

        assertThat(response).isEqualTo(updated);
        verify(subscriptionRepository, never()).findByAccountIdAndEnabledTrue(anyString());
        verify(subscriptionRepository, never()).save(any());
    }
}
