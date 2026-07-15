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
    private final PushNotificationEventRepository eventRepository;
    private final SavedCommuteRepository savedCommuteRepository;
    private final SavedCommutePushPlanner planner;
    private final PushNotificationPreferenceService preferenceService;
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner;
    private final PushNotificationClientEventRepository clientEventRepository;
    private final WebPushClient webPushClient;
    private final PushReceiptTokenService receiptTokenService;
    private final IngestionFreshness ingestionFreshness;
    private final PushSubscriptionLifecycleService lifecycleService;
    private final Clock clock;

    @Autowired
    public PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationEventRepository eventRepository,
        SavedCommuteRepository savedCommuteRepository,
        SavedCommutePushPlanner planner,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationClientEventRepository clientEventRepository,
        WebPushClient webPushClient,
        PushReceiptTokenService receiptTokenService,
        IngestionFreshness ingestionFreshness,
        PushSubscriptionLifecycleService lifecycleService
    ) {
        this(
            properties,
            subscriptionRepository,
            deliveryRepository,
            eventRepository,
            savedCommuteRepository,
            planner,
            preferenceService,
            lineSubscriptionPushPlanner,
            clientEventRepository,
            webPushClient,
            ingestionFreshness,
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
        SavedCommutePushPlanner planner,
        PushNotificationPreferenceService preferenceService,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationClientEventRepository clientEventRepository,
        WebPushClient webPushClient,
        IngestionFreshness ingestionFreshness,
        PushReceiptTokenService receiptTokenService,
        Clock clock
    ) {
        this(properties, subscriptionRepository, deliveryRepository, eventRepository, savedCommuteRepository, planner,
            preferenceService, lineSubscriptionPushPlanner, clientEventRepository, webPushClient, ingestionFreshness,
            receiptTokenService, clock, null);
    }

    PushNotificationService(
        PushProperties properties, PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository, PushNotificationEventRepository eventRepository,
        SavedCommuteRepository savedCommuteRepository, SavedCommutePushPlanner planner,
        PushNotificationPreferenceService preferenceService, LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        PushNotificationClientEventRepository clientEventRepository, WebPushClient webPushClient,
        IngestionFreshness ingestionFreshness, PushReceiptTokenService receiptTokenService, Clock clock,
        PushSubscriptionLifecycleService lifecycleService
    ) {
        this.properties = properties;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.eventRepository = eventRepository;
        this.savedCommuteRepository = savedCommuteRepository;
        this.planner = planner;
        this.preferenceService = preferenceService;
        this.lineSubscriptionPushPlanner = lineSubscriptionPushPlanner;
        this.clientEventRepository = clientEventRepository;
        this.webPushClient = webPushClient;
        this.receiptTokenService = receiptTokenService;
        this.ingestionFreshness = ingestionFreshness;
        this.clock = clock;
        this.lifecycleService = lifecycleService;
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
        String installationId = normalizeInstallationId(request.installationId());
        String registrationReason = normalizeRegistrationReason(request.reason());
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

        if (installationId != null) {
            subscriptionRepository.findByAccountIdAndInstallationIdAndEnabledTrue(account.getId(), installationId)
                .stream()
                .filter(previous -> !endpointHash.equals(previous.getEndpointHash()))
                .forEach(previous -> {
                    previous.disable(now, "superseded-by-installation");
                    subscriptionRepository.save(previous);
                    recordLifecycle(previous, "superseded", registrationReason);
                });
        }

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

        PushSubscriptionEntity saved = subscriptionRepository.save(subscription);
        recordLifecycle(saved, existingSubscription ? "refreshed" : "registered", registrationReason);
        return toResponse(saved);
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

    @Transactional
    public void recordReceiptEvent(PushRequests.ReceiptEventRequest request) {
        String deliveryId = required(request.deliveryId(), "missing_delivery_id", "Push delivery id is required.");
        String receiptToken = required(request.receiptToken(), "missing_receipt_token", "Push receipt token is required.");
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
        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc(account.getId());
        List<PushResponses.PushNotificationDiagnosticGroupResponse> notificationGroups = deliveriesByEventId.values()
            .stream()
            .map(groupDeliveries -> toDiagnosticGroup(groupDeliveries, responsesByDeliveryId, subscriptions))
            .toList();

        return new PushResponses.PushDeliveryDiagnosticsResponse(notificationGroups, responseDeliveries);
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
        return new PushResponses.PushDeviceTestResponse(toDiagnosticResponse(delivery, List.of()));
    }

    @Transactional(readOnly = true)
    public PushResponses.PushDevicesResponse devices(AccountEntity account) {
        List<PushResponses.PushDeviceResponse> devices = subscriptionRepository
            .findByAccountIdAndEnabledTrueOrderByUpdatedAtDesc(account.getId())
            .stream()
            .map(this::toDeviceResponse)
            .toList();
        return new PushResponses.PushDevicesResponse(devices, vapidKeyFingerprint(properties.getVapidPublicKey()));
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
        String endpointHash = hashEndpoint(required(request.endpoint(), "missing_endpoint", "Push subscription endpoint is required."));
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
            installationIdPrefix(subscription.getInstallationId()),
            subscription.getRegistrationReason(),
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
        Map<String, PushResponses.PushDeliveryDiagnosticResponse> responsesByDeliveryId,
        List<PushSubscriptionEntity> subscriptions
    ) {
        PushNotificationEventEntity event = deliveries.getFirst().getEvent();
        List<PushResponses.PushDeliveryDiagnosticResponse> attempts = deliveries.stream()
            .map(delivery -> responsesByDeliveryId.get(delivery.getId()))
            .filter(java.util.Objects::nonNull)
            .toList();
        List<PushResponses.PushRecipientDiagnosticResponse> recipients = recipientDiagnostics(
            event,
            deliveries,
            responsesByDeliveryId,
            subscriptions
        );

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
            attempts,
            recipients
        );
    }

    private List<PushResponses.PushRecipientDiagnosticResponse> recipientDiagnostics(
        PushNotificationEventEntity event,
        List<PushNotificationDeliveryEntity> deliveries,
        Map<String, PushResponses.PushDeliveryDiagnosticResponse> responsesByDeliveryId,
        List<PushSubscriptionEntity> subscriptions
    ) {
        Map<String, PushNotificationDeliveryEntity> deliveryBySubscriptionId = deliveries.stream()
            .collect(Collectors.toMap(
                delivery -> delivery.getSubscription().getId(),
                delivery -> delivery,
                (first, second) -> first,
                LinkedHashMap::new
            ));
        List<PushResponses.PushRecipientDiagnosticResponse> recipients = new ArrayList<>();
        java.util.Set<String> includedSubscriptionIds = new java.util.HashSet<>();
        for (PushSubscriptionEntity subscription : subscriptions) {
            recipients.add(toRecipientDiagnostic(
                event,
                subscription,
                deliveryBySubscriptionId.get(subscription.getId()),
                responsesByDeliveryId
            ));
            includedSubscriptionIds.add(subscription.getId());
        }
        for (PushNotificationDeliveryEntity delivery : deliveries) {
            PushSubscriptionEntity subscription = delivery.getSubscription();
            if (includedSubscriptionIds.add(subscription.getId())) {
                recipients.add(toRecipientDiagnostic(event, subscription, delivery, responsesByDeliveryId));
            }
        }
        return recipients;
    }

    private PushResponses.PushRecipientDiagnosticResponse toRecipientDiagnostic(
        PushNotificationEventEntity event,
        PushSubscriptionEntity subscription,
        PushNotificationDeliveryEntity delivery,
        Map<String, PushResponses.PushDeliveryDiagnosticResponse> responsesByDeliveryId
    ) {
        PushResponses.PushDeliveryDiagnosticResponse deliveryResponse =
            delivery == null ? null : responsesByDeliveryId.get(delivery.getId());
        RecipientReason reason = delivery == null
            ? notAttemptedReason(event, subscription)
            : new RecipientReason("attempted", "Delivery was attempted for this device.");
        return new PushResponses.PushRecipientDiagnosticResponse(
            subscription.getId(),
            deviceLabel(subscription),
            subscription.getUserAgent(),
            endpointHashPrefix(subscription.getEndpointHash()),
            installationIdPrefix(subscription.getInstallationId()),
            subscription.getRegistrationReason(),
            subscription.isEnabled(),
            instantString(subscription.getEnabledAt()),
            instantString(subscription.getDisabledAt()),
            delivery == null ? "not-attempted" : "attempted",
            reason.code(),
            reason.description(),
            deliveryResponse
        );
    }

    private RecipientReason notAttemptedReason(PushNotificationEventEntity event, PushSubscriptionEntity subscription) {
        Instant eventCreatedAt = event.getCreatedAt();
        if (eventCreatedAt == null) {
            return new RecipientReason(
                "event-created-at-missing",
                "Notification creation time was not recorded."
            );
        }
        Instant enabledAt = subscription.getEnabledAt();
        Instant createdAt = subscription.getCreatedAt();
        if ((enabledAt != null && eventCreatedAt.isBefore(enabledAt))
            || (createdAt != null && eventCreatedAt.isBefore(createdAt))) {
            return new RecipientReason(
                "subscription-registered-after-event",
                "Device was registered after this notification was created."
            );
        }
        if (!subscription.isEnabled()) {
            Instant disabledAt = subscription.getDisabledAt();
            if (disabledAt != null && !disabledAt.isAfter(eventCreatedAt)) {
                return new RecipientReason(
                    "subscription-disabled-before-event",
                    "Device was disabled before this notification was created."
                );
            }
            return new RecipientReason(
                "subscription-disabled",
                "Device is currently disabled."
            );
        }
        return new RecipientReason(
            "eligible-no-delivery-recorded",
            "Device appears eligible, but no delivery attempt was recorded."
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

    private String installationIdPrefix(String installationId) {
        if (installationId == null || installationId.isBlank()) return null;
        String normalized = installationId.trim();
        return normalized.substring(0, Math.min(8, normalized.length()));
    }

    private int previousEndpointCount(PushSubscriptionEntity subscription) {
        String installationId = subscription.getInstallationId();
        if (installationId == null || installationId.isBlank()) return 0;
        long count = Math.max(0, subscriptionRepository.countByAccountIdAndInstallationId(
            subscription.getAccount().getId(), installationId
        ) - 1);
        return count > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) count;
    }

    private Instant registrationInceptionAt(PushSubscriptionEntity subscription) {
        String installationId = subscription.getInstallationId();
        if (installationId == null || installationId.isBlank()) {
            return subscription.getCreatedAt();
        }
        return subscriptionRepository.findTopByAccountIdAndInstallationIdOrderByCreatedAtAsc(
            subscription.getAccount().getId(),
            installationId
        ).map(PushSubscriptionEntity::getCreatedAt).orElse(subscription.getCreatedAt());
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

    private boolean isHardInvalidReason(String reason) {
        return reason != null && reason.startsWith("push-service-");
    }

    private String hardInvalidReason(PushDeliveryResult result) {
        return "push-service-" + (result.httpStatus() == null ? "invalid" : result.httpStatus());
    }

    private void recordLifecycle(PushSubscriptionEntity subscription, String eventType, String reason) {
        if (lifecycleService == null || subscription == null) return;
        String normalizedReason = reason == null || reason.isBlank() ? "unspecified" : reason.trim().substring(0, Math.min(80, reason.trim().length()));
        lifecycleService.record(subscription, eventType, normalizedReason, clock.instant());
    }

    private PushResponses.PushDeviceResponse toDeviceResponse(PushSubscriptionEntity subscription) {
        Optional<PushNotificationDeliveryEntity> latestDelivery =
            deliveryRepository.findTopBySubscription_IdOrderByCreatedAtDesc(subscription.getId());
        Optional<PushNotificationDeliveryEntity> latestAcceptedDelivery =
            deliveryRepository.findTopBySubscription_IdAndStatusOrderByCreatedAtDesc(subscription.getId(), "accepted");
        Optional<PushNotificationDeliveryEntity> latestDisplayedDelivery =
            deliveryRepository.findTopBySubscription_IdAndDisplayedAtIsNotNullOrderByDisplayedAtDesc(subscription.getId());
        Instant latestDisplayedAt = latestDisplayedDelivery
            .map(PushNotificationDeliveryEntity::getDisplayedAt)
            .orElse(null);
        Instant latestAcceptedAt = latestAcceptedDelivery
            .map(PushNotificationDeliveryEntity::getCreatedAt)
            .orElse(null);
        int safeAcceptedWithoutDisplayCount = acceptedWithoutDisplayCount(subscription.getId(), latestDisplayedAt);
        int previousEndpointCount = previousEndpointCount(subscription);
        String deliveryHealth = deviceDeliveryHealth(
            subscription,
            latestDelivery.orElse(null),
            latestAcceptedAt,
            latestDisplayedAt,
            safeAcceptedWithoutDisplayCount
        );
        boolean staleCandidate = subscription.isEnabled()
            && safeAcceptedWithoutDisplayCount > 0
            && acceptedAfterLastDisplay(latestAcceptedAt, latestDisplayedAt);

        return new PushResponses.PushDeviceResponse(
            subscription.getId(),
            deviceLabel(subscription),
            subscription.getUserAgent(),
            endpointHashPrefix(subscription.getEndpointHash()),
            installationIdPrefix(subscription.getInstallationId()),
            subscription.getRegistrationReason(),
            previousEndpointCount,
            subscription.isEnabled(),
            instantString(registrationInceptionAt(subscription)),
            instantString(subscription.getCreatedAt()),
            instantString(subscription.getUpdatedAt()),
            instantString(subscription.getLastSeenAt()),
            instantString(subscription.getDisabledAt()),
            latestDelivery.map(PushNotificationDeliveryEntity::getCreatedAt).map(this::instantString).orElse(null),
            instantString(latestAcceptedAt),
            instantString(latestDisplayedAt),
            safeAcceptedWithoutDisplayCount,
            deliveryHealth,
            staleCandidate
        );
    }

    private String deviceDeliveryHealth(
        PushSubscriptionEntity subscription,
        PushNotificationDeliveryEntity latestDelivery,
        Instant latestAcceptedAt,
        Instant latestDisplayedAt,
        int acceptedWithoutDisplayCount
    ) {
        if (!subscription.isEnabled()) {
            return "disabled";
        }
        if (acceptedWithoutDisplayCount > 0 && acceptedAfterLastDisplay(latestAcceptedAt, latestDisplayedAt)) {
            return "accepted-no-display";
        }
        if (latestDisplayedAt != null) {
            return "displayed";
        }
        if (latestDelivery != null) {
            return "sent-no-display";
        }
        return "registered";
    }

    private boolean acceptedAfterLastDisplay(Instant latestAcceptedAt, Instant latestDisplayedAt) {
        return latestDisplayedAt == null
            || latestAcceptedAt == null
            || latestAcceptedAt.isAfter(latestDisplayedAt);
    }

    private int acceptedWithoutDisplayCount(String subscriptionId, Instant latestDisplayedAt) {
        long count = latestDisplayedAt == null
            ? deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNull(subscriptionId, "accepted")
            : deliveryRepository.countBySubscription_IdAndStatusAndDisplayedAtIsNullAndCreatedAtAfter(
                subscriptionId,
                "accepted",
                latestDisplayedAt
            );
        return count > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) count;
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
    private record RecipientReason(String code, String description) {}
}
