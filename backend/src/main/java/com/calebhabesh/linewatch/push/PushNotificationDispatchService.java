package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationDispatchService {
    private final SavedCommuteRepository savedCommuteRepository;
    private final SavedCommutePushPlanner planner;
    private final PushNotificationEventRepository eventRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final WebPushClient webPushClient;
    private final Clock clock;

    @Autowired
    public PushNotificationDispatchService(
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        WebPushClient webPushClient
    ) {
        this(savedCommuteRepository, planner, eventRepository, subscriptionRepository, deliveryRepository, webPushClient, Clock.systemUTC());
    }

    PushNotificationDispatchService(
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        WebPushClient webPushClient,
        Clock clock
    ) {
        this.savedCommuteRepository = savedCommuteRepository;
        this.planner = planner;
        this.eventRepository = eventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.webPushClient = webPushClient;
        this.clock = clock;
    }

    @Transactional
    public void evaluateSavedCommuteNotifications() {
        for (String accountId : subscriptionRepository.findEnabledAccountIds()) {
            List<SavedCommuteEntity> commutes = savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc(accountId);
            for (SavedCommuteEntity commute : commutes) {
                for (PushNotificationCandidate candidate : planner.candidatesFor(commute)) {
                    sendIfNew(candidate);
                }
            }
        }
    }

    private void sendIfNew(PushNotificationCandidate candidate) {
        if (eventRepository.existsByDedupeKey(candidate.dedupeKey())) {
            return;
        }
        Instant now = clock.instant();
        PushNotificationEventEntity event = eventRepository.save(PushNotificationEventEntity.create(
            nextId("push_event"),
            candidate,
            now
        ));
        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdAndEnabledTrue(candidate.accountId());
        for (PushSubscriptionEntity subscription : subscriptions) {
            if (!subscriptionAllowsCandidate(subscription, candidate)) {
                continue;
            }
            PushDeliveryResult result = webPushClient.send(subscription);
            if (result.invalidSubscription()) {
                subscription.disable(now);
            }
            deliveryRepository.save(PushNotificationDeliveryEntity.create(
                nextId("push_delivery"),
                event,
                subscription,
                result,
                now
            ));
        }
    }

    private boolean subscriptionAllowsCandidate(PushSubscriptionEntity subscription, PushNotificationCandidate candidate) {
        if ("saved-commute-planned".equals(candidate.category())) {
            return subscription.isPlannedClosureNotificationsEnabled();
        }
        return subscription.isCommuteNotificationsEnabled();
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }
}
