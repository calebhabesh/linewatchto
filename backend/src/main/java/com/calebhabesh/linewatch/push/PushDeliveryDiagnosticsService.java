package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushDeliveryDiagnosticsService {
    private static final int MAX_DELIVERIES = 50;

    private final PushNotificationDeliveryRepository deliveryRepository;
    private final PushNotificationClientEventRepository clientEventRepository;
    private final PushSubscriptionRepository subscriptionRepository;

    public PushDeliveryDiagnosticsService(
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationClientEventRepository clientEventRepository,
        PushSubscriptionRepository subscriptionRepository
    ) {
        this.deliveryRepository = Objects.requireNonNull(deliveryRepository, "deliveryRepository");
        this.clientEventRepository = Objects.requireNonNull(clientEventRepository, "clientEventRepository");
        this.subscriptionRepository = Objects.requireNonNull(subscriptionRepository, "subscriptionRepository");
    }

    @Transactional(readOnly = true)
    public PushResponses.PushDeliveryDiagnosticsResponse forAccount(String accountId) {
        if (accountId == null || accountId.isBlank()) {
            return new PushResponses.PushDeliveryDiagnosticsResponse(List.of());
        }

        List<PushNotificationDeliveryEntity> deliveries = deliveryRepository.findRecentDeliveriesForAccount(
            accountId,
            PageRequest.of(0, MAX_DELIVERIES)
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
        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc(accountId);
        List<PushResponses.PushNotificationDiagnosticGroupResponse> notificationGroups = deliveriesByEventId.values()
            .stream()
            .map(groupDeliveries -> toDiagnosticGroup(groupDeliveries, responsesByDeliveryId, subscriptions))
            .toList();

        return new PushResponses.PushDeliveryDiagnosticsResponse(notificationGroups, responseDeliveries);
    }

    @Transactional(readOnly = true)
    public PushResponses.PushDeliveryDiagnosticsResponse forAccount(AccountEntity account) {
        if (account == null) {
            return new PushResponses.PushDeliveryDiagnosticsResponse(List.of());
        }
        return forAccount(account.getId());
    }

    public PushResponses.PushDeliveryDiagnosticResponse toDiagnosticResponse(
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
            PushNotificationService.deviceLabel(subscription),
            subscription.getUserAgent(),
            PushNotificationService.endpointHashPrefix(subscription.getEndpointHash()),
            PushNotificationService.installationIdPrefix(subscription.getInstallationId()),
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
            .filter(Objects::nonNull)
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
        Set<String> includedSubscriptionIds = new HashSet<>();
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
            PushNotificationService.deviceLabel(subscription),
            subscription.getUserAgent(),
            PushNotificationService.endpointHashPrefix(subscription.getEndpointHash()),
            PushNotificationService.installationIdPrefix(subscription.getInstallationId()),
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
        Instant eventTriggeredAt = event.deliveryEligibilityAt();
        Instant enabledAt = subscription.getEnabledAt();
        Instant createdAt = subscription.getCreatedAt();
        if ((enabledAt != null && eventTriggeredAt.isBefore(enabledAt))
            || (createdAt != null && eventTriggeredAt.isBefore(createdAt))) {
            return new RecipientReason(
                "subscription-registered-after-event",
                "Device was enabled after this notification became eligible."
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

    private String instantString(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    private record RecipientReason(String code, String description) {}
}
