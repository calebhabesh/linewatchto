package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

class PushNotificationServiceTest {
    private final PushProperties properties = new PushProperties();
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);
    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final SavedCommutePushPlanner planner = mock(SavedCommutePushPlanner.class);
    private final PushNotificationPreferenceService preferenceService = mock(PushNotificationPreferenceService.class);
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner = mock(LineSubscriptionPushPlanner.class);
    private final IngestionFreshness ingestionFreshness = mock(IngestionFreshness.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();
    private final PushNotificationService service = new PushNotificationService(
        properties,
        subscriptionRepository,
        deliveryRepository,
        savedCommuteRepository,
        planner,
        preferenceService,
        lineSubscriptionPushPlanner,
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

        assertThat(response.activeTags()).containsExactly("saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1");
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
        assertThat(response.cleanupAllowed()).isFalse();
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
        when(deliveryRepository.findPendingForSubscription(
            "user_1",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/subscription"),
            PageRequest.of(0, 1)
        )).thenReturn(List.of(delivery));

        PushResponses.PendingPushNotificationResponse response = service.latestPendingNotification(
            account,
            new PushRequests.SubscriptionEndpointRequest("https://fcm.googleapis.com/fcm/send/subscription")
        );

        assertThat(response.notification()).isNotNull();
        assertThat(response.notification().tag()).isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1");
        assertThat(response.notification().state()).isEqualTo("ACTIVE");
        assertThat(response.notification().body()).endsWith("🕗 Jun 5, 10:20 AM");
        assertThat(response.notification().timestamp()).isEqualTo("2026-06-05T15:00:00Z");
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
