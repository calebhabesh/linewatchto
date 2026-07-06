package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationDispatchService {
    private static final String ACTIVE_STATE = "ACTIVE";
    private static final String CLEARED_STATE = "CLEARED";
    private static final Duration FAILED_DELIVERY_RETRY_DELAY = Duration.ofMinutes(5);
    private static final Duration ACCEPTED_UNDISPLAYED_DELIVERY_RETRY_DELAY = Duration.ofMinutes(2);
    private static final Duration ACCEPTED_UNDISPLAYED_DELIVERY_RETRY_WINDOW = Duration.ofMinutes(30);
    private static final Duration CLEARED_DELIVERY_RETRY_WINDOW = Duration.ofHours(24);
    private static final int CLEARED_DELIVERY_RETRY_LIMIT = 25;
    private static final List<String> CLEARED_RETRY_CATEGORIES = List.of(
        "saved-commute-current",
        "saved-commute-impact",
        "line-current"
    );
    
    private final SavedCommuteRepository savedCommuteRepository;
    private final SavedCommutePushPlanner planner;
    private final PushNotificationEventRepository eventRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final WebPushClient webPushClient;
    private final PushNotificationPreferenceService preferenceService;
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner;
    private final PushLineEventObservationService lineEventObservationService;
    private final PushNotificationFormatter formatter;
    private final PushReceiptTokenService receiptTokenService;
    private final IngestionFreshness ingestionFreshness;
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
        PushLineEventObservationService lineEventObservationService,
        PushNotificationFormatter formatter,
        PushReceiptTokenService receiptTokenService,
        IngestionFreshness ingestionFreshness
    ) {
        this(
            savedCommuteRepository, planner, eventRepository, subscriptionRepository,
            deliveryRepository, webPushClient, preferenceService, lineSubscriptionPushPlanner,
            lineEventObservationService,
            formatter,
            receiptTokenService,
            ingestionFreshness,
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
        PushLineEventObservationService lineEventObservationService,
        PushNotificationFormatter formatter,
        PushReceiptTokenService receiptTokenService,
        IngestionFreshness ingestionFreshness,
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
        this.lineEventObservationService = lineEventObservationService;
        this.formatter = formatter;
        this.receiptTokenService = receiptTokenService;
        this.ingestionFreshness = ingestionFreshness;
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
            Set<String> subscribedLineIdSet = new java.util.HashSet<>(subscribedLineIds);

            List<PushNotificationCandidate> allCandidates = new java.util.ArrayList<>();
            allCandidates.addAll(savedCommuteCandidates);
            allCandidates.addAll(lineCandidates);

            List<PushNotificationCandidate> allowedCandidates = allCandidates.stream()
                .filter(candidate -> preferenceService.allows(preferences, candidate))
                .toList();

            List<String> savedCurrentCategories = List.of("saved-commute-current", "saved-commute-impact");
            Set<String> savedCurrentNotificationKeys = new java.util.HashSet<>();
            Set<String> savedCurrentSourceIncidentKeys = new java.util.HashSet<>();
            for (PushNotificationCandidate candidate : savedCommuteCandidates) {
                if (savedCurrentCategories.contains(candidate.category())) {
                    savedCurrentNotificationKeys.add(candidate.notificationKey());
                    savedCurrentSourceIncidentKeys.add(candidate.sourceIncidentKey());
                }
            }

            List<PushNotificationCandidate> sendableCandidates = new java.util.ArrayList<>();
            Set<String> currentLineNotificationKeys = new java.util.HashSet<>();
            Set<String> currentLineSourceIncidentKeys = new java.util.HashSet<>();
            List<PushNotificationCandidate> currentLineCandidates = new java.util.ArrayList<>();

            for (PushNotificationCandidate candidate : allowedCandidates) {
                if ("line-current".equals(candidate.category())) {
                    currentLineNotificationKeys.add(candidate.notificationKey());
                    currentLineSourceIncidentKeys.add(candidate.sourceIncidentKey());
                    currentLineCandidates.add(candidate);
                    PushLineEventObservationService.ObservationDecision decision =
                        lineEventObservationService.observe(candidate, preferences, clock.instant());
                    if (decision.shouldSendActive() && candidate.deliveryAllowed()) {
                        sendableCandidates.add(candidate);
                    }
                } else if (candidate.deliveryAllowed()) {
                    sendableCandidates.add(candidate);
                }
            }

            for (PushNotificationCandidate candidate : sendableCandidates) {
                sendIfNew(candidate);
            }

            sendClearedNotifications(
                accountId,
                preferences,
                savedCurrentNotificationKeys,
                savedCurrentSourceIncidentKeys,
                sendableCandidates
            );
            sendClearedLineObservationNotifications(
                accountId,
                preferences,
                subscribedLineIdSet,
                currentLineNotificationKeys,
                currentLineSourceIncidentKeys,
                currentLineCandidates
            );
            retryRecentClearedLifecycleNotifications(accountId, preferences, subscribedLineIdSet, clock.instant());
        }
    }

    private void retryRecentClearedLifecycleNotifications(
        String accountId,
        PushNotificationPreferenceEntity preferences,
        Set<String> subscribedLineIds,
        Instant now
    ) {
        if (!ingestionFreshness.isDashboardFresh()) {
            return;
        }
        List<PushNotificationEventEntity> clearedEvents =
            eventRepository.findByAccountIdAndCategoryInAndNotificationStateAndCreatedAtAfterOrderByCreatedAtDesc(
                accountId,
                CLEARED_RETRY_CATEGORIES,
                CLEARED_STATE,
                now.minus(CLEARED_DELIVERY_RETRY_WINDOW),
                PageRequest.of(0, CLEARED_DELIVERY_RETRY_LIMIT)
            );
        for (PushNotificationEventEntity clearedEvent : clearedEvents) {
            if (clearedRetryAllowed(clearedEvent, preferences, subscribedLineIds)) {
                retryEventToIncompleteSubscriptions(clearedEvent, now);
            }
        }
    }

    private boolean clearedRetryAllowed(
        PushNotificationEventEntity event,
        PushNotificationPreferenceEntity preferences,
        Set<String> subscribedLineIds
    ) {
        if (event.getCommuteId() != null) {
            return preferences.isSavedCommuteRestoredEnabled();
        }
        if (event.getLineId() != null) {
            return preferences.isLineRestoredEnabled() && subscribedLineIds.contains(event.getLineId());
        }
        return false;
    }

    private void sendClearedNotifications(
        String accountId,
        PushNotificationPreferenceEntity preferences,
        Set<String> currentNotificationKeys,
        Set<String> currentSourceIncidentKeys,
        List<PushNotificationCandidate> currentCandidates
    ) {
        if (!ingestionFreshness.isDashboardFresh()) {
            return;
        }
        Instant now = clock.instant();
        List<String> currentCategories = List.of("saved-commute-current", "saved-commute-impact");
        
        List<PushNotificationEventEntity> activeEvents = eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            accountId,
            currentCategories,
            ACTIVE_STATE
        );

        for (PushNotificationEventEntity activeEvent : activeEvents) {
            if (currentNotificationKeys.contains(activeEvent.getNotificationKey())) {
                continue;
            }
            if (containsNonBlank(currentSourceIncidentKeys, activeEvent.getSourceIncidentKey())) {
                continue;
            }
            if (hasEquivalentCurrentCandidate(activeEvent, currentCandidates)) {
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

    private void sendClearedLineObservationNotifications(
        String accountId,
        PushNotificationPreferenceEntity preferences,
        Set<String> subscribedLineIds,
        Set<String> currentLineNotificationKeys,
        Set<String> currentLineSourceIncidentKeys,
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
            if (containsNonBlank(currentLineSourceIncidentKeys, observation.getSourceIncidentKey())) {
                continue;
            }
            if (!lineObservationStillEligible(preferences, subscribedLineIds, observation)) {
                lineEventObservationService.markCleared(observation, now);
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

    private boolean lineObservationStillEligible(
        PushNotificationPreferenceEntity preferences,
        Set<String> subscribedLineIds,
        PushLineEventObservationEntity observation
    ) {
        if (!subscribedLineIds.contains(observation.getLineId())) {
            return false;
        }
        if (!preferences.isReminderOnChangeEnabled()) {
            return false;
        }
        return switch (observation.getEventType()) {
            case "suspension" -> preferences.isLineSuspensionEnabled();
            case "delay" -> preferences.isLineDelayEnabled();
            case "reduced-speed-zone" -> preferences.isLineReducedSpeedZoneEnabled();
            case "planned-closure" -> preferences.isLinePlannedClosureEnabled();
            default -> true;
        };
    }

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
        if (sameNonBlank(observation.getSourceIncidentKey(), candidate.sourceIncidentKey())) {
            return true;
        }
        if (!same(observation.getEventType(), candidate.eventType())) {
            return false;
        }
        if (!compatibleLocations(observation.getEventLocation(), candidate.eventLocation())) {
            return false;
        }
        return compatibleSourceTimes(observation.getSourceEventAt(), candidate.sourceEventAt());
    }

    private boolean hasEquivalentCurrentCandidate(
        PushNotificationEventEntity activeEvent,
        List<PushNotificationCandidate> currentCandidates
    ) {
        return currentCandidates.stream()
            .filter(candidate -> !candidate.notificationKey().equals(activeEvent.getNotificationKey()))
            .anyMatch(candidate -> equivalentLifecycleEvent(activeEvent, candidate));
    }

    private boolean equivalentLifecycleEvent(
        PushNotificationEventEntity activeEvent,
        PushNotificationCandidate candidate
    ) {
        if (!sameCurrentCategoryFamily(activeEvent.getCategory(), candidate.category())) {
            return false;
        }
        if (!same(activeEvent.getLineId(), candidate.lineId())) {
            return false;
        }
        if (sameNonBlank(activeEvent.getSourceIncidentKey(), candidate.sourceIncidentKey())) {
            return true;
        }
        if (!same(activeEvent.getEventType(), candidate.eventType())) {
            return false;
        }
        if (!sameScope(activeEvent, candidate)) {
            return false;
        }
        if (!compatibleLocations(activeEvent.getEventLocation(), candidate.eventLocation())) {
            return false;
        }
        return compatibleSourceTimes(activeEvent.getSourceEventAt(), candidate.sourceEventAt());
    }

    private boolean sameScope(PushNotificationEventEntity activeEvent, PushNotificationCandidate candidate) {
        if (activeEvent.getCommuteId() != null) {
            return same(activeEvent.getCommuteId(), candidate.commuteId())
                && same(activeEvent.getLegId(), candidate.legId());
        }
        return candidate.commuteId() == null || candidate.commuteId().isBlank();
    }

    private boolean sameCurrentCategoryFamily(String first, String second) {
        return currentCategoryFamily(first).equals(currentCategoryFamily(second));
    }

    private String currentCategoryFamily(String category) {
        String normalized = normalize(category);
        if ("saved-commute-current".equals(normalized) || "saved-commute-impact".equals(normalized)) {
            return "saved-commute-current";
        }
        return normalized;
    }

    private boolean compatibleLocations(String first, String second) {
        String normalizedFirst = normalize(first);
        String normalizedSecond = normalize(second);
        return normalizedFirst.isBlank()
            || normalizedSecond.isBlank()
            || normalizedFirst.equals(normalizedSecond);
    }

    private boolean compatibleSourceTimes(Instant first, Instant second) {
        if (first == null || second == null) {
            return true;
        }
        return Duration.between(first, second).abs().compareTo(Duration.ofMinutes(60)) <= 0;
    }

    private boolean same(String first, String second) {
        return normalize(first).equals(normalize(second));
    }

    private boolean sameNonBlank(String first, String second) {
        String normalizedFirst = normalize(first);
        return !normalizedFirst.isBlank() && normalizedFirst.equals(normalize(second));
    }

    private boolean containsNonBlank(Set<String> values, String value) {
        String normalized = normalize(value);
        if (normalized.isBlank()) {
            return false;
        }
        return values.stream().anyMatch(candidate -> normalize(candidate).equals(normalized));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private void sendIfNew(PushNotificationCandidate candidate) {
        if (eventRepository.existsByDedupeKey(candidate.dedupeKey())) {
            eventRepository.findByDedupeKey(candidate.dedupeKey())
                .ifPresent(event -> retryEventToIncompleteSubscriptions(event, clock.instant()));
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

    private void retryEventToIncompleteSubscriptions(PushNotificationEventEntity event, Instant now) {
        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdAndEnabledTrue(event.getAccountId());
        Instant acceptedUndisplayedRetryUntil = ACTIVE_STATE.equals(event.getNotificationState()) && event.getCreatedAt() != null
            ? event.getCreatedAt().plus(ACCEPTED_UNDISPLAYED_DELIVERY_RETRY_WINDOW)
            : null;
        for (PushSubscriptionEntity subscription : subscriptions) {
            if (!subscriptionEnabledForEvent(subscription, event)) {
                continue;
            }
            Optional<PushNotificationDeliveryEntity> existingDelivery =
                deliveryRepository.findByEventIdAndSubscriptionId(event.getId(), subscription.getId());
            if (existingDelivery.isPresent() && !existingDelivery.get().shouldRetryDelivery(
                now,
                FAILED_DELIVERY_RETRY_DELAY,
                ACCEPTED_UNDISPLAYED_DELIVERY_RETRY_DELAY,
                acceptedUndisplayedRetryUntil
            )) {
                continue;
            }

            String deliveryId = existingDelivery
                .map(PushNotificationDeliveryEntity::getId)
                .orElseGet(() -> nextId("push_delivery"));
            PushDeliveryResult result = webPushClient.send(
                subscription,
                topicFor(PushNotificationDisplayTags.forEvent(event)),
                WebPushPayload.fromDelivery(event, deliveryId, subscription, receiptTokenService)
            );
            if (result.invalidSubscription()) {
                subscription.disable(now);
            }
            if (existingDelivery.isPresent()) {
                PushNotificationDeliveryEntity delivery = existingDelivery.get();
                delivery.recordAttempt(result, now);
                deliveryRepository.save(delivery);
            } else {
                deliveryRepository.save(PushNotificationDeliveryEntity.create(
                    deliveryId,
                    event,
                    subscription,
                    result,
                    now
                ));
            }
        }
    }

    private boolean sendEventToSubscriptions(PushNotificationEventEntity event, Instant now) {
        return sendEventToSubscriptions(event, subscriptionRepository.findByAccountIdAndEnabledTrue(event.getAccountId()), now);
    }

    private boolean sendEventToSubscriptions(PushNotificationEventEntity event, List<PushSubscriptionEntity> subscriptions, Instant now) {
        boolean accepted = false;
        for (PushSubscriptionEntity subscription : subscriptions) {
            if (!subscriptionEnabledForEvent(subscription, event)) {
                continue;
            }
            String deliveryId = nextId("push_delivery");
            PushDeliveryResult result = webPushClient.send(
                subscription,
                topicFor(PushNotificationDisplayTags.forEvent(event)),
                WebPushPayload.fromDelivery(event, deliveryId, subscription, receiptTokenService)
            );
            if (result.accepted()) {
                accepted = true;
            }
            if (result.invalidSubscription()) {
                subscription.disable(now);
            }
            deliveryRepository.save(PushNotificationDeliveryEntity.create(
                deliveryId,
                event,
                subscription,
                result,
                now
            ));
        }
        return accepted;
    }

    private boolean subscriptionEnabledForEvent(PushSubscriptionEntity subscription, PushNotificationEventEntity event) {
        Instant eventCreatedAt = event.getCreatedAt();
        if (eventCreatedAt == null) {
            return false;
        }
        Instant enabledAt = subscription.getEnabledAt();
        if (enabledAt == null) {
            return true;
        }
        return !eventCreatedAt.isBefore(enabledAt);
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
