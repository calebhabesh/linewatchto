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
        return new PushResponses.PushConfigResponse(
            properties.webPushConfigured(),
            properties.getVapidPublicKey() == null ? "" : properties.getVapidPublicKey().trim(),
            preferenceService.preferencesFor(account)
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
    public PushResponses.PushSubscriptionResponse updatePreferences(
        AccountEntity account,
        PushRequests.UpdatePushPreferencesRequest request
    ) {
        PushResponses.PushPreferencesResponse updatedPrefs = preferenceService.updatePreferences(account, request);
        
        Optional<PushSubscriptionEntity> activeSubOpt = subscriptionRepository.findByAccountIdAndEnabledTrue(account.getId())
            .stream()
            .findFirst();
            
        if (activeSubOpt.isPresent()) {
            PushSubscriptionEntity subscription = activeSubOpt.get();
            subscription.updatePreferences(
                updatedPrefs.commuteNotificationsEnabled(),
                updatedPrefs.plannedClosureNotificationsEnabled(),
                clock.instant()
            );
            PushSubscriptionEntity saved = subscriptionRepository.save(subscription);
            return new PushResponses.PushSubscriptionResponse(
                saved.getId(),
                saved.isEnabled(),
                updatedPrefs.commuteNotificationsEnabled(),
                updatedPrefs.plannedClosureNotificationsEnabled()
            );
        } else {
            return new PushResponses.PushSubscriptionResponse(
                "",
                false,
                updatedPrefs.commuteNotificationsEnabled(),
                updatedPrefs.plannedClosureNotificationsEnabled()
            );
        }
    }

    @Transactional
    public void disableSubscription(AccountEntity account, PushRequests.SubscriptionEndpointRequest request) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .ifPresent(subscription -> subscription.disable(clock.instant()));
    }

    @Transactional
    public PushResponses.PendingPushNotificationResponse latestPendingNotification(
        AccountEntity account,
        PushRequests.SubscriptionEndpointRequest request
    ) {
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
        return deliveryRepository.findPendingForSubscription(account.getId(), endpointHash, PageRequest.of(0, 1))
            .stream()
            .findFirst()
            .map(delivery -> {
                delivery.markDisplayed(clock.instant());
                PushNotificationEventEntity event = delivery.getEvent();
                return new PushResponses.PendingPushNotificationResponse(new PushResponses.PendingPushNotification(
                    event.getTitle(),
                    event.getBody(),
                    event.getUrl(),
                    tagFor(event),
                    event.getNotificationState(),
                    event.getCreatedAt().toString()
                ));
            })
            .orElse(new PushResponses.PendingPushNotificationResponse(null));
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
                
                List<String> activeTags = allCandidates.stream()
                    .filter(candidate -> preferenceService.allows(preferences, candidate))
                    .map(PushNotificationCandidate::notificationKey)
                    .distinct()
                    .toList();

                List<String> retainedTags = retainedNotificationTags(account.getId(), endpointHash, activeTags);
                return new PushResponses.ActivePushNotificationsResponse(activeTags, retainedTags, true);
            })
            .orElse(new PushResponses.ActivePushNotificationsResponse(List.of(), List.of(), true));
    }

    private List<String> retainedNotificationTags(String accountId, String endpointHash, List<String> activeTags) {
        List<String> retainedTags = new ArrayList<>(activeTags);
        Duration retention = properties.getClearedNotificationRetention();
        if (retention == null || retention.isZero() || retention.isNegative()) {
            return retainedTags.stream()
                .filter(tag -> tag != null && !tag.isBlank())
                .distinct()
                .toList();
        }

        Instant displayedAtAfter = clock.instant().minus(retention);
        List<String> recentlyDisplayedClearedTags = deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
            accountId,
            endpointHash,
            RETAINED_CLEARED_CATEGORIES,
            displayedAtAfter
        );
        if (recentlyDisplayedClearedTags != null) {
            retainedTags.addAll(recentlyDisplayedClearedTags);
        }

        return retainedTags.stream()
            .filter(tag -> tag != null && !tag.isBlank())
            .distinct()
            .toList();
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
        return event.getNotificationKey();
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
}
