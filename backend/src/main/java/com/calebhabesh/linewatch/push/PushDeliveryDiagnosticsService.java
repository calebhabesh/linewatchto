package com.calebhabesh.linewatch.push;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Notification diagnostics around browser installations, not endpoints (plan
 * 12). A device is one installation, however many endpoints the browser has
 * rotated through. Each alert gets one plain outcome per device: shown, sent
 * but not confirmed, missed while the device was unreachable, or not sent and
 * why. Account-owned; hash and installation prefixes only.
 */
@Service
public class PushDeliveryDiagnosticsService {
    static final Duration WINDOW = Duration.ofDays(7);
    static final int MAX_ALERTS = 40;
    static final int MAX_LIFECYCLE_RECORDS = 40;
    static final String EARLIER_DEVICES_KEY = "earlier";
    private static final String DIAGNOSTIC_TEST_CATEGORY = "diagnostic-test";

    private final PushNotificationDeliveryRepository deliveryRepository;
    private final PushNotificationEventRepository eventRepository;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushSubscriptionLifecycleEventRepository lifecycleRepository;
    private final PushProperties properties;
    private final Clock clock;

    @Autowired
    public PushDeliveryDiagnosticsService(
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushSubscriptionLifecycleEventRepository lifecycleRepository,
        PushProperties properties
    ) {
        this(deliveryRepository, eventRepository, subscriptionRepository, lifecycleRepository, properties, Clock.systemUTC());
    }

    PushDeliveryDiagnosticsService(
        PushNotificationDeliveryRepository deliveryRepository,
        PushNotificationEventRepository eventRepository,
        PushSubscriptionRepository subscriptionRepository,
        PushSubscriptionLifecycleEventRepository lifecycleRepository,
        PushProperties properties,
        Clock clock
    ) {
        this.deliveryRepository = Objects.requireNonNull(deliveryRepository, "deliveryRepository");
        this.eventRepository = Objects.requireNonNull(eventRepository, "eventRepository");
        this.subscriptionRepository = Objects.requireNonNull(subscriptionRepository, "subscriptionRepository");
        this.lifecycleRepository = Objects.requireNonNull(lifecycleRepository, "lifecycleRepository");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    @Transactional(readOnly = true)
    public PushResponses.PushDiagnosticsResponse forAccount(String accountId) {
        Instant now = clock.instant();
        Instant since = now.minus(WINDOW);
        String vapid = PushNotificationService.vapidKeyFingerprint(properties.getVapidPublicKey());
        if (accountId == null || accountId.isBlank()) {
            return new PushResponses.PushDiagnosticsResponse(since.toString(), List.of(), List.of(),
                new PushResponses.PushDiagnosticsTechnicalResponse(vapid, List.of()));
        }

        List<PushSubscriptionEntity> subscriptions = subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc(accountId);
        List<PushNotificationEventEntity> events = eventRepository
            .findByAccountIdAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(accountId, since);
        Map<String, List<PushNotificationDeliveryEntity>> deliveriesByEventId = new HashMap<>();
        for (PushNotificationDeliveryEntity delivery : deliveryRepository.findDeliveriesForAccountSince(accountId, since)) {
            deliveriesByEventId.computeIfAbsent(delivery.getEvent().getId(), ignored -> new ArrayList<>()).add(delivery);
        }

        Map<String, Device> devicesByKey = new LinkedHashMap<>();
        for (PushSubscriptionEntity subscription : subscriptions) {
            devicesByKey.computeIfAbsent(deviceKey(subscription), Device::new).subscriptions.add(subscription);
        }
        List<Device> devices = devicesByKey.values().stream()
            .peek(Device::sort)
            .filter(device -> device.relevantSince(since, deliveriesByEventId))
            .sorted(Comparator.comparing((Device device) -> device.statusRank())
                .thenComparing(device -> device.latest().getEnabledAt(), Comparator.nullsLast(Comparator.reverseOrder())))
            .toList();

        Map<String, Counts> counts = new HashMap<>();
        List<PushResponses.PushAlertDiagnosticResponse> alerts = new ArrayList<>();
        for (PushNotificationEventEntity event : events) {
            List<PushNotificationDeliveryEntity> eventDeliveries = deliveriesByEventId.getOrDefault(event.getId(), List.of());
            List<PushResponses.PushAlertOutcomeResponse> outcomes = new ArrayList<>();
            for (Device device : devices) {
                Optional<PushResponses.PushAlertOutcomeResponse> outcome = outcomeFor(event, device, eventDeliveries);
                if (outcome.isEmpty()) continue;
                outcomes.add(outcome.get());
                if (!DIAGNOSTIC_TEST_CATEGORY.equals(event.getCategory())) {
                    counts.computeIfAbsent(device.key, ignored -> new Counts()).add(outcome.get(), event);
                }
            }
            if (!outcomes.isEmpty() && alerts.size() < MAX_ALERTS) {
                alerts.add(new PushResponses.PushAlertDiagnosticResponse(
                    event.getId(),
                    event.getTitle(),
                    event.getNotificationState(),
                    event.getCategory(),
                    event.getLineId(),
                    lineNumberFor(event.getLineId()),
                    instantString(event.getCreatedAt()),
                    outcomes
                ));
            }
        }

        List<PushResponses.PushDeviceDiagnosticResponse> deviceResponses = devices.stream()
            .map(device -> toDeviceResponse(device, counts.getOrDefault(device.key, new Counts()), since))
            .toList();
        return new PushResponses.PushDiagnosticsResponse(
            since.toString(),
            deviceResponses,
            alerts,
            new PushResponses.PushDiagnosticsTechnicalResponse(vapid, lifecycleRecords(accountId, since, subscriptions))
        );
    }

    /**
     * One outcome for an alert on a device, or empty when the device has no
     * bearing on it (set up after the alert became eligible).
     */
    static Optional<PushResponses.PushAlertOutcomeResponse> outcomeFor(
        PushNotificationEventEntity event,
        Device device,
        List<PushNotificationDeliveryEntity> eventDeliveries
    ) {
        List<PushNotificationDeliveryEntity> deliveries = eventDeliveries.stream()
            .filter(delivery -> device.owns(delivery.getSubscription()))
            .toList();
        if (!deliveries.isEmpty()) {
            Optional<PushNotificationDeliveryEntity> shown = deliveries.stream()
                .filter(delivery -> delivery.getDisplayedAt() != null)
                .min(Comparator.comparing(PushNotificationDeliveryEntity::getDisplayedAt));
            if (shown.isPresent()) {
                return Optional.of(outcome(device, "shown", shown.get().getDisplayedAt(), null, shown.get()));
            }
            Optional<PushNotificationDeliveryEntity> accepted = deliveries.stream()
                .filter(delivery -> "accepted".equals(delivery.getStatus()))
                .max(Comparator.comparing(PushNotificationDeliveryEntity::getCreatedAt));
            if (accepted.isPresent()) {
                return Optional.of(outcome(device, "sent", accepted.get().getCreatedAt(), null, accepted.get()));
            }
            PushNotificationDeliveryEntity latest = deliveries.stream()
                .max(Comparator.comparing(PushNotificationDeliveryEntity::getCreatedAt))
                .orElseThrow();
            if (isGone(latest)) {
                return Optional.of(outcome(device, "missed", latest.getCreatedAt(),
                    "the device had already dropped this subscription", latest));
            }
            String status = latest.getHttpStatus() == null ? latest.getStatus() : String.valueOf(latest.getHttpStatus());
            return Optional.of(outcome(device, "not-sent", latest.getCreatedAt(), "push service error " + status, latest));
        }

        Instant eligibleAt = event.deliveryEligibilityAt();
        if (eligibleAt == null) {
            return Optional.empty();
        }
        return switch (device.stateAt(eligibleAt)) {
            case REACHABLE -> Optional.of(outcome(device, "not-sent", null, "no delivery was recorded", null));
            case UNREACHABLE -> Optional.of(outcome(device, "missed", null, null, null));
            case OFF -> Optional.of(outcome(device, "not-sent", null, "notifications were off on this device", null));
            case NOT_SET_UP -> Optional.empty();
        };
    }

    private static PushResponses.PushAlertOutcomeResponse outcome(
        Device device,
        String outcome,
        Instant at,
        String reason,
        PushNotificationDeliveryEntity delivery
    ) {
        return new PushResponses.PushAlertOutcomeResponse(
            device.key,
            outcome,
            instantString(at),
            reason,
            delivery != null && delivery.isCatchUp(),
            delivery == null ? null : technicalDetail(delivery)
        );
    }

    private static String technicalDetail(PushNotificationDeliveryEntity delivery) {
        StringBuilder detail = new StringBuilder();
        detail.append(delivery.getStatus());
        if (delivery.getHttpStatus() != null) detail.append(' ').append(delivery.getHttpStatus());
        detail.append(" · ").append(delivery.getAttemptCount()).append(delivery.getAttemptCount() == 1 ? " attempt" : " attempts");
        detail.append(" · endpoint ").append(PushNotificationService.endpointHashPrefix(delivery.getSubscription().getEndpointHash()));
        if (delivery.isCatchUp()) detail.append(" · catch-up");
        return detail.toString();
    }

    private PushResponses.PushDeviceDiagnosticResponse toDeviceResponse(Device device, Counts counts, Instant since) {
        PushSubscriptionEntity latest = device.latest();
        Status status = device.status();
        long replacements = device.subscriptions.stream()
            .filter(subscription -> subscription.getDisabledAt() != null && !subscription.getDisabledAt().isBefore(since))
            .filter(subscription -> PushNotificationService.isReplacementDisableReason(subscription.getDisabledReason()))
            .count();
        return new PushResponses.PushDeviceDiagnosticResponse(
            device.key,
            device.isEarlier() ? "Earlier Devices" : PushNotificationService.deviceLabel(latest),
            status.code,
            instantString(status == Status.REACHABLE ? latest.getEnabledAt() : latest.getDisabledAt()),
            latest.isEnabled() ? latest.getId() : null,
            counts.shown,
            counts.sent,
            counts.missed,
            instantString(counts.lastShownAt),
            counts.lastShownTitle,
            (int) replacements,
            latest.getBrowserMajorVersion(),
            latest.getDisplayMode(),
            PushNotificationService.installationIdPrefix(latest.getInstallationId()),
            PushNotificationService.endpointHashPrefix(latest.getEndpointHash()),
            latest.getRegistrationReason(),
            device.subscriptions.size()
        );
    }

    private List<PushResponses.PushLifecycleRecordResponse> lifecycleRecords(
        String accountId,
        Instant since,
        List<PushSubscriptionEntity> subscriptions
    ) {
        Map<String, PushSubscriptionEntity> subscriptionsById = new HashMap<>();
        subscriptions.forEach(subscription -> subscriptionsById.put(subscription.getId(), subscription));
        return lifecycleRepository.findByAccountIdOrderByOccurredAtDesc(accountId, PageRequest.of(0, MAX_LIFECYCLE_RECORDS))
            .stream()
            .filter(record -> record.getOccurredAt() != null && !record.getOccurredAt().isBefore(since))
            .map(record -> {
                PushSubscriptionEntity subscription = record.getSubscriptionId() == null
                    ? null
                    : subscriptionsById.get(record.getSubscriptionId());
                return new PushResponses.PushLifecycleRecordResponse(
                    instantString(record.getOccurredAt()),
                    subscription == null ? null : deviceKey(subscription),
                    record.getEventType(),
                    record.getReason(),
                    nullableHashPrefix(record.getEndpointHash()),
                    nullableHashPrefix(record.getPreviousEndpointHash()),
                    record.getBrowserMajorVersion(),
                    record.getDisplayMode(),
                    record.getDetail()
                );
            })
            .toList();
    }

    static String deviceKey(PushSubscriptionEntity subscription) {
        String prefix = PushNotificationService.installationIdPrefix(subscription.getInstallationId());
        return prefix == null ? EARLIER_DEVICES_KEY : "installation-" + prefix;
    }

    private static boolean isGone(PushNotificationDeliveryEntity delivery) {
        return "gone".equals(delivery.getStatus())
            || Integer.valueOf(404).equals(delivery.getHttpStatus())
            || Integer.valueOf(410).equals(delivery.getHttpStatus());
    }

    private static String nullableHashPrefix(String hash) {
        return hash == null || hash.isBlank() ? null : PushNotificationService.endpointHashPrefix(hash);
    }

    private static String lineNumberFor(String lineId) {
        return switch (lineId == null ? "" : lineId) {
            case "line-1" -> "1";
            case "line-2" -> "2";
            case "line-4" -> "4";
            case "line-5" -> "5";
            case "line-6" -> "6";
            default -> null;
        };
    }

    private static String instantString(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    enum Status {
        REACHABLE("reachable"), UNREACHABLE("unreachable"), OFF("off");
        final String code;
        Status(String code) { this.code = code; }
    }

    enum StateAt { REACHABLE, UNREACHABLE, OFF, NOT_SET_UP }

    /** One browser installation and the endpoints it has used, oldest first. */
    static final class Device {
        final String key;
        final List<PushSubscriptionEntity> subscriptions = new ArrayList<>();

        Device(String key) { this.key = key; }

        void sort() {
            subscriptions.sort(Comparator.comparing(
                (PushSubscriptionEntity subscription) -> subscription.getEnabledAt() == null ? subscription.getCreatedAt() : subscription.getEnabledAt(),
                Comparator.nullsFirst(Comparator.naturalOrder())
            ));
        }

        boolean isEarlier() { return EARLIER_DEVICES_KEY.equals(key); }

        boolean owns(PushSubscriptionEntity subscription) {
            return subscription != null && subscriptions.stream().anyMatch(own -> own.getId().equals(subscription.getId()));
        }

        PushSubscriptionEntity latest() {
            return subscriptions.stream().filter(PushSubscriptionEntity::isEnabled).reduce((first, second) -> second)
                .orElse(subscriptions.getLast());
        }

        Status status() {
            PushSubscriptionEntity latest = latest();
            if (latest.isEnabled()) return Status.REACHABLE;
            return PushNotificationService.isReplacementDisableReason(latest.getDisabledReason()) ? Status.UNREACHABLE : Status.OFF;
        }

        int statusRank() {
            return switch (status()) {
                case REACHABLE -> isEarlier() ? 2 : 0;
                case UNREACHABLE -> isEarlier() ? 2 : 0;
                case OFF -> isEarlier() ? 3 : 1;
            };
        }

        boolean relevantSince(Instant since, Map<String, List<PushNotificationDeliveryEntity>> deliveriesByEventId) {
            boolean active = subscriptions.stream().anyMatch(subscription -> subscription.isEnabled()
                || (subscription.getDisabledAt() != null && !subscription.getDisabledAt().isBefore(since)));
            if (active) return true;
            return deliveriesByEventId.values().stream().flatMap(List::stream).anyMatch(delivery -> owns(delivery.getSubscription()));
        }

        /** Whether the installation could receive pushes when an alert became eligible. */
        StateAt stateAt(Instant at) {
            PushSubscriptionEntity lastBefore = null;
            for (PushSubscriptionEntity subscription : subscriptions) {
                Instant enabledAt = subscription.getEnabledAt() == null ? subscription.getCreatedAt() : subscription.getEnabledAt();
                if (enabledAt == null || enabledAt.isAfter(at)) continue;
                Instant disabledAt = subscription.isEnabled() ? null : subscription.getDisabledAt();
                if (disabledAt == null || disabledAt.isAfter(at)) return StateAt.REACHABLE;
                if (lastBefore == null || disabledAt.isAfter(lastBefore.getDisabledAt())) lastBefore = subscription;
            }
            if (lastBefore == null) return StateAt.NOT_SET_UP;
            return PushNotificationService.isReplacementDisableReason(lastBefore.getDisabledReason())
                ? StateAt.UNREACHABLE
                : StateAt.OFF;
        }
    }

    private static final class Counts {
        int shown;
        int sent;
        int missed;
        Instant lastShownAt;
        String lastShownTitle;

        void add(PushResponses.PushAlertOutcomeResponse outcome, PushNotificationEventEntity event) {
            switch (outcome.outcome()) {
                case "shown" -> {
                    shown++;
                    sent++;
                    Instant at = outcome.at() == null ? null : Instant.parse(outcome.at());
                    if (at != null && (lastShownAt == null || at.isAfter(lastShownAt))) {
                        lastShownAt = at;
                        lastShownTitle = event.getTitle();
                    }
                }
                case "sent" -> sent++;
                case "missed" -> missed++;
                default -> { }
            }
        }
    }
}
