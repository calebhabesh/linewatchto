package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationService {
    private static final List<String> RETAINED_CLEARED_CATEGORIES = List.of(
        "saved-commute-current",
        "saved-commute-impact",
        "line-current"
    );

    private final PushProperties properties;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final SavedCommuteRepository savedCommuteRepository;
    private final SavedCommutePushPlanner planner;
    private final PushNotificationPreferenceService preferenceService;
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner;
    private final PushNotificationClientEventRepository clientEventRepository;
    private final IngestionFreshness ingestionFreshness;
    private final Clock clock;

    @Autowired
    public PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationClientEventRepository clientEventRepository,
        IngestionFreshness ingestionFreshness
    ) {
        this(properties, subscriptionRepository, deliveryRepository, savedCommuteRepository, planner, preferenceService, lineSubscriptionPushPlanner, clientEventRepository, ingestionFreshness, Clock.systemUTC());
    }

    PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationClientEventRepository clientEventRepository,
        IngestionFreshness ingestionFreshness,
        Clock clock
    ) {
        this.properties = properties;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.savedCommuteRepository = savedCommuteRepository;
        this.planner = planner;
        this.preferenceService = preferenceService;
        this.lineSubscriptionPushPlanner = lineSubscriptionPushPlanner;
        this.clientEventRepository = clientEventRepository;
        this.ingestionFreshness = ingestionFreshness;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PushResponses.PushConfigResponse config(AccountEntity account) {
        long enabledDeviceCount = subscriptionRepository.countByAccountIdAndEnabledTrue(account.getId());
        int safeDeviceCount = enabledDeviceCount > Integer.MAX_VALUE
            ? Integer.MAX_VALUE
            : (int) enabledDeviceCount;
        return new PushResponses.PushConfigResponse(
            properties.webPushConfigured(),
            properties.getVapidPublicKey() == null ? "" : properties.getVapidPublicKey().trim(),
            preferenceService.preferencesFor(account),
            new PushResponses.PushDeviceSummaryResponse(safeDeviceCount, safeDeviceCount > 0)
        );
    }

    @Transactional
    public PushResponses.PushSubscriptionResponse saveSubscription(
        AccountEntity account,
        PushRequests.SaveSubscriptionRequest request
    ) {
        String endpoint = required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required.");
        PushRequests.PushSubscriptionKeys keys = request.keys();
        if (keys == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "missing_push_keys", "Push subscription keys are required.");
        }
        String p256dh = required(keys.p256dh(), "missing_push_keys", "Push subscription p256dh key is required.");
        String auth = required(keys.auth(), "missing_push_keys", "Push subscription auth key is required.");
        String endpointHash = hashEndpoint(endpoint);
        Instant now = clock.instant();

        PushSubscriptionEntity subscription = subscriptionRepository
            .findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .map(existing -> {
                existing.refresh(p256dh, auth, normalizeUserAgent(request.userAgent()), now);
                return existing;
            })
            .orElseGet(() -> PushSubscriptionEntity.create(
                nextId("push_subscription"),
                account,
                endpoint,
                endpointHash,
                p256dh,
                auth,
                normalizeUserAgent(request.userAgent()),
                now
            ));

        return toResponse(subscriptionRepository.save(subscription));
    }

    @Transactional
    public PushResponses.PushPreferencesResponse updatePreferences(
        AccountEntity account,
        PushRequests.UpdatePushPreferencesRequest request
    ) {
        return preferenceService.updatePreferences(account, request);
    }

    @Transactional
    public void disableSubscription(AccountEntity account, PushRequests.SubscriptionEndpointRequest request) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .ifPresent(subscription -> subscription.disable(clock.instant()));
    }

    @Transactional
    public void markPayloadNotificationDisplayed(
        AccountEntity account,
        PushRequests.DisplayedNotificationRequest request
    ) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        DisplayTag displayTag = parseDisplayTag(required(request.tag(), "missing_notification_tag", "Push notification tag is required."));
        deliveryRepository.findPendingDeliveryForNotification(
            account.getId(),
            endpointHash,
            displayTag.notificationKey(),
            displayTag.notificationState(),
            PageRequest.of(0, 1)
        ).stream().findFirst().ifPresent(delivery -> {
            Instant now = clock.instant();
            delivery.markDisplayed(now);
            saveClientEvent(
                account.getId(),
                delivery.getSubscription(),
                delivery,
                endpointHash,
                displayTag,
                "displayed_acknowledged",
                null,
                now
            );
        });
    }

    @Transactional
    public void recordClientEvent(AccountEntity account, PushRequests.ClientEventRequest request) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        DisplayTag displayTag = parseDisplayTag(required(request.tag(), "missing_notification_tag", "Push notification tag is required."));
        String stage = normalizeClientEventStage(required(request.stage(), "missing_stage", "Push client event stage is required."));
        Instant now = clock.instant();
        PushSubscriptionEntity subscription = subscriptionRepository
            .findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .orElse(null);
        PushNotificationDeliveryEntity delivery = deliveryRepository.findLatestDeliveryForNotification(
            account.getId(),
            endpointHash,
            displayTag.notificationKey(),
            displayTag.notificationState(),
            PageRequest.of(0, 1)
        ).stream().findFirst().orElse(null);

        saveClientEvent(
            account.getId(),
            delivery == null ? subscription : delivery.getSubscription(),
            delivery,
            endpointHash,
            displayTag,
            stage,
            normalizeClientEventMessage(request.message()),
            now
        );
    }

    @Transactional(readOnly = true)
    public PushResponses.PushDeliveryDiagnosticsResponse deliveryDiagnostics(AccountEntity account) {
        List<PushNotificationDeliveryEntity> deliveries = deliveryRepository.findRecentDeliveriesForAccount(
            account.getId(),
            PageRequest.of(0, 50)
        );
        if (deliveries.isEmpty()) {
            return new PushResponses.PushDeliveryDiagnosticsResponse(List.of());
        }

        List<String> deliveryIds = deliveries.stream()
            .map(PushNotificationDeliveryEntity::getId)
            .toList();
        Map<String, List<PushNotificationClientEventEntity>> eventsByDeliveryId = clientEventRepository
            .findByDeliveryIds(deliveryIds)
            .stream()
            .filter(clientEvent -> clientEvent.getDelivery() != null)
            .collect(Collectors.groupingBy(clientEvent -> clientEvent.getDelivery().getId()));

        List<PushResponses.PushDeliveryDiagnosticResponse> responseDeliveries = deliveries.stream()
            .map(delivery -> toDiagnosticResponse(
                delivery,
                eventsByDeliveryId.getOrDefault(delivery.getId(), List.of())
            ))
            .toList();

        Map<String, PushResponses.PushDeliveryDiagnosticResponse> responsesByDeliveryId = responseDeliveries.stream()
            .collect(Collectors.toMap(PushResponses.PushDeliveryDiagnosticResponse::id, response -> response));
        Map<String, List<PushNotificationDeliveryEntity>> deliveriesByEventId = deliveries.stream()
            .collect(Collectors.groupingBy(
                delivery -> delivery.getEvent().getId(),
                LinkedHashMap::new,
                Collectors.toList()
            ));
        List<PushResponses.PushNotificationDiagnosticGroupResponse> notificationGroups = deliveriesByEventId.values()
            .stream()
            .map(groupDeliveries -> toDiagnosticGroup(groupDeliveries, responsesByDeliveryId))
            .toList();

        return new PushResponses.PushDeliveryDiagnosticsResponse(notificationGroups, responseDeliveries);
    }

    @Transactional
    public PushResponses.PendingPushNotificationResponse latestPendingNotification(
        AccountEntity account,
        PushRequests.SubscriptionEndpointRequest request
    ) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        List<PushNotificationDeliveryEntity> deliveries = deliveryRepository.findPendingBatchForSubscription(
            account.getId(),
            endpointHash,
            PageRequest.of(0, 5)
        );
        if (deliveries.isEmpty()) {
            return new PushResponses.PendingPushNotificationResponse(null, List.of());
        }

        List<PushResponses.PendingPushNotification> notifications = deliveries.stream()
            .map(delivery -> {
                PushNotificationEventEntity event = delivery.getEvent();
                return new PushResponses.PendingPushNotification(
                    event.getTitle(),
                    event.getBody(),
                    event.getUrl(),
                    tagFor(event),
                    event.getNotificationState(),
                    event.getCreatedAt().toString()
                );
            })
            .toList();

        return new PushResponses.PendingPushNotificationResponse(
            notifications.get(notifications.size() - 1),
            notifications
        );
    }

    @Transactional(readOnly = true)
    public PushResponses.ActivePushNotificationsResponse activeNotifications(
        AccountEntity account,
        PushRequests.SubscriptionEndpointRequest request
    ) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        return subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .filter(PushSubscriptionEntity::isEnabled)
            .map(subscription -> {
                if (!ingestionFreshness.isDashboardFresh()) {
                    return new PushResponses.ActivePushNotificationsResponse(List.of(), List.of(), false);
                }

                PushNotificationPreferenceEntity preferences = preferenceService.preferenceEntityForAccountId(account.getId());
                
                List<PushNotificationCandidate> commuteCandidates = savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc(account.getId())
                    .stream()
                    .flatMap(commute -> planner.candidatesFor(commute).stream())
                    .toList();
                
                List<String> subscribedLineIds = preferenceService.subscribedLineIds(account.getId());
                List<PushNotificationCandidate> lineCandidates = lineSubscriptionPushPlanner.candidatesFor(account.getId(), subscribedLineIds);
                
                List<PushNotificationCandidate> allCandidates = new java.util.ArrayList<>();
                allCandidates.addAll(commuteCandidates);
                allCandidates.addAll(lineCandidates);
                
                List<String> activeNotificationKeys = allCandidates.stream()
                    .filter(candidate -> preferenceService.allows(preferences, candidate))
                    .map(PushNotificationCandidate::notificationKey)
                    .distinct()
                    .toList();

                List<String> activeTags = activeNotificationKeys.stream()
                    .map(PushNotificationDisplayTags::active)
                    .toList();

                List<String> retainedTags = retainedNotificationTags(account.getId(), endpointHash, activeNotificationKeys);
                return new PushResponses.ActivePushNotificationsResponse(activeTags, retainedTags, true);
            })
            .orElse(new PushResponses.ActivePushNotificationsResponse(List.of(), List.of(), true));
    }

    private List<String> retainedNotificationTags(String accountId, String endpointHash, List<String> activeNotificationKeys) {
        List<String> retainedTags = new ArrayList<>();
        for (String notificationKey : activeNotificationKeys) {
            retainedTags.add(PushNotificationDisplayTags.active(notificationKey));
            retainedTags.add(notificationKey);
        }

        Duration retention = properties.getClearedNotificationRetention();
        if (retention == null || retention.isZero() || retention.isNegative()) {
            return PushNotificationDisplayTags.distinctNonBlank(retainedTags);
        }

        Instant displayedAtAfter = clock.instant().minus(retention);
        List<String> recentlyDisplayedClearedKeys = deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
            accountId,
            endpointHash,
            RETAINED_CLEARED_CATEGORIES,
            displayedAtAfter
        );
        if (recentlyDisplayedClearedKeys != null) {
            for (String notificationKey : recentlyDisplayedClearedKeys) {
                retainedTags.addAll(PushNotificationDisplayTags.retainedTagsForClearedLifecycleKey(notificationKey));
            }
        }

        return PushNotificationDisplayTags.distinctNonBlank(retainedTags);
    }

    private void saveClientEvent(
        String accountId,
        PushSubscriptionEntity subscription,
        PushNotificationDeliveryEntity delivery,
        String endpointHash,
        DisplayTag displayTag,
        String stage,
        String message,
        Instant now
    ) {
        clientEventRepository.save(PushNotificationClientEventEntity.create(
            nextId("push_client_event"),
            accountId,
            subscription,
            delivery,
            endpointHash,
            displayTag.notificationKey(),
            displayTag.notificationState(),
            stage,
            message,
            now,
            now
        ));
    }

    private PushResponses.PushDeliveryDiagnosticResponse toDiagnosticResponse(
        PushNotificationDeliveryEntity delivery,
        List<PushNotificationClientEventEntity> clientEvents
    ) {
        PushNotificationEventEntity event = delivery.getEvent();
        PushSubscriptionEntity subscription = delivery.getSubscription();
        List<PushResponses.PushClientEventResponse> eventResponses = clientEvents.stream()
            .sorted(Comparator.comparing(PushNotificationClientEventEntity::getOccurredAt))
            .map(clientEvent -> new PushResponses.PushClientEventResponse(
                clientEvent.getStage(),
                clientEvent.getMessage(),
                instantString(clientEvent.getOccurredAt())
            ))
            .toList();

        return new PushResponses.PushDeliveryDiagnosticResponse(
            delivery.getId(),
            event.getTitle(),
            PushNotificationDisplayTags.forEvent(event),
            event.getNotificationState(),
            event.getCategory(),
            event.getEventType(),
            event.getLineId(),
            lineNumberFor(event.getLineId()),
            instantString(event.getCreatedAt()),
            deviceLabel(subscription),
            subscription.getUserAgent(),
            endpointHashPrefix(subscription.getEndpointHash()),
            subscription.isEnabled(),
            delivery.getStatus(),
            delivery.getHttpStatus(),
            delivery.getMessage(),
            instantString(delivery.getCreatedAt()),
            instantString(delivery.getDisplayedAt()),
            delivery.getAttemptCount(),
            eventResponses
        );
    }

    private PushResponses.PushNotificationDiagnosticGroupResponse toDiagnosticGroup(
        List<PushNotificationDeliveryEntity> deliveries,
        Map<String, PushResponses.PushDeliveryDiagnosticResponse> responsesByDeliveryId
    ) {
        PushNotificationEventEntity event = deliveries.getFirst().getEvent();
        List<PushResponses.PushDeliveryDiagnosticResponse> attempts = deliveries.stream()
            .map(delivery -> responsesByDeliveryId.get(delivery.getId()))
            .filter(java.util.Objects::nonNull)
            .toList();

        return new PushResponses.PushNotificationDiagnosticGroupResponse(
            event.getId(),
            event.getTitle(),
            PushNotificationDisplayTags.forEvent(event),
            event.getNotificationKey(),
            event.getSourceIncidentKey(),
            event.getNotificationState(),
            event.getCategory(),
            event.getEventType(),
            event.getLineId(),
            lineNumberFor(event.getLineId()),
            instantString(event.getCreatedAt()),
            attempts
        );
    }

    private String lineNumberFor(String lineId) {
        return switch (lineId == null ? "" : lineId) {
            case "line-1" -> "1";
            case "line-2" -> "2";
            case "line-4" -> "4";
            case "line-5" -> "5";
            case "line-6" -> "6";
            default -> null;
        };
    }

    private String deviceLabel(PushSubscriptionEntity subscription) {
        String userAgent = subscription.getUserAgent();
        if (userAgent == null || userAgent.isBlank()) {
            return "Unknown device";
        }
        String normalized = userAgent.trim();
        String lower = normalized.toLowerCase(Locale.ROOT);
        if (lower.contains("android")) {
            if (lower.contains("edg")) return "Android Edge";
            if (lower.contains("firefox")) return "Android Firefox";
            if (lower.contains("chrome")) return "Android Chrome";
            return "Android";
        }
        if (lower.contains("iphone") || lower.contains("ipad")) {
            if (lower.contains("crios")) return "iOS Chrome";
            if (lower.contains("fxios")) return "iOS Firefox";
            if (lower.contains("edgios")) return "iOS Edge";
            if (lower.contains("safari")) return "iOS Safari";
            return "iOS";
        }
        if (lower.contains("chrome")) return "Chrome";
        if (lower.contains("safari")) return "Safari";
        if (lower.contains("firefox")) return "Firefox";
        if (lower.contains("edg")) return "Edge";
        return normalized;
    }

    private String endpointHashPrefix(String endpointHash) {
        if (endpointHash == null || endpointHash.isBlank()) {
            return "";
        }
        String normalized = endpointHash.trim();
        return normalized.substring(0, Math.min(12, normalized.length()));
    }

    private String instantString(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    private PushResponses.PushSubscriptionResponse toResponse(PushSubscriptionEntity subscription) {
        return new PushResponses.PushSubscriptionResponse(
            subscription.getId(),
            subscription.isEnabled(),
            subscription.isCommuteNotificationsEnabled(),
            subscription.isPlannedClosureNotificationsEnabled()
        );
    }

    private List<PushNotificationCandidate> activeCandidatesFor(
        SavedCommuteEntity commute,
        PushSubscriptionEntity subscription
    ) {
        return planner.candidatesFor(commute)
            .stream()
            .filter(candidate -> subscriptionAllowsCandidate(subscription, candidate))
            .toList();
    }

    private boolean subscriptionAllowsCandidate(PushSubscriptionEntity subscription, PushNotificationCandidate candidate) {
        if ("saved-commute-planned".equals(candidate.category())) {
            return subscription.isPlannedClosureNotificationsEnabled();
        }
        return subscription.isCommuteNotificationsEnabled();
    }

    private String tagFor(PushNotificationCandidate candidate) {
        return candidate.notificationKey();
    }

    private String tagFor(PushNotificationEventEntity event) {
        return PushNotificationDisplayTags.forEvent(event);
    }

    private DisplayTag parseDisplayTag(String tag) {
        String normalized = tag.trim();
        if (normalized.endsWith("|cleared")) {
            return new DisplayTag(normalized.substring(0, normalized.length() - "|cleared".length()), "CLEARED");
        }
        if (normalized.endsWith("|active")) {
            return new DisplayTag(normalized.substring(0, normalized.length() - "|active".length()), "ACTIVE");
        }
        return new DisplayTag(normalized, "ACTIVE");
    }

    private String normalizeClientEventStage(String stage) {
        String normalized = stage == null ? "" : stage.trim();
        return switch (normalized) {
            case "push_received",
                 "show_failed",
                 "ack_failed",
                 "notification_click",
                 "notification_close",
                 "pending_skipped",
                 "fallback_shown",
                 "displayed_acknowledged" -> normalized;
            default -> throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_stage", "Push client event stage is not supported.");
        };
    }

    private String normalizeClientEventMessage(String message) {
        if (message == null || message.isBlank()) {
            return null;
        }
        String normalized = message.trim();
        return normalized.length() > 255 ? normalized.substring(0, 255) : normalized;
    }

    private String required(String value, String code, String message) {
        if (value == null || value.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, code, message);
        }
        return value.trim();
    }

    private String normalizeUserAgent(String userAgent) {
        String normalized = userAgent == null ? "" : userAgent.trim();
        if (normalized.length() > 255) {
            return normalized.substring(0, 255);
        }
        return normalized;
    }

    static String hashEndpoint(String endpoint) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(endpoint.trim().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not hash push endpoint", ex);
        }
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    private record DisplayTag(String notificationKey, String notificationState) {}
}
