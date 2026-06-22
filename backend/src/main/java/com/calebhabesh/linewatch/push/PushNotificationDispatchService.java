package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationDispatchService {
    private static final String ACTIVE_STATE = "ACTIVE";
    private static final String CLEARED_STATE = "CLEARED";
    
    private final SavedCommuteRepository savedCommuteRepository;
    private final SavedCommutePushPlanner planner;
    private final PushNotificationEventRepository eventRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final WebPushClient webPushClient;
    private final PushNotificationPreferenceService preferenceService;
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner;
    private final PushNotificationFormatter formatter;
    private final Clock clock;

    @Autowired
    public PushNotificationDispatchService(
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        WebPushClient webPushClient,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationFormatter formatter
    ) {
        this(
            savedCommuteRepository, planner, eventRepository, subscriptionRepository,
            deliveryRepository, webPushClient, preferenceService, lineSubscriptionPushPlanner,
            formatter,
            Clock.systemUTC()
        );
    }

    PushNotificationDispatchService(
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        WebPushClient webPushClient,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationFormatter formatter,
        Clock clock
    ) {
        this.savedCommuteRepository = savedCommuteRepository;
        this.planner = planner;
        this.eventRepository = eventRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.webPushClient = webPushClient;
        this.preferenceService = preferenceService;
        this.lineSubscriptionPushPlanner = lineSubscriptionPushPlanner;
        this.formatter = formatter;
        this.clock = clock;
    }

    @Transactional
    public void evaluateSavedCommuteNotifications() {
        for (String accountId : subscriptionRepository.findEnabledAccountIds()) {
            PushNotificationPreferenceEntity preferences = preferenceService.preferenceEntityForAccountId(accountId);
            
            List<SavedCommuteEntity> commutes = savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc(accountId);
            List<PushNotificationCandidate> savedCommuteCandidates = commutes.stream()
                .flatMap(commute -> planner.candidatesFor(commute).stream())
                .toList();

            List<String> subscribedLineIds = preferenceService.subscribedLineIds(accountId);
            List<PushNotificationCandidate> lineCandidates = lineSubscriptionPushPlanner.candidatesFor(accountId, subscribedLineIds);

            List<PushNotificationCandidate> allCandidates = new java.util.ArrayList<>();
            allCandidates.addAll(savedCommuteCandidates);
            allCandidates.addAll(lineCandidates);

            List<PushNotificationCandidate> allowedCandidates = allCandidates.stream()
                .filter(candidate -> preferenceService.allows(preferences, candidate))
                .toList();

            List<String> currentCategories = List.of("saved-commute-current", "saved-commute-impact", "line-current");
            Set<String> currentNotificationKeys = new java.util.HashSet<>();

            for (PushNotificationCandidate candidate : allowedCandidates) {
                if (currentCategories.contains(candidate.category())) {
                    currentNotificationKeys.add(candidate.notificationKey());
                }
                sendIfNew(candidate);
            }

            sendClearedNotifications(accountId, preferences, currentNotificationKeys);
        }
    }

    private void sendClearedNotifications(String accountId, PushNotificationPreferenceEntity preferences, Set<String> currentNotificationKeys) {
        Instant now = clock.instant();
        List<String> currentCategories = List.of("saved-commute-current", "saved-commute-impact", "line-current");
        
        List<PushNotificationEventEntity> activeEvents = eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            accountId,
            currentCategories,
            ACTIVE_STATE
        );

        for (PushNotificationEventEntity activeEvent : activeEvents) {
            if (currentNotificationKeys.contains(activeEvent.getNotificationKey())) {
                continue;
            }
            if (eventRepository.existsByNotificationKeyAndNotificationState(activeEvent.getNotificationKey(), CLEARED_STATE)) {
                continue;
            }

            boolean shouldClear = false;
            if (activeEvent.getCommuteId() != null) {
                // saved-commute scoped
                shouldClear = preferences.isSavedCommuteRestoredEnabled();
            } else if (activeEvent.getLineId() != null) {
                // line scoped
                shouldClear = preferences.isLineRestoredEnabled();
            }

            if (shouldClear) {
                PushNotificationEventEntity clearedEvent = eventRepository.save(PushNotificationEventEntity.cleared(
                    nextId("push_event"),
                    activeEvent,
                    now,
                    formatter
                ));
                if (!sendEventToSubscriptions(clearedEvent, now)) {
                    eventRepository.delete(clearedEvent);
                }
            }
        }
    }

    private void sendIfNew(PushNotificationCandidate candidate) {
        if (eventRepository.existsByDedupeKey(candidate.dedupeKey())) {
            return;
        }
        Instant now = clock.instant();
        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdAndEnabledTrue(candidate.accountId());
        if (subscriptions.isEmpty()) {
            return;
        }
        PushNotificationEventEntity event = eventRepository.save(PushNotificationEventEntity.create(
            nextId("push_event"),
            candidate,
            now
        ));
        if (!sendEventToSubscriptions(event, subscriptions, now)) {
            eventRepository.delete(event);
        }
    }

    private boolean sendEventToSubscriptions(PushNotificationEventEntity event, Instant now) {
        return sendEventToSubscriptions(event, subscriptionRepository.findByAccountIdAndEnabledTrue(event.getAccountId()), now);
    }

    private boolean sendEventToSubscriptions(PushNotificationEventEntity event, List<PushSubscriptionEntity> subscriptions, Instant now) {
        boolean accepted = false;
        for (PushSubscriptionEntity subscription : subscriptions) {
            PushDeliveryResult result = webPushClient.send(subscription, topicFor(event.getNotificationKey()));
            if (result.accepted()) {
                accepted = true;
            }
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
        return accepted;
    }

    static String topicFor(String notificationKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String encoded = Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(digest.digest(notificationKey.getBytes(StandardCharsets.UTF_8)));
            return encoded.substring(0, Math.min(32, encoded.length()));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not build Web Push topic", ex);
        }
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }
}
