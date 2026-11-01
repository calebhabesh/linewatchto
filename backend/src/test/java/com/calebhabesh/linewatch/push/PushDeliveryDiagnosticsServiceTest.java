package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Plan 12: diagnostics shaped by installation, one plain outcome per alert per device. */
class PushDeliveryDiagnosticsServiceTest {
    private static final String ANDROID_INSTALLATION = "ce9b4149-0000-4000-8000-000000000001";
    private static final String IPHONE_INSTALLATION = "a1b2c3d4-0000-4000-8000-000000000002";
    private static final String ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; K) Chrome/156.0.0.0 Mobile Safari/537.36";
    private static final String IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) Version/18.6 Mobile/15E148 Safari/604.1";

    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final PushNotificationEventRepository eventRepository = mock(PushNotificationEventRepository.class);
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);
    private final PushSubscriptionLifecycleEventRepository lifecycleRepository = mock(PushSubscriptionLifecycleEventRepository.class);
    private final PushProperties properties = new PushProperties();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-31T22:00:00Z"), ZoneOffset.UTC);
    private final PushDeliveryDiagnosticsService service = new PushDeliveryDiagnosticsService(
        deliveryRepository, eventRepository, subscriptionRepository, lifecycleRepository, properties, clock
    );
    private final AccountEntity account = AccountEntity.create(
        "user_1", "rider@example.com", "Rider", "$2a$hash", false, Instant.parse("2026-06-01T00:00:00Z")
    );

    private final List<PushSubscriptionEntity> subscriptions = new ArrayList<>();
    private final List<PushNotificationEventEntity> events = new ArrayList<>();
    private final List<PushNotificationDeliveryEntity> deliveries = new ArrayList<>();

    @BeforeEach
    void setUp() {
        properties.setVapidPublicKey("BExampleVapidPublicKey");
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1")).thenReturn(subscriptions);
        when(eventRepository.findByAccountIdAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(eq("user_1"), any(Instant.class)))
            .thenReturn(events);
        when(deliveryRepository.findDeliveriesForAccountSince(eq("user_1"), any(Instant.class))).thenReturn(deliveries);
        when(lifecycleRepository.findByAccountIdOrderByOccurredAtDesc(eq("user_1"), any())).thenReturn(List.of());
    }

    private PushSubscriptionEntity endpoint(String id, String installationId, String userAgent, String enabledAt) {
        String url = "https://fcm.googleapis.com/fcm/send/" + id;
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            id, account, url, PushNotificationService.hashEndpoint(url), "p256dh", "auth", userAgent,
            installationId, "refreshed", Instant.parse(enabledAt)
        );
        subscriptions.add(subscription);
        return subscription;
    }

    private PushNotificationEventEntity event(String id, String createdAt) {
        FormattedPushNotification notification = new FormattedPushNotification(
            "Line 1 Delay " + id, "Alert description", "Subject", "Finch to Union", "Direction", "TTC Line",
            Instant.parse(createdAt)
        );
        PushNotificationCandidate candidate = new PushNotificationCandidate(
            "user_1", null, null, "line-1", "1", "line-current", "delay", "on-change",
            "line-current|line-1|" + id, "line-current|line-1|delay|" + id, "dedupe|" + id, notification, "/?panel=alerts"
        );
        PushNotificationEventEntity event = PushNotificationEventEntity.create(id, candidate, Instant.parse(createdAt));
        events.add(0, event);
        return event;
    }

    private PushNotificationDeliveryEntity delivery(
        PushNotificationEventEntity event,
        PushSubscriptionEntity subscription,
        PushDeliveryResult result,
        String displayedAt
    ) {
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "delivery_" + event.getId() + "_" + subscription.getId(), event, subscription, result, event.getCreatedAt()
        );
        if (displayedAt != null) delivery.markDisplayed(Instant.parse(displayedAt));
        deliveries.add(delivery);
        return delivery;
    }

    private PushResponses.PushAlertOutcomeResponse outcome(PushResponses.PushDiagnosticsResponse response, String eventId, String deviceKey) {
        return response.alerts().stream()
            .filter(alert -> alert.id().equals(eventId))
            .findFirst().orElseThrow()
            .outcomes().stream()
            .filter(candidate -> candidate.deviceKey().equals(deviceKey))
            .findFirst().orElse(null);
    }

    @Test
    void groupsRotatedEndpointsIntoOneDeviceAndExplainsEachAlert() {
        PushSubscriptionEntity iphone = endpoint("iphone", IPHONE_INSTALLATION, IPHONE_UA, "2026-10-20T17:30:00Z");
        PushSubscriptionEntity firstAndroid = endpoint("android-1", ANDROID_INSTALLATION, ANDROID_UA, "2026-10-29T10:00:00Z");
        firstAndroid.disable(Instant.parse("2026-10-29T12:00:00Z"), "push-service-410");
        PushSubscriptionEntity secondAndroid = endpoint("android-2", ANDROID_INSTALLATION, ANDROID_UA, "2026-10-31T18:49:00Z");
        secondAndroid.continueInstallation(Instant.parse("2026-10-29T10:00:00Z"));

        PushNotificationEventEntity shownBoth = event("shown", "2026-10-29T11:00:00Z");
        delivery(shownBoth, iphone, PushDeliveryResult.accepted(201), "2026-10-29T11:00:05Z");
        delivery(shownBoth, firstAndroid, PushDeliveryResult.accepted(201), "2026-10-29T11:00:09Z");

        PushNotificationEventEntity acceptedNoReport = event("accepted", "2026-10-29T11:30:00Z");
        delivery(acceptedNoReport, iphone, PushDeliveryResult.accepted(201), "2026-10-29T11:30:05Z");
        delivery(acceptedNoReport, firstAndroid, PushDeliveryResult.accepted(201), null);

        PushNotificationEventEntity gone = event("gone", "2026-10-29T12:00:00Z");
        delivery(gone, iphone, PushDeliveryResult.accepted(201), "2026-10-29T12:00:05Z");
        delivery(gone, firstAndroid, PushDeliveryResult.gone(410), null);

        PushNotificationEventEntity whileUnreachable = event("gap", "2026-10-30T09:00:00Z");
        delivery(whileUnreachable, iphone, PushDeliveryResult.accepted(201), "2026-10-30T09:00:05Z");

        PushNotificationEventEntity caughtUp = event("caught-up", "2026-10-31T18:00:00Z");
        delivery(caughtUp, iphone, PushDeliveryResult.accepted(201), "2026-10-31T18:00:05Z");
        PushNotificationDeliveryEntity catchUp = PushNotificationDeliveryEntity.catchUp(
            "delivery_catch_up", caughtUp, secondAndroid, PushDeliveryResult.accepted(201), Instant.parse("2026-10-31T18:50:00Z")
        );
        catchUp.markDisplayed(Instant.parse("2026-10-31T18:50:04Z"));
        deliveries.add(catchUp);

        PushResponses.PushDiagnosticsResponse response = service.forAccount("user_1");

        assertThat(response.devices()).hasSize(2);
        String androidKey = "installation-ce9b4149";
        String iphoneKey = "installation-a1b2c3d4";
        PushResponses.PushDeviceDiagnosticResponse android = response.devices().stream()
            .filter(device -> device.key().equals(androidKey)).findFirst().orElseThrow();
        assertThat(android.label()).isEqualTo("Android Chrome");
        assertThat(android.status()).isEqualTo("reachable");
        assertThat(android.currentSubscriptionId()).isEqualTo("android-2");
        assertThat(android.endpointCount()).isEqualTo(2);
        assertThat(android.replacements()).isEqualTo(1);
        assertThat(android.shown()).isEqualTo(2);
        assertThat(android.sentWhileReachable()).isEqualTo(3);
        assertThat(android.missedWhileUnreachable()).isEqualTo(2);
        assertThat(android.lastShownTitle()).isEqualTo("Line 1 Delay caught-up");

        assertThat(outcome(response, "shown", androidKey).outcome()).isEqualTo("shown");
        assertThat(outcome(response, "accepted", androidKey).outcome()).isEqualTo("sent");
        assertThat(outcome(response, "gone", androidKey).outcome()).isEqualTo("missed");
        assertThat(outcome(response, "gap", androidKey).outcome()).isEqualTo("missed");
        assertThat(outcome(response, "gap", androidKey).reason()).isNull();
        PushResponses.PushAlertOutcomeResponse caught = outcome(response, "caught-up", androidKey);
        assertThat(caught.outcome()).isEqualTo("shown");
        assertThat(caught.catchUp()).isTrue();
        assertThat(caught.technical()).contains("catch-up");
        assertThat(outcome(response, "gap", iphoneKey).outcome()).isEqualTo("shown");

        // Hash prefixes only: no raw endpoint anywhere in the response.
        assertThat(response.toString()).doesNotContain("fcm.googleapis.com");
        assertThat(response.technical().vapidKeyFingerprint()).hasSize(12);
    }

    @Test
    void reportsUnreachableAndOffDevicesInPlainOutcomes() {
        PushSubscriptionEntity android = endpoint("android", ANDROID_INSTALLATION, ANDROID_UA, "2026-10-28T10:00:00Z");
        android.disable(Instant.parse("2026-10-29T06:05:00Z"), "push-service-410");
        PushSubscriptionEntity iphone = endpoint("iphone", IPHONE_INSTALLATION, IPHONE_UA, "2026-10-28T10:00:00Z");
        iphone.disable(Instant.parse("2026-10-29T06:00:00Z"), "user-disabled");
        PushNotificationEventEntity later = event("later", "2026-10-30T09:00:00Z");
        PushNotificationEventEntity before = event("before", "2026-10-25T09:00:00Z");

        PushResponses.PushDiagnosticsResponse response = service.forAccount("user_1");

        PushResponses.PushDeviceDiagnosticResponse androidDevice = response.devices().stream()
            .filter(device -> device.key().equals("installation-ce9b4149")).findFirst().orElseThrow();
        assertThat(androidDevice.status()).isEqualTo("unreachable");
        assertThat(androidDevice.statusSince()).isEqualTo("2026-10-29T06:05:00Z");
        assertThat(androidDevice.currentSubscriptionId()).isNull();
        PushResponses.PushDeviceDiagnosticResponse iphoneDevice = response.devices().stream()
            .filter(device -> device.key().equals("installation-a1b2c3d4")).findFirst().orElseThrow();
        assertThat(iphoneDevice.status()).isEqualTo("off");

        assertThat(outcome(response, "later", "installation-ce9b4149").outcome()).isEqualTo("missed");
        PushResponses.PushAlertOutcomeResponse off = outcome(response, "later", "installation-a1b2c3d4");
        assertThat(off.outcome()).isEqualTo("not-sent");
        assertThat(off.reason()).isEqualTo("notifications were off on this device");
        // A device set up after an alert has no line for it.
        assertThat(response.alerts().stream().filter(alert -> alert.id().equals("before")).toList()).isEmpty();
    }

    @Test
    void groupsEndpointsWithoutAnInstallationAsEarlierDevices() {
        PushSubscriptionEntity legacy = endpoint("legacy", null, ANDROID_UA, "2026-10-28T10:00:00Z");
        legacy.disable(Instant.parse("2026-10-29T06:05:00Z"), "historical-push-service-gone");

        PushResponses.PushDiagnosticsResponse response = service.forAccount("user_1");

        assertThat(response.devices()).singleElement().satisfies(device -> {
            assertThat(device.key()).isEqualTo("earlier");
            assertThat(device.label()).isEqualTo("Earlier Devices");
        });
    }

    @Test
    void returnsNothingForBlankAccountAndNeverQueriesAnotherAccount() {
        PushResponses.PushDiagnosticsResponse response = service.forAccount(" ");

        assertThat(response.devices()).isEmpty();
        assertThat(response.alerts()).isEmpty();
        verify(subscriptionRepository, never()).findByAccountIdOrderByUpdatedAtDesc(any());
    }
}
