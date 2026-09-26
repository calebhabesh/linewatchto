package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteNotificationSchedule;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.alert.AlertHistoryRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class PushNotificationDispatchService {
    private static final Logger log = LoggerFactory.getLogger(PushNotificationDispatchService.class);
    private static final String ACTIVE_STATE = "ACTIVE";
    private static final String CLEARED_STATE = "CLEARED";
    private static final Duration FAILED_DELIVERY_RETRY_DELAY = Duration.ofSeconds(30);
    private static final Duration CLEARED_DELIVERY_RETRY_WINDOW = Duration.ofHours(24);
    private static final int CLEARED_DELIVERY_RETRY_LIMIT = 25;
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final LocalTime PLANNED_CLOSURE_MORNING = LocalTime.of(6, 0);
    private static final List<String> CLEARED_RETRY_CATEGORIES = List.of(
        "saved-commute-current",
        "saved-commute-impact",
        "line-current"
    );
    
    private final SavedCommuteRepository savedCommuteRepository;
    private final PushCandidateResolver candidateResolver;
    private final PushNotificationEventRepository eventRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final PushNotificationClientEventRepository clientEventRepository;
    private final WebPushClient webPushClient;
    private final PushNotificationPreferenceService preferenceService;
    private final PushLineEventObservationService lineEventObservationService;
    private final PushSavedCommuteEventObservationService savedCommuteObservationService;
    private final PushNotificationFormatter formatter;
    private final PushReceiptTokenService receiptTokenService;
    private final IngestionFreshness ingestionFreshness;
    private final RegionalIngestionFreshness regionalIngestionFreshness;
    private final AlertHistoryRepository alertHistoryRepository;
    private final PushProperties pushProperties;
    private final PushSubscriptionLifecycleService lifecycleService;
    private final Clock clock;

    @Autowired
    public PushNotificationDispatchService(
        SavedCommuteRepository savedCommuteRepository,
        PushCandidateResolver candidateResolver,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationClientEventRepository clientEventRepository,
        WebPushClient webPushClient,
        PushNotificationPreferenceService preferenceService,
        PushLineEventObservationService lineEventObservationService,
        PushSavedCommuteEventObservationService savedCommuteObservationService,
        PushNotificationFormatter formatter,
        PushReceiptTokenService receiptTokenService,
        IngestionFreshness ingestionFreshness,
        RegionalIngestionFreshness regionalIngestionFreshness,
        AlertHistoryRepository alertHistoryRepository,
        PushProperties pushProperties,
        PushSubscriptionLifecycleService lifecycleService
    ) {
        this(
            savedCommuteRepository, candidateResolver, eventRepository, subscriptionRepository,
            deliveryRepository, clientEventRepository, webPushClient, preferenceService,
            lineEventObservationService, savedCommuteObservationService, formatter, receiptTokenService,
            ingestionFreshness, regionalIngestionFreshness, alertHistoryRepository, pushProperties,
            Clock.systemUTC(), lifecycleService
        );
    }

    PushNotificationDispatchService(
        SavedCommuteRepository savedCommuteRepository,
        PushCandidateResolver candidateResolver,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationClientEventRepository clientEventRepository,
        WebPushClient webPushClient,
        PushNotificationPreferenceService preferenceService,
        PushLineEventObservationService lineEventObservationService,
        PushSavedCommuteEventObservationService savedCommuteObservationService,
        PushNotificationFormatter formatter,
        PushReceiptTokenService receiptTokenService,
        IngestionFreshness ingestionFreshness,
        RegionalIngestionFreshness regionalIngestionFreshness,
        AlertHistoryRepository alertHistoryRepository,
        PushProperties pushProperties,
        Clock clock,
        PushSubscriptionLifecycleService lifecycleService
    ) {
        this.savedCommuteRepository = Objects.requireNonNull(savedCommuteRepository, "savedCommuteRepository");
        this.candidateResolver = Objects.requireNonNull(candidateResolver, "candidateResolver");
        this.eventRepository = Objects.requireNonNull(eventRepository, "eventRepository");
        this.subscriptionRepository = Objects.requireNonNull(subscriptionRepository, "subscriptionRepository");
        this.deliveryRepository = Objects.requireNonNull(deliveryRepository, "deliveryRepository");
        this.clientEventRepository = Objects.requireNonNull(clientEventRepository, "clientEventRepository");
        this.webPushClient = Objects.requireNonNull(webPushClient, "webPushClient");
        this.preferenceService = Objects.requireNonNull(preferenceService, "preferenceService");
        this.lineEventObservationService = Objects.requireNonNull(lineEventObservationService, "lineEventObservationService");
        this.savedCommuteObservationService = Objects.requireNonNull(savedCommuteObservationService, "savedCommuteObservationService");
        this.formatter = Objects.requireNonNull(formatter, "formatter");
        this.receiptTokenService = Objects.requireNonNull(receiptTokenService, "receiptTokenService");
        this.ingestionFreshness = Objects.requireNonNull(ingestionFreshness, "ingestionFreshness");
        this.regionalIngestionFreshness = Objects.requireNonNull(regionalIngestionFreshness, "regionalIngestionFreshness");
        this.alertHistoryRepository = Objects.requireNonNull(alertHistoryRepository, "alertHistoryRepository");
        this.pushProperties = Objects.requireNonNull(pushProperties, "pushProperties");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.lifecycleService = Objects.requireNonNull(lifecycleService, "lifecycleService");
    }

    record FreshnessScope(boolean ttcFresh, boolean regionalFresh) {
        boolean freshForLine(String lineId) {
            if (lineId != null && lineId.startsWith("regional-")) {
                return regionalFresh;
            }
            return ttcFresh;
        }
    }

    public PushEvaluationResult evaluateSavedCommuteNotifications() {
        int accountsEvaluated = 0;
        int accountsFailed = 0;
        String lastError = null;
        FreshnessScope freshnessScope = new FreshnessScope(
            ingestionFreshness.isDashboardFresh(),
            regionalIngestionFreshness.isFresh()
        );
        for (String accountId : subscriptionRepository.findEnabledAccountIds()) {
            accountsEvaluated++;
            try {
                AccountEvaluationResult accountResult = evaluateAccount(accountId, freshnessScope);
                if (accountResult.candidatesFailed() > 0) {
                    accountsFailed++;
                    lastError = accountResult.lastError();
                }
            } catch (RuntimeException exception) {
                accountsFailed++;
                lastError = exception.getMessage();
                log.error("Push notification evaluation failed for account {}", accountId, exception);
            }
        }
        return new PushEvaluationResult(accountsEvaluated, accountsFailed, lastError);
    }

    public record PushEvaluationResult(int accountsEvaluated, int accountsFailed, String lastError) {}

    record AccountEvaluationResult(int candidatesFailed, String lastError) {}

    AccountEvaluationResult evaluateAccount(String accountId) {
        return evaluateAccount(
            accountId,
            new FreshnessScope(
                ingestionFreshness.isDashboardFresh(),
                regionalIngestionFreshness.isFresh()
            )
        );
    }

    AccountEvaluationResult evaluateAccount(String accountId, FreshnessScope freshnessScope) {
            PushNotificationPreferenceEntity preferences = preferenceService.preferenceEntityForAccountId(accountId);
            
            List<SavedCommuteEntity> commutes = savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc(accountId);
            java.util.Map<String, SavedCommuteEntity> commutesById = commutes.stream()
                .collect(java.util.stream.Collectors.toMap(SavedCommuteEntity::getId, commute -> commute));
            List<PushNotificationCandidate> savedCommuteCandidates = commutes.stream()
                .flatMap(commute -> candidateResolver.resolveCommuteCandidates(commute, preferences).stream())
                .toList();

            List<String> subscribedLineIds = preferenceService.subscribedLineIds(accountId);
            List<PushNotificationCandidate> lineCandidates = candidateResolver.resolveLineCandidates(
                accountId, subscribedLineIds, preferences
            );
            Set<String> subscribedLineIdSet = new java.util.HashSet<>(subscribedLineIds);

            List<PushNotificationCandidate> allCandidates = new java.util.ArrayList<>();
            allCandidates.addAll(savedCommuteCandidates);
            allCandidates.addAll(lineCandidates);

            List<PushNotificationCandidate> allowedCandidates = allCandidates.stream()
                .filter(candidate -> preferenceService.allows(preferences, candidate))
                .toList();

            List<String> savedCurrentCategories = List.of(
                "saved-commute-current", "saved-commute-impact", "saved-commute-trip-change"
            );
            List<PushNotificationCandidate> savedCurrentCandidates = savedCommuteCandidates.stream()
                .filter(candidate -> savedCurrentCategories.contains(candidate.category()))
                .toList();
            Set<String> savedCurrentNotificationKeys = new java.util.HashSet<>();
            Set<String> savedCurrentSourceIncidentKeys = new java.util.HashSet<>();
            for (PushNotificationCandidate candidate : savedCurrentCandidates) {
                savedCurrentNotificationKeys.add(candidate.notificationKey());
                savedCurrentSourceIncidentKeys.add(candidate.sourceIncidentKey());
            }

            List<PushNotificationCandidate> sendableCandidates = new java.util.ArrayList<>();
            Set<String> currentLineNotificationKeys = new java.util.HashSet<>();
            Set<String> currentLineSourceIncidentKeys = new java.util.HashSet<>();
            List<PushNotificationCandidate> currentLineCandidates = new java.util.ArrayList<>();
            int candidatesFailed = 0;
            String lastCandidateError = null;

            for (PushNotificationCandidate candidate : allowedCandidates) {
                try {
                    if ("line-current".equals(candidate.category()) || "line-trip-change".equals(candidate.category())) {
                        currentLineNotificationKeys.add(candidate.notificationKey());
                        currentLineSourceIncidentKeys.add(candidate.sourceIncidentKey());
                        currentLineCandidates.add(candidate);
                        Instant observedAt = clock.instant();
                        PushLineEventObservationService.ObservationDecision decision =
                            lineEventObservationService.observe(candidate, preferences, observedAt);
                        if (decision.shouldSendActive()
                            && candidate.deliveryAllowed()
                            && lineCurrentDeliveryIsTimely(candidate, observedAt)) {
                            sendableCandidates.add(candidate);
                        }
                    } else if (savedCurrentCategories.contains(candidate.category())) {
                        PushSavedCommuteEventObservationService.ObservationDecision decision =
                            savedCommuteObservationService.observe(
                                candidate,
                                commutesById.get(candidate.commuteId()),
                                preferences,
                                clock.instant()
                            );
                        if (decision.shouldSendActive() && candidate.deliveryAllowed()) {
                            sendableCandidates.add(candidate);
                        }
                    } else if (candidate.deliveryAllowed()) {
                        sendableCandidates.add(candidate);
                    }
                } catch (RuntimeException exception) {
                    candidatesFailed++;
                    lastCandidateError = "Candidate " + candidate.dedupeKey() + ": " + exceptionMessage(exception);
                    log.warn("Failed to evaluate candidate {} for account {}", candidate.dedupeKey(), accountId, exception);
                }
            }

            for (PushNotificationCandidate candidate : sendableCandidates) {
                sendIfNew(candidate);
            }

            sendClearedNotifications(
                accountId,
                preferences,
                commutesById,
                savedCurrentNotificationKeys,
                savedCurrentSourceIncidentKeys,
                savedCommuteCandidates,
                freshnessScope
            );
            clearStaleSavedCommuteObservations(
                accountId,
                savedCurrentNotificationKeys,
                savedCurrentSourceIncidentKeys,
                savedCommuteCandidates,
                freshnessScope
            );
            sendClearedLineObservationNotifications(
                accountId,
                preferences,
                subscribedLineIdSet,
                currentLineNotificationKeys,
                currentLineSourceIncidentKeys,
                lineCandidates,
                freshnessScope
            );
            retryRecentClearedLifecycleNotifications(
                accountId,
                preferences,
                commutesById,
                subscribedLineIdSet,
                clock.instant()
            );
            return new AccountEvaluationResult(candidatesFailed, lastCandidateError);
    }

    private String exceptionMessage(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }


    private boolean lineCurrentDeliveryIsTimely(
        PushNotificationCandidate candidate,
        Instant now
    ) {
        if (!"reduced-speed-zone".equals(candidate.eventType())) {
            return true;
        }
        if (candidate.sourceEventAt() == null) {
            return false;
        }
        Duration initialDeliveryWindow = pushProperties.displayTtlForState(ACTIVE_STATE);
        return candidate.sourceEventAt().isAfter(now.minus(initialDeliveryWindow));
    }

    private void retryRecentClearedLifecycleNotifications(
        String accountId,
        PushNotificationPreferenceEntity preferences,
        java.util.Map<String, SavedCommuteEntity> commutesById,
        Set<String> subscribedLineIds,
        Instant now
    ) {
        List<PushNotificationEventEntity> clearedEvents =
            eventRepository.findByAccountIdAndCategoryInAndNotificationStateAndCreatedAtAfterOrderByCreatedAtDesc(
                accountId,
                CLEARED_RETRY_CATEGORIES,
                CLEARED_STATE,
                now.minus(CLEARED_DELIVERY_RETRY_WINDOW),
                PageRequest.of(0, CLEARED_DELIVERY_RETRY_LIMIT)
            );
        for (PushNotificationEventEntity clearedEvent : clearedEvents) {
            if (freshForLine(clearedEvent.getLineId())
                && clearedRetryAllowed(clearedEvent, preferences, commutesById, subscribedLineIds, now)) {
                retryEventToIncompleteSubscriptions(clearedEvent, now);
            }
        }
    }

    private boolean clearedRetryAllowed(
        PushNotificationEventEntity event,
        PushNotificationPreferenceEntity preferences,
        java.util.Map<String, SavedCommuteEntity> commutesById,
        Set<String> subscribedLineIds,
        Instant now
    ) {
        if (!event.isDeliveryAllowed()) {
            return false;
        }
        if (regionalLine(event.getLineId())) return false;
        if (event.getCommuteId() != null) {
            return savedCommuteClearanceAllowed(
                preferences,
                commutesById.get(event.getCommuteId()),
                event.getLegId(),
                now
            );
        }
        if (event.getLineId() != null) {
            return preferences.isLineRestoredEnabled() && subscribedLineIds.contains(event.getLineId());
        }
        return false;
    }

    private void sendClearedNotifications(
        String accountId,
        PushNotificationPreferenceEntity preferences,
        java.util.Map<String, SavedCommuteEntity> commutesById,
        Set<String> currentNotificationKeys,
        Set<String> currentSourceIncidentKeys,
        List<PushNotificationCandidate> allSavedCommuteCandidates,
        FreshnessScope freshnessScope
    ) {
        Instant now = clock.instant();
        List<String> currentCategories = List.of("saved-commute-current", "saved-commute-impact");
        
        List<PushNotificationEventEntity> activeEvents = eventRepository.findByAccountIdAndCategoryInAndNotificationState(
            accountId,
            currentCategories,
            ACTIVE_STATE
        );

        for (PushNotificationEventEntity activeEvent : activeEvents) {
            if (!freshForLine(activeEvent.getLineId(), freshnessScope)) {
                continue;
            }
            if (savedCommuteCurrentCategory(activeEvent.getCategory()) && activeEvent.getCommuteId() == null) {
                continue;
            }
            if (currentNotificationKeys.contains(activeEvent.getNotificationKey())) {
                continue;
            }
            if (containsNonBlank(currentSourceIncidentKeys, activeEvent.getSourceIncidentKey())) {
                continue;
            }
            if (hasReclassifiedCandidate(activeEvent, allSavedCommuteCandidates)) {
                activeEvent.markReclassified();
                eventRepository.save(activeEvent);
                continue;
            }
            if (hasEquivalentCurrentCandidate(activeEvent, allSavedCommuteCandidates)) {
                continue;
            }
            // A regional alert window ending is not evidence that service was restored.
            if (regionalLine(activeEvent.getLineId())) continue;
            String clearedDedupeKey = activeEvent.getDedupeKey() + "|cleared";
            if (eventRepository.existsByDedupeKey(clearedDedupeKey)
                || eventRepository.existsByNotificationKeyAndNotificationState(activeEvent.getNotificationKey(), CLEARED_STATE)) {
                continue;
            }

            boolean deliveryAllowed = false;
            if (activeEvent.getCommuteId() != null) {
                deliveryAllowed = savedCommuteClearanceAllowed(
                    preferences,
                    commutesById.get(activeEvent.getCommuteId()),
                    activeEvent.getLegId(),
                    now
                );
            } else if (activeEvent.getLineId() != null) {
                deliveryAllowed = preferences.isLineRestoredEnabled();
            }

            PushNotificationEventEntity clearedEvent = eventRepository.save(PushNotificationEventEntity.cleared(
                nextId("push_event"),
                activeEvent,
                sourceClearedAt(activeEvent.getSourceIncidentKey(), activeEvent.getNotificationKey(), now),
                now,
                formatter,
                deliveryAllowed
            ));
            if (deliveryAllowed) {
                sendEventToSubscriptions(clearedEvent, now);
            }
        }
    }

    private boolean savedCommuteClearanceAllowed(
        PushNotificationPreferenceEntity preferences,
        SavedCommuteEntity commute,
        String legId,
        Instant now
    ) {
        if (!preferences.isSavedCommuteRestoredEnabled() || commute == null) {
            return false;
        }
        if (!commute.isNotificationEnabled() || !commute.isNotificationRestoredEnabled()) {
            return false;
        }
        if ("return".equals(legId)) {
            if (!commute.isWatchReturnTrip() || !commute.isNotificationReturnEnabled()) {
                return false;
            }
        } else if (!commute.isNotificationOutboundEnabled()) {
            return false;
        }
        return SavedCommuteNotificationSchedule.matches(commute, legId, now);
    }

    private void clearStaleSavedCommuteObservations(
        String accountId,
        Set<String> currentNotificationKeys,
        Set<String> currentSourceIncidentKeys,
        List<PushNotificationCandidate> allSavedCommuteCandidates,
        FreshnessScope freshnessScope
    ) {
        Instant now = clock.instant();
        for (PushSavedCommuteEventObservationEntity observation : savedCommuteObservationService.activeObservations(accountId)) {
            if (!freshForLine(observation.getLineId(), freshnessScope)) {
                continue;
            }
            if (currentNotificationKeys.contains(observation.getNotificationKey())) {
                continue;
            }
            if (containsNonBlank(currentSourceIncidentKeys, observation.getSourceIncidentKey())) {
                continue;
            }
            if (hasCanonicalCandidate(observation.getSourceIncidentKey(), allSavedCommuteCandidates)) {
                savedCommuteObservationService.markCleared(observation, now);
                continue;
            }
            savedCommuteObservationService.markCleared(observation, now);
        }
    }

    private void sendClearedLineObservationNotifications(
        String accountId,
        PushNotificationPreferenceEntity preferences,
        Set<String> subscribedLineIds,
        Set<String> currentLineNotificationKeys,
        Set<String> currentLineSourceIncidentKeys,
        List<PushNotificationCandidate> allLineCandidates,
        FreshnessScope freshnessScope
    ) {
        Instant now = clock.instant();

        for (PushLineEventObservationEntity observation : lineEventObservationService.activeObservations(accountId)) {
            if (!freshForLine(observation.getLineId(), freshnessScope)) {
                continue;
            }
            if (regionalLine(observation.getLineId())) {
                lineEventObservationService.markCleared(observation, now);
                continue;
            }
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
            if ("trip-cancellation".equals(observation.getEventType())) {
                lineEventObservationService.markCleared(observation, now);
                continue;
            }
            if (hasCanonicalCandidate(observation.getSourceIncidentKey(), allLineCandidates)
                || hasEquivalentLineCandidate(observation, allLineCandidates)) {
                lineEventObservationService.markCleared(observation, now);
                continue;
            }

            PushNotificationEventEntity candidateClearedEvent = PushNotificationEventEntity.clearedFromObservation(
                nextId("push_event"),
                observation,
                sourceClearedAt(observation.getSourceIncidentKey(), observation.getNotificationKey(), now),
                now,
                formatter
            );
            if (eventRepository.existsByDedupeKey(candidateClearedEvent.getDedupeKey())) {
                lineEventObservationService.markCleared(observation, now);
                continue;
            }

            if (!preferences.isLineRestoredEnabled()) {
                lineEventObservationService.markCleared(observation, now);
                continue;
            }

            PushNotificationEventEntity clearedEvent = eventRepository.save(candidateClearedEvent);
            sendEventToSubscriptions(clearedEvent, now);
            lineEventObservationService.markCleared(observation, now);
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
        return switch (observation.getEventType()) {
            case "suspension" -> preferences.isLineSuspensionEnabled();
            case "delay" -> preferences.isLineDelayEnabled();
            case "trip-cancellation" -> preferences.isLineTripCancellationEnabled();
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

    private boolean hasReclassifiedCandidate(
        PushNotificationEventEntity activeEvent,
        List<PushNotificationCandidate> candidates
    ) {
        return candidates.stream().anyMatch(candidate ->
            !sameCurrentCategoryFamily(activeEvent.getCategory(), candidate.category())
                && same(activeEvent.getLineId(), candidate.lineId())
                && sameScope(activeEvent, candidate)
                && sameCanonicalIncident(activeEvent.getSourceIncidentKey(), candidate.canonicalIncidentKey())
        );
    }

    private boolean hasCanonicalCandidate(
        String sourceIncidentKey,
        List<PushNotificationCandidate> candidates
    ) {
        String canonical = canonicalIncidentKey(sourceIncidentKey);
        return !canonical.isBlank() && candidates.stream()
            .anyMatch(candidate -> canonical.equals(normalize(candidate.canonicalIncidentKey())));
    }

    private boolean sameCanonicalIncident(String sourceIncidentKey, String candidateCanonicalKey) {
        String canonical = canonicalIncidentKey(sourceIncidentKey);
        return !canonical.isBlank() && canonical.equals(normalize(candidateCanonicalKey));
    }

    private String canonicalIncidentKey(String sourceIncidentKey) {
        String normalized = normalize(sourceIncidentKey);
        int separator = normalized.indexOf('|');
        return separator < 0 ? normalized : normalized.substring(separator + 1);
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
        if (savedCommuteCurrentCategory(normalized)) {
            return "saved-commute-current";
        }
        return normalized;
    }

    private boolean savedCommuteCurrentCategory(String category) {
        String normalized = normalize(category);
        return "saved-commute-current".equals(normalized) || "saved-commute-impact".equals(normalized);
    }

    private boolean freshForLine(String lineId, FreshnessScope freshnessScope) {
        if (freshnessScope != null) {
            return freshnessScope.freshForLine(lineId);
        }
        return freshForLine(lineId);
    }

    private boolean freshForLine(String lineId) {
        if (regionalLine(lineId)) {
            return regionalIngestionFreshness.isFresh();
        }
        return ingestionFreshness.isDashboardFresh();
    }

    private boolean regionalLine(String lineId) {
        return PushCandidateResolver.isRegionalLine(lineId);
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

    private Instant sourceClearedAt(String sourceIncidentKey, String notificationKey, Instant fallback) {
        for (String possibleAlertId : possibleAlertIds(sourceIncidentKey, notificationKey)) {
            Optional<Instant> clearedAt = alertHistoryRepository.findLatestClearedSnapshotTime(possibleAlertId)
                .map(java.time.OffsetDateTime::toInstant);
            if (clearedAt.isPresent()) {
                return clearedAt.orElseThrow();
            }
        }
        return fallback;
    }

    private Instant sourceOpenedAt(String sourceIncidentKey, String notificationKey, Instant fallback) {
        for (String possibleAlertId : possibleAlertIds(sourceIncidentKey, notificationKey)) {
            Optional<Instant> openedAt = alertHistoryRepository.findLatestOpenedSnapshotTime(possibleAlertId)
                .map(java.time.OffsetDateTime::toInstant);
            if (openedAt.isPresent()) {
                return openedAt.orElseThrow();
            }
        }
        return fallback;
    }

    private List<String> possibleAlertIds(String sourceIncidentKey, String notificationKey) {
        List<String> values = new java.util.ArrayList<>();
        appendLastKeyPart(values, sourceIncidentKey);
        appendLastKeyPart(values, notificationKey);
        return values.stream()
            .filter(value -> !value.isBlank())
            .distinct()
            .toList();
    }

    private void appendLastKeyPart(List<String> values, String key) {
        String normalized = key == null ? "" : key.trim();
        if (normalized.isBlank()) {
            return;
        }
        String[] parts = normalized.split("\\|", -1);
        if (parts.length == 0) {
            return;
        }
        values.add(parts[parts.length - 1].trim());
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
        Optional<PushNotificationEventEntity> previousPlannedEvent = previousPlannedEvent(candidate);
        if (previousPlannedEvent.isPresent() && !sourceUpdatedAfter(candidate, previousPlannedEvent.orElseThrow())) {
            return;
        }
        if (previousPlannedEvent.isEmpty() && hasEquivalentPlannedEventWithLegacyIdentity(candidate)) {
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
            sourceEventAtForDelivery(candidate),
            formatter,
            notificationTriggeredAt(candidate, now),
            now
        ));
        sendEventToSubscriptions(event, subscriptions, now);
    }

    private Optional<PushNotificationEventEntity> previousPlannedEvent(PushNotificationCandidate candidate) {
        if (!"planned-closure".equals(candidate.eventType())) {
            return Optional.empty();
        }
        return eventRepository.findFirstByAccountIdAndNotificationKeyAndReminderBucketOrderByCreatedAtDesc(
            candidate.accountId(), candidate.notificationKey(), candidate.reminderBucket()
        );
    }

    private boolean hasEquivalentPlannedEventWithLegacyIdentity(PushNotificationCandidate candidate) {
        if (!"planned-closure".equals(candidate.eventType()) || candidate.sourceEventAt() == null) {
            return false;
        }
        return eventRepository
            .findByAccountIdAndCategoryAndLineIdAndEventTypeAndReminderBucketAndSourceEventAtOrderByCreatedAtDesc(
                candidate.accountId(),
                candidate.category(),
                candidate.lineId(),
                candidate.eventType(),
                candidate.reminderBucket(),
                candidate.sourceEventAt()
            )
            .stream()
            .filter(event -> same(event.getCommuteId(), candidate.commuteId()))
            .filter(event -> same(event.getLegId(), candidate.legId()))
            .anyMatch(event -> equivalentPlannedAnnouncement(event, candidate));
    }

    private boolean equivalentPlannedAnnouncement(
        PushNotificationEventEntity previous,
        PushNotificationCandidate candidate
    ) {
        return same(previous.getTitle(), candidate.title())
            && same(previous.getBody(), candidate.body())
            && same(previous.getNotificationSubject(), candidate.notificationSubject())
            && same(previous.getEventLocation(), candidate.eventLocation())
            && same(previous.getDisplayDirection(), candidate.displayDirection())
            && same(previous.getScopeLabel(), candidate.scopeLabel());
    }

    private boolean sourceUpdatedAfter(
        PushNotificationCandidate candidate,
        PushNotificationEventEntity previousEvent
    ) {
        return candidate.sourceUpdatedAt() != null
            && previousEvent.getCreatedAt() != null
            && candidate.sourceUpdatedAt().isAfter(previousEvent.getCreatedAt());
    }

    private Instant sourceEventAtForDelivery(PushNotificationCandidate candidate) {
        if ("planned-closure".equals(candidate.eventType())) {
            return candidate.sourceEventAt();
        }
        return sourceOpenedAt(candidate.sourceIncidentKey(), candidate.notificationKey(), candidate.sourceEventAt());
    }

    private Instant notificationTriggeredAt(PushNotificationCandidate candidate, Instant now) {
        if (!"planned-closure".equals(candidate.eventType())) {
            return now;
        }
        Instant triggeredAt = switch (candidate.reminderBucket()) {
            case "closure-24h" -> laterOf(
                candidate.sourceUpdatedAt(),
                candidate.sourceEventAt() == null
                    ? null
                    : candidate.sourceEventAt().minus(Duration.ofHours(24))
            );
            case "closure-morning" -> laterOf(
                candidate.sourceUpdatedAt(),
                candidate.sourceEventAt() == null
                    ? null
                    : candidate.sourceEventAt()
                        .atZone(TORONTO_ZONE)
                        .toLocalDate()
                        .atTime(PLANNED_CLOSURE_MORNING)
                        .atZone(TORONTO_ZONE)
                        .toInstant()
            );
            default -> candidate.sourceUpdatedAt();
        };
        if (triggeredAt == null || triggeredAt.isAfter(now)) {
            return now;
        }
        return triggeredAt;
    }

    private Instant laterOf(Instant first, Instant second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.isAfter(second) ? first : second;
    }

    private void retryEventToIncompleteSubscriptions(PushNotificationEventEntity event, Instant now) {
        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdAndEnabledTrue(event.getAccountId());
        for (PushSubscriptionEntity subscription : subscriptions) {
            if (!subscriptionEnabledForEvent(subscription, event)) {
                continue;
            }
            Optional<PushNotificationDeliveryEntity> existingDelivery =
                deliveryRepository.findByEventIdAndSubscriptionId(event.getId(), subscription.getId());
            if (existingDelivery.isPresent()) {
                PushNotificationDeliveryEntity delivery = existingDelivery.get();
                boolean shouldRetry = "accepted".equals(delivery.getStatus())
                    ? shouldRetryAcceptedDelivery(event, delivery, now)
                    : delivery.shouldRetryDelivery(now, FAILED_DELIVERY_RETRY_DELAY);
                if (!shouldRetry) {
                    continue;
                }
            }

            String deliveryId = existingDelivery
                .map(PushNotificationDeliveryEntity::getId)
                .orElseGet(() -> nextId("push_delivery"));
            PushDeliveryResult result = webPushClient.send(
                subscription,
                topicFor(PushNotificationDisplayTags.forEvent(event)),
                WebPushPayload.fromDelivery(event, deliveryId, subscription, receiptTokenService, now, pushProperties)
            );
            if (result.invalidSubscription()) {
                disableHardInvalidSubscription(subscription, result, now);
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

    private boolean shouldRetryAcceptedDelivery(
        PushNotificationEventEntity event,
        PushNotificationDeliveryEntity delivery,
        Instant now
    ) {
        if (!ACTIVE_STATE.equals(event.getNotificationState()) || delivery.getCreatedAt() == null) {
            return false;
        }
        if (!PushNotificationAcceptedRetryPolicy.shouldRetry(
            delivery.getAttemptCount(),
            delivery.getCreatedAt(),
            event.getCreatedAt(),
            delivery.getDisplayedAt() != null,
            List.of(),
            now
        )) {
            return false;
        }
        List<String> currentAttemptStages = clientEventRepository
            .findCurrentAttemptEvents(delivery.getId(), delivery.getCreatedAt())
            .stream()
            .map(PushNotificationClientEventEntity::getStage)
            .toList();
        return PushNotificationAcceptedRetryPolicy.shouldRetry(
            delivery.getAttemptCount(),
            delivery.getCreatedAt(),
            event.getCreatedAt(),
            delivery.getDisplayedAt() != null,
            currentAttemptStages,
            now
        );
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
                WebPushPayload.fromDelivery(event, deliveryId, subscription, receiptTokenService, now, pushProperties)
            );
            if (result.accepted()) {
                accepted = true;
            }
            if (result.invalidSubscription()) {
                disableHardInvalidSubscription(subscription, result, now);
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

    private void disableHardInvalidSubscription(
        PushSubscriptionEntity subscription,
        PushDeliveryResult result,
        Instant now
    ) {
        String reason = "push-service-" + (result.httpStatus() == null ? "invalid" : result.httpStatus());
        subscription.disable(now, reason);
        subscriptionRepository.save(subscription);
        lifecycleService.record(subscription, "disabled", reason, now);
    }

    private boolean subscriptionEnabledForEvent(PushSubscriptionEntity subscription, PushNotificationEventEntity event) {
        Instant eventTriggeredAt = event.deliveryEligibilityAt();
        if (eventTriggeredAt == null) {
            return false;
        }
        Instant enabledAt = subscription.getEnabledAt();
        if (enabledAt == null) {
            return true;
        }
        return !eventTriggeredAt.isBefore(enabledAt);
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
