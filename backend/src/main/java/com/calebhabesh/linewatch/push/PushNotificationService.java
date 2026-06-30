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
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
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
        IngestionFreshness ingestionFreshness
    ) {
        this(properties, subscriptionRepository, deliveryRepository, savedCommuteRepository, planner, preferenceService, lineSubscriptionPushPlanner, ingestionFreshness, Clock.systemUTC());
    }

    PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
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
        ).stream().findFirst().ifPresent(delivery -> delivery.markDisplayed(clock.instant()));
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
