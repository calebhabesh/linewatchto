package com.calebhabesh.linewatch.push;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class PushNotificationDispatchServiceTest {
    private final SavedCommuteRepository savedCommuteRepository = mock(SavedCommuteRepository.class);
    private final SavedCommutePushPlanner planner = mock(SavedCommutePushPlanner.class);
    private final PushNotificationEventRepository eventRepository = mock(PushNotificationEventRepository.class);
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);
    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final WebPushClient webPushClient = mock(WebPushClient.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
    private final PushNotificationDispatchService service = new PushNotificationDispatchService(
        savedCommuteRepository,
        planner,
        eventRepository,
        subscriptionRepository,
        deliveryRepository,
        webPushClient,
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
        PushNotificationCandidate candidate = new PushNotificationCandidate(
            "user_1",
            "commute_1",
            "outbound",
            "saved-commute-impact",
            "dedupe-1",
            "Morning commute affected",
            "Delay on Line 1: Finch to Union",
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
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(false);
        when(eventRepository.save(any(PushNotificationEventEntity.class))).thenReturn(event);
        when(subscriptionRepository.findByAccountIdAndEnabledTrue("user_1")).thenReturn(List.of(subscription));
        when(webPushClient.send(subscription)).thenReturn(PushDeliveryResult.accepted(202));

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository).save(any(PushNotificationEventEntity.class));
        verify(webPushClient).send(subscription);
        verify(deliveryRepository).save(any(PushNotificationDeliveryEntity.class));
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
        PushNotificationCandidate candidate = new PushNotificationCandidate(
            "user_1",
            "commute_1",
            "outbound",
            "saved-commute-impact",
            "dedupe-1",
            "Morning commute affected",
            "Delay on Line 1: Finch to Union",
            "/?panel=commutes&commute=commute_1"
        );
        when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
        when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
        when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
        when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(true);

        service.evaluateSavedCommuteNotifications();

        verify(eventRepository, never()).save(any(PushNotificationEventEntity.class));
        verify(webPushClient, never()).send(any());
        verify(deliveryRepository, never()).save(any(PushNotificationDeliveryEntity.class));
    }
}
