package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
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
import java.util.Objects;
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

    static final String USER_ENABLED = "user-enabled";
    static final String ENDPOINT_REPLACED = "endpoint-replaced";
    private static final java.util.Set<String> REPLACEMENT_DISABLE_REASONS = java.util.Set.of(
        "superseded-by-installation",
        ENDPOINT_REPLACED,
        "subscription-change",
        "historical-push-service-gone",
        "vapid-key-changed"
    );
    static final java.util.Set<String> WORKER_STAGES = java.util.Set.of(
        "subscription-change-fired",
        "subscription-change-saved",
        "subscription-change-failed",
        "check-replaced",
        "check-restored",
        "check-failed",
        "periodic-sync-fired"
    );
    private static final int MAX_WORKER_STAGES_PER_HOUR = 60;

    private final PushProperties properties;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final PushNotificationEventRepository eventRepository;
    private final SavedCommuteRepository savedCommuteRepository;
    private final PushCandidateResolver candidateResolver;
    private final PushNotificationPreferenceService preferenceService;
    private final PushNotificationClientEventRepository clientEventRepository;
    private final WebPushClient webPushClient;
    private final PushReceiptTokenService receiptTokenService;
    private final IngestionFreshness ingestionFreshness;
    private final RegionalIngestionFreshness regionalIngestionFreshness;
    private final PushSubscriptionLifecycleService lifecycleService;
    private final PushEndpointPolicy endpointPolicy;
    private final Clock clock;

    @Autowired
    public PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationEventRepository eventRepository,
        SavedCommuteRepository savedCommuteRepository,
        PushCandidateResolver candidateResolver,
        PushNotificationPreferenceService preferenceService,
        PushNotificationClientEventRepository clientEventRepository,
        WebPushClient webPushClient,
        PushReceiptTokenService receiptTokenService,
        IngestionFreshness ingestionFreshness,
        RegionalIngestionFreshness regionalIngestionFreshness,
        PushSubscriptionLifecycleService lifecycleService
    ) {
        this(
            properties,
            subscriptionRepository,
            deliveryRepository,
            eventRepository,
            savedCommuteRepository,
            candidateResolver,
            preferenceService,
            clientEventRepository,
            webPushClient,
            ingestionFreshness,
            regionalIngestionFreshness,
            receiptTokenService,
            Clock.systemUTC(),
            lifecycleService
        );
    }

    PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationEventRepository eventRepository,
        SavedCommuteRepository savedCommuteRepository,
        PushCandidateResolver candidateResolver,
        PushNotificationPreferenceService preferenceService,
        PushNotificationClientEventRepository clientEventRepository,
        WebPushClient webPushClient,
        IngestionFreshness ingestionFreshness,
        RegionalIngestionFreshness regionalIngestionFreshness,
        PushReceiptTokenService receiptTokenService,
        Clock clock,
        PushSubscriptionLifecycleService lifecycleService
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.subscriptionRepository = Objects.requireNonNull(subscriptionRepository, "subscriptionRepository");
        this.deliveryRepository = Objects.requireNonNull(deliveryRepository, "deliveryRepository");
        this.eventRepository = Objects.requireNonNull(eventRepository, "eventRepository");
        this.savedCommuteRepository = Objects.requireNonNull(savedCommuteRepository, "savedCommuteRepository");
        this.candidateResolver = Objects.requireNonNull(candidateResolver, "candidateResolver");
        this.preferenceService = Objects.requireNonNull(preferenceService, "preferenceService");
        this.clientEventRepository = Objects.requireNonNull(clientEventRepository, "clientEventRepository");
        this.webPushClient = Objects.requireNonNull(webPushClient, "webPushClient");
        this.ingestionFreshness = Objects.requireNonNull(ingestionFreshness, "ingestionFreshness");
        this.regionalIngestionFreshness = Objects.requireNonNull(regionalIngestionFreshness, "regionalIngestionFreshness");
        this.receiptTokenService = Objects.requireNonNull(receiptTokenService, "receiptTokenService");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.lifecycleService = Objects.requireNonNull(lifecycleService, "lifecycleService");
        this.endpointPolicy = new PushEndpointPolicy();
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
        String endpoint = endpointPolicy.requireAllowed(request.endpoint());
        PushRequests.PushSubscriptionKeys keys = request.keys();
        if (keys == null) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "missing_push_keys", "Push subscription keys are required.");
        }
        String p256dh = required(keys.p256dh(), "missing_push_keys", "Push subscription p256dh key is required.");
        String auth = required(keys.auth(), "missing_push_keys", "Push subscription auth key is required.");
        requireMaxLength(p256dh, 256, "invalid_push_keys", "Push subscription keys are invalid.");
        requireMaxLength(auth, 256, "invalid_push_keys", "Push subscription keys are invalid.");
        String endpointHash = hashEndpoint(endpoint);
        String installationId = normalizeInstallationId(request.installationId());
        String registrationReason = normalizeRegistrationReason(request.reason());
        String previousEndpointHash = normalizeEndpointHash(request.previousEndpointHash());
        Integer browserMajorVersion = normalizeBrowserMajorVersion(request.browserMajorVersion());
        String displayMode = normalizeDisplayMode(request.displayMode());
        Instant now = clock.instant();

        Optional<PushSubscriptionEntity> existing = subscriptionRepository
            .findByAccountIdAndEndpointHash(account.getId(), endpointHash);
        boolean existingSubscription = existing.isPresent();
        if (existing.isPresent()
            && !existing.get().isEnabled()
            && isHardInvalidReason(existing.get().getDisabledReason())) {
            recordLifecycle(existing.get(), "refresh-rejected", "hard-invalid-endpoint");
            return toResponse(existing.get());
        }
        boolean newlyEnabled = existing.map(current -> !current.isEnabled()).orElse(true);

        // The endpoints this registration replaces: the device's previously saved
        // endpoint, and any other enabled endpoint of the same installation.
        Map<String, PushSubscriptionEntity> replaced = new LinkedHashMap<>();
        if (previousEndpointHash != null && !previousEndpointHash.equals(endpointHash)) {
            subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), previousEndpointHash)
                .filter(PushSubscriptionEntity::isEnabled)
                .ifPresent(previous -> replaced.put(previous.getId(), previous));
        }
        if (installationId != null) {
            subscriptionRepository.findByAccountIdAndInstallationIdAndEnabledTrue(account.getId(), installationId)
                .stream()
                .filter(previous -> !endpointHash.equals(previous.getEndpointHash()))
                .forEach(previous -> replaced.putIfAbsent(previous.getId(), previous));
        }

        if (existing.isEmpty()
            && subscriptionRepository.countByAccountIdAndEnabledTrue(account.getId()) - replaced.size()
                >= properties.getMaxEnabledSubscriptionsPerAccount()) {
            throw new AccountException(
                HttpStatus.CONFLICT,
                "push_device_limit_reached",
                "Disable an existing push device before adding another."
            );
        }

        Optional<PushSubscriptionEntity> continuedFrom = continuedInstallation(
            account.getId(), installationId, endpointHash, previousEndpointHash, registrationReason
        );

        subscriptionRepository.findByEndpointHashAndEnabledTrue(endpointHash)
            .stream()
            .filter(previous -> !previous.getAccount().getId().equals(account.getId()))
            .forEach(previous -> {
                previous.disable(now, "reassigned-to-another-account");
                subscriptionRepository.save(previous);
                recordLifecycle(previous, "superseded", "account-switch");
            });

        replaced.values().forEach(previous -> {
            previous.disable(now, ENDPOINT_REPLACED.equals(registrationReason) ? ENDPOINT_REPLACED : "superseded-by-installation");
            subscriptionRepository.save(previous);
            recordLifecycle(previous, "superseded", registrationReason);
        });

        PushSubscriptionEntity subscription = existing
            .map(current -> {
                String effectiveInstallationId = installationId == null
                    ? current.getInstallationId()
                    : installationId;
                String effectiveRegistrationReason = "unspecified".equals(registrationReason)
                    ? current.getRegistrationReason()
                    : registrationReason;
                current.refresh(
                    p256dh,
                    auth,
                    normalizeUserAgent(request.userAgent()),
                    effectiveInstallationId,
                    effectiveRegistrationReason,
                    now
                );
                return current;
            })
            .orElseGet(() -> PushSubscriptionEntity.create(
                nextId("push_subscription"),
                account,
                endpoint,
                endpointHash,
                p256dh,
                auth,
                normalizeUserAgent(request.userAgent()),
                installationId,
                registrationReason,
                now
            ));
        subscription.recordClient(browserMajorVersion, displayMode);
        if (USER_ENABLED.equals(registrationReason)) {
            // A rider's explicit enable starts a new installation enablement.
            subscription.continueInstallation(subscription.getEnabledAt());
        } else if (newlyEnabled && continuedFrom.isPresent()) {
            subscription.continueInstallation(continuedFrom.get().getInstallationEnabledAt(), continuedFrom.get().getId());
        }

        PushSubscriptionEntity saved = subscriptionRepository.save(subscription);
        lifecycleService.record(
            saved,
            existingSubscription ? "refreshed" : "registered",
            registrationReason,
            previousEndpointHash,
            null,
            now
        );
        return toResponse(saved);
    }

    /**
     * The endpoint whose installation enablement a new endpoint continues, or
     * empty when it starts afresh. It continues only when the previous endpoint of the same
     * installation is still enabled or was lost to replacement (push service
     * 404/410, browser rotation), never when the rider turned it off.
     */
    private Optional<PushSubscriptionEntity> continuedInstallation(
        String accountId,
        String installationId,
        String endpointHash,
        String previousEndpointHash,
        String registrationReason
    ) {
        if (USER_ENABLED.equals(registrationReason)) return Optional.empty();
        Optional<PushSubscriptionEntity> previous = Optional.empty();
        if (previousEndpointHash != null && !previousEndpointHash.equals(endpointHash)) {
            previous = subscriptionRepository.findByAccountIdAndEndpointHash(accountId, previousEndpointHash)
                .filter(candidate -> installationId == null || installationId.equals(candidate.getInstallationId()));
        }
        if (previous.isEmpty() && installationId != null) {
            previous = subscriptionRepository.findFirstByAccountIdAndInstallationIdAndEndpointHashNotOrderByCreatedAtDesc(
                accountId, installationId, endpointHash
            );
        }
        return previous
            .filter(candidate -> candidate.isEnabled() || isReplacementDisableReason(candidate.getDisabledReason()));
    }

    static boolean isReplacementDisableReason(String reason) {
        if (reason == null) return false;
        return reason.startsWith("push-service-")
            || REPLACEMENT_DISABLE_REASONS.contains(reason);
    }

    @Transactional
    public void recordWorkerStage(AccountEntity account, PushRequests.WorkerStageRequest request) {
        String stage = required(request.stage(), "missing_stage", "Worker stage is required.");
        if (!WORKER_STAGES.contains(stage)) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_stage", "Worker stage is not supported.");
        }
        Instant now = clock.instant();
        // Diagnostics only: a misbehaving worker must not flood the table.
        if (lifecycleService.recentWorkerStageCount(account.getId(), now.minus(Duration.ofHours(1))) >= MAX_WORKER_STAGES_PER_HOUR) {
            return;
        }
        String endpointHash = request.endpoint() == null || request.endpoint().isBlank()
            ? null
            : hashEndpoint(endpointPolicy.requireAllowed(request.endpoint()));
        PushSubscriptionEntity subscription = endpointHash == null
            ? null
            : subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), endpointHash).orElse(null);
        lifecycleService.recordWorkerStage(
            account.getId(),
            subscription,
            endpointHash,
            stage,
            normalizeClientEventMessage(request.message()),
            now
        );
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
        String endpointHash = hashEndpoint(endpointPolicy.requireAllowed(request.endpoint()));
        subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .ifPresent(subscription -> {
                String reason = normalizeRegistrationReason(request.reason());
                subscription.disable(clock.instant(), reason);
                recordLifecycle(subscription, "disabled", reason);
            });
    }

    @Transactional
    public void markPayloadNotificationDisplayed(
        AccountEntity account,
        PushRequests.DisplayedNotificationRequest request
    ) {
        String endpointHash = hashEndpoint(endpointPolicy.requireAllowed(request.endpoint()));
        DisplayTag displayTag = parseDisplayTag(required(request.tag(), "missing_notification_tag", "Push notification tag is required."));
        requireMaxLength(request.tag().trim(), 512, "invalid_notification_tag", "Push notification tag is invalid.");
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
        String endpointHash = hashEndpoint(endpointPolicy.requireAllowed(request.endpoint()));
        DisplayTag displayTag = parseDisplayTag(required(request.tag(), "missing_notification_tag", "Push notification tag is required."));
        requireMaxLength(request.tag().trim(), 512, "invalid_notification_tag", "Push notification tag is invalid.");
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

    @Transactional
    public void recordReceiptEvent(PushRequests.ReceiptEventRequest request) {
        String deliveryId = required(request.deliveryId(), "missing_delivery_id", "Push delivery id is required.");
        String receiptToken = required(request.receiptToken(), "missing_receipt_token", "Push receipt token is required.");
        requireMaxLength(deliveryId, 80, "invalid_delivery_id", "Push delivery id is invalid.");
        requireMaxLength(receiptToken, 256, "invalid_receipt_token", "Push receipt token is not valid.");
        String stage = normalizeClientEventStage(required(request.stage(), "missing_stage", "Push client event stage is required."));
        PushNotificationDeliveryEntity delivery = deliveryRepository.findById(deliveryId)
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "push_delivery_not_found", "Push delivery was not found."));
        if (!receiptTokenService.matches(delivery, receiptToken)) {
            throw new AccountException(HttpStatus.FORBIDDEN, "invalid_receipt_token", "Push receipt token is not valid.");
        }

        Instant now = clock.instant();
        if ("displayed_acknowledged".equals(stage)) {
            delivery.markDisplayed(now);
        }
        PushNotificationEventEntity event = delivery.getEvent();
        PushSubscriptionEntity subscription = delivery.getSubscription();
        saveClientEvent(
            event.getAccountId(),
            subscription,
            delivery,
            subscription.getEndpointHash(),
            new DisplayTag(event.getNotificationKey(), event.getNotificationState()),
            stage,
            normalizeClientEventMessage(request.message()),
            now
        );
    }

    @Transactional
    public PushResponses.PushDeviceTestResponse testDevice(AccountEntity account, String subscriptionId) {
        String id = required(subscriptionId, "missing_subscription_id", "Push device subscription id is required.");
        PushSubscriptionEntity subscription = subscriptionRepository.findByIdAndAccountId(id, account.getId())
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "push_subscription_not_found", "Push device was not found."));
        if (!subscription.isEnabled()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "push_subscription_disabled", "Push device is disabled.");
        }

        Instant now = clock.instant();
        Duration cooldown = properties.getDiagnosticTestCooldown();
        if (cooldown != null && !cooldown.isZero() && !cooldown.isNegative()
            && eventRepository.existsByAccountIdAndCategoryAndNotificationKeyStartingWithAndCreatedAtAfter(
                account.getId(),
                "diagnostic-test",
                "diagnostic-test|" + subscription.getId() + "|",
                now.minus(cooldown)
            )) {
            throw new AccountException(
                HttpStatus.TOO_MANY_REQUESTS,
                "push_test_rate_limited",
                "Wait before sending another test notification to this device."
            );
        }
        PushNotificationEventEntity event = eventRepository.save(PushNotificationEventEntity.diagnosticTest(
            nextId("push_event"),
            account.getId(),
            subscription.getId(),
            now
        ));
        String deliveryId = nextId("push_delivery");
        PushDeliveryResult result = webPushClient.send(
            subscription,
            PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.forEvent(event)),
            WebPushPayload.fromDelivery(event, deliveryId, subscription, receiptTokenService, now, properties)
        );
        if (result.invalidSubscription()) {
            String reason = hardInvalidReason(result);
            subscription.disable(now, reason);
            recordLifecycle(subscription, "disabled", reason);
        }
        PushNotificationDeliveryEntity delivery = deliveryRepository.save(PushNotificationDeliveryEntity.create(
            deliveryId,
            event,
            subscription,
            result,
            now
        ));
        return new PushResponses.PushDeviceTestResponse(delivery.getStatus(), delivery.getHttpStatus());
    }

    @Transactional
    public void disableDevice(AccountEntity account, String subscriptionId) {
        String id = required(subscriptionId, "missing_subscription_id", "Push device subscription id is required.");
        subscriptionRepository.findByIdAndAccountId(id, account.getId())
            .ifPresent(subscription -> {
                subscription.disable(clock.instant(), "dashboard-disable");
                recordLifecycle(subscription, "disabled", "dashboard-disable");
            });
    }

    @Transactional
    public PushResponses.PendingPushNotificationResponse latestPendingNotification(
        AccountEntity account,
        PushRequests.SubscriptionEndpointRequest request
    ) {
        String endpointHash = hashEndpoint(endpointPolicy.requireAllowed(request.endpoint()));
        Optional<PushSubscriptionEntity> subscription = subscriptionRepository.findByAccountIdAndEndpointHash(
            account.getId(),
            endpointHash
        ).filter(PushSubscriptionEntity::isEnabled);
        if (subscription.isEmpty()) {
            return new PushResponses.PendingPushNotificationResponse(null, List.of());
        }

        List<PushNotificationDeliveryEntity> deliveries = deliveryRepository.findPendingBatchForSubscription(
            account.getId(),
            endpointHash,
            subscription.get().getEnabledAt(),
            PageRequest.of(0, 5)
        );
        if (deliveries.isEmpty()) {
            return new PushResponses.PendingPushNotificationResponse(null, List.of());
        }

        List<PushResponses.PendingPushNotification> notifications = deliveries.stream()
            .map(delivery -> {
                PushNotificationEventEntity event = delivery.getEvent();
                WebPushPayload payload = WebPushPayload.fromDelivery(
                    event,
                    delivery.getId(),
                    delivery.getSubscription(),
                    receiptTokenService,
                    delivery.getCreatedAt(),
                    properties
                );
                return new PushResponses.PendingPushNotification(
                    payload.title(),
                    payload.body(),
                    payload.url(),
                    payload.tag(),
                    payload.state(),
                    payload.timestamp(),
                    payload.sourceEventAt(),
                    payload.sentAt(),
                    payload.expiresAt(),
                    payload.deliveryId(),
                    payload.receiptToken()
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
        String endpointHash = hashEndpoint(endpointPolicy.requireAllowed(request.endpoint()));
        return subscriptionRepository.findByAccountIdAndEndpointHash(account.getId(), endpointHash)
            .filter(PushSubscriptionEntity::isEnabled)
            .map(subscription -> {
                PushNotificationPreferenceEntity preferences = preferenceService.preferenceEntityForAccountId(account.getId());
                List<SavedCommuteEntity> commutes =
                    savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc(account.getId());
                List<PushNotificationCandidate> commuteCandidates = commutes
                    .stream()
                    .flatMap(commute -> candidateResolver.resolveCommuteCandidates(commute, preferences).stream())
                    .toList();
                
                List<String> subscribedLineIds = preferenceService.subscribedLineIds(account.getId());
                boolean hasExplicitRegionalScope = commutes.stream().anyMatch(commute -> "regional".equals(commute.getNetworkId()))
                    || subscribedLineIds.stream().anyMatch(PushCandidateResolver::isRegionalLine);
                boolean hasExplicitTtcScope = commutes.stream().anyMatch(commute -> !"regional".equals(commute.getNetworkId()))
                    || subscribedLineIds.stream().anyMatch(lineId -> !PushCandidateResolver.isRegionalLine(lineId));

                boolean regionalScope = hasExplicitRegionalScope;
                boolean ttcScope = hasExplicitTtcScope || !hasExplicitRegionalScope;
                boolean cleanupAllowed = (!ttcScope || ingestionFreshness.isDashboardFresh())
                    && (!regionalScope || regionalIngestionFreshness.isFresh());
                List<PushNotificationCandidate> lineCandidates = candidateResolver.resolveLineCandidates(
                    account.getId(), subscribedLineIds, preferences
                );
                
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
                return new PushResponses.ActivePushNotificationsResponse(activeTags, retainedTags, cleanupAllowed);
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
                // An incident that returned is active again; its earlier "cleared" card would contradict it.
                if (activeNotificationKeys.contains(notificationKey)) continue;
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
        if (delivery == null || clientEventRepository.existsByDeliveryIdAndStage(delivery.getId(), stage)) {
            return;
        }
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

    static String deviceLabel(PushSubscriptionEntity subscription) {
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

    static String endpointHashPrefix(String endpointHash) {
        if (endpointHash == null || endpointHash.isBlank()) {
            return "";
        }
        String normalized = endpointHash.trim();
        return normalized.substring(0, Math.min(12, normalized.length()));
    }

    static String installationIdPrefix(String installationId) {
        if (installationId == null || installationId.isBlank()) return null;
        String normalized = installationId.trim();
        return normalized.substring(0, Math.min(8, normalized.length()));
    }

    private String normalizeInstallationId(String installationId) {
        if (installationId == null || installationId.isBlank()) return null;
        String normalized = installationId.trim();
        if (normalized.length() > 80 || !normalized.matches("[A-Za-z0-9._:-]{8,80}")) {
            throw new AccountException(
                HttpStatus.BAD_REQUEST,
                "invalid_installation_id",
                "Push installation id is invalid."
            );
        }
        return normalized;
    }

    private String normalizeRegistrationReason(String reason) {
        if (reason == null || reason.isBlank()) return "unspecified";
        String normalized = reason.trim();
        return normalized.substring(0, Math.min(80, normalized.length()));
    }

    private static String normalizeEndpointHash(String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return normalized.matches("[0-9a-f]{64}") ? normalized : null;
    }

    private static Integer normalizeBrowserMajorVersion(Integer value) {
        return value == null || value < 1 || value > 999 ? null : value;
    }

    private static String normalizeDisplayMode(String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "standalone", "browser", "minimal-ui", "fullscreen" -> normalized;
            default -> null;
        };
    }

    private boolean isHardInvalidReason(String reason) {
        return reason != null && reason.startsWith("push-service-");
    }

    private String hardInvalidReason(PushDeliveryResult result) {
        return "push-service-" + (result.httpStatus() == null ? "invalid" : result.httpStatus());
    }

    private void recordLifecycle(PushSubscriptionEntity subscription, String eventType, String reason) {
        if (subscription == null) return;
        String normalizedReason = reason == null || reason.isBlank() ? "unspecified" : reason.trim().substring(0, Math.min(80, reason.trim().length()));
        lifecycleService.record(subscription, eventType, normalizedReason, clock.instant());
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
        return candidateResolver.resolveCommuteCandidates(commute, (PlannedClosureFollowUpPolicy) null)
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

    private void requireMaxLength(String value, int maxLength, String code, String message) {
        if (value.length() > maxLength) {
            throw new AccountException(HttpStatus.BAD_REQUEST, code, message);
        }
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

    static String vapidKeyFingerprint(String publicKey) {
        if (publicKey == null || publicKey.isBlank()) {
            return null;
        }
        return hashEndpoint(publicKey).substring(0, 12);
    }

    private String nextId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    private record DisplayTag(String notificationKey, String notificationState) {}
}
