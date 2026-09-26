package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;

class PushDeliveryDiagnosticsServiceTest {

    private final PushNotificationDeliveryRepository deliveryRepository = mock(PushNotificationDeliveryRepository.class);
    private final PushNotificationClientEventRepository clientEventRepository = mock(PushNotificationClientEventRepository.class);
    private final PushSubscriptionRepository subscriptionRepository = mock(PushSubscriptionRepository.class);

    private PushDeliveryDiagnosticsService service;

    private final AccountEntity account1 = AccountEntity.create(
        "user_1",
        "rider1@example.com",
        "Rider One",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    private final AccountEntity account2 = AccountEntity.create(
        "user_2",
        "rider2@example.com",
        "Rider Two",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @BeforeEach
    void setUp() {
        service = new PushDeliveryDiagnosticsService(
            deliveryRepository,
            clientEventRepository,
            subscriptionRepository
        );
    }

    @Test
    void constructorRequiresNonNullCollaborators() {
        assertThatThrownBy(() -> new PushDeliveryDiagnosticsService(null, clientEventRepository, subscriptionRepository))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("deliveryRepository");

        assertThatThrownBy(() -> new PushDeliveryDiagnosticsService(deliveryRepository, null, subscriptionRepository))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("clientEventRepository");

        assertThatThrownBy(() -> new PushDeliveryDiagnosticsService(deliveryRepository, clientEventRepository, null))
            .isInstanceOf(NullPointerException.class)
            .hasMessageContaining("subscriptionRepository");
    }

    @Test
    void forAccountReturnsEmptyWhenDeliveriesEmpty() {
        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of());

        PushResponses.PushDeliveryDiagnosticsResponse response = service.forAccount("user_1");

        assertThat(response.deliveries()).isEmpty();
        assertThat(response.notifications()).isEmpty();
        verify(clientEventRepository, never()).findByDeliveryIds(any());
        verify(subscriptionRepository, never()).findByAccountIdOrderByUpdatedAtDesc(any());
    }

    @Test
    void forAccountReturnsEmptyForNullOrBlankAccountId() {
        assertThat(service.forAccount((String) null).deliveries()).isEmpty();
        assertThat(service.forAccount("   ").deliveries()).isEmpty();
        assertThat(service.forAccount((AccountEntity) null).deliveries()).isEmpty();

        verify(deliveryRepository, never()).findRecentDeliveriesForAccount(any(), any());
    }

    @Test
    void forAccountEnforcesMaxFiftyDeliveriesCap() {
        when(deliveryRepository.findRecentDeliveriesForAccount(eq("user_1"), any(PageRequest.class)))
            .thenReturn(List.of());

        service.forAccount("user_1");

        verify(deliveryRepository).findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50));
    }

    @Test
    void forAccountCannotReadRecordsFromDifferentAccount() {
        // Setup records for user_1
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate("line-1", "1", "delay", "on-change", "St Andrew", Instant.parse("2026-06-05T14:50:00Z")),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity sub1 = PushSubscriptionEntity.create(
            "sub_user_1",
            account1,
            "https://fcm.googleapis.com/fcm/send/user1",
            PushNotificationService.hashEndpoint("https://fcm.googleapis.com/fcm/send/user1"),
            "p256dh",
            "auth",
            "Pixel",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationDeliveryEntity delivery1 = PushNotificationDeliveryEntity.create(
            "delivery_1",
            event,
            sub1,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(delivery1));
        when(deliveryRepository.findRecentDeliveriesForAccount("user_2", PageRequest.of(0, 50)))
            .thenReturn(List.of());

        // Account 2 queries diagnostics
        PushResponses.PushDeliveryDiagnosticsResponse response2 = service.forAccount("user_2");
        assertThat(response2.deliveries()).isEmpty();
        assertThat(response2.notifications()).isEmpty();

        // Account 1 queries diagnostics
        when(clientEventRepository.findByDeliveryIds(List.of("delivery_1"))).thenReturn(List.of());
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1")).thenReturn(List.of(sub1));

        PushResponses.PushDeliveryDiagnosticsResponse response1 = service.forAccount(account1);
        assertThat(response1.deliveries()).hasSize(1);
        assertThat(response1.deliveries().getFirst().id()).isEqualTo("delivery_1");
        assertThat(response1.notifications().getFirst().recipients().getFirst().subscriptionId()).isEqualTo("sub_user_1");

        // Verify account isolation at repository boundary
        verify(deliveryRepository).findRecentDeliveriesForAccount("user_2", PageRequest.of(0, 50));
        verify(deliveryRepository).findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50));
        verify(subscriptionRepository, never()).findByAccountIdOrderByUpdatedAtDesc("user_2");
    }

    @Test
    void forAccountReturnsRecentPerDeviceDeliveryTimeline() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/android";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate("line-2", "2", "suspension", "on-change", "Victoria Park to Kennedy", Instant.parse("2026-06-05T14:50:00Z")),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account1,
            endpoint,
            endpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );
        PushNotificationClientEventEntity received = PushNotificationClientEventEntity.create(
            "push_client_event_1",
            account1.getId(),
            subscription,
            delivery,
            endpointHash,
            "line-current|line-2|suspension|ttc-route-70610",
            "ACTIVE",
            "push_received",
            null,
            Instant.parse("2026-06-05T15:00:07Z"),
            Instant.parse("2026-06-05T15:00:08Z")
        );
        PushNotificationClientEventEntity displayed = PushNotificationClientEventEntity.create(
            "push_client_event_2",
            account1.getId(),
            subscription,
            delivery,
            endpointHash,
            "line-current|line-2|suspension|ttc-route-70610",
            "ACTIVE",
            "displayed_acknowledged",
            null,
            Instant.parse("2026-06-05T15:00:09Z"),
            Instant.parse("2026-06-05T15:00:10Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(delivery));
        when(clientEventRepository.findByDeliveryIds(List.of("push_delivery_1")))
            .thenReturn(List.of(displayed, received)); // passed unordered to test sorting
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1"))
            .thenReturn(List.of(subscription));

        PushResponses.PushDeliveryDiagnosticsResponse response = service.forAccount("user_1");

        assertThat(response.deliveries()).hasSize(1);
        PushResponses.PushDeliveryDiagnosticResponse diagnostic = response.deliveries().getFirst();
        assertThat(diagnostic.id()).isEqualTo("push_delivery_1");
        assertThat(diagnostic.deviceLabel()).isEqualTo("Android Chrome");
        assertThat(diagnostic.endpointHashPrefix()).isEqualTo(endpointHash.substring(0, 12));
        assertThat(diagnostic.tag()).isEqualTo("line-current|line-2|suspension|ttc-route-70610|active");
        assertThat(diagnostic.deliveryStatus()).isEqualTo("accepted");
        assertThat(diagnostic.httpStatus()).isEqualTo(202);
        assertThat(diagnostic.displayedAt()).isNull();
        assertThat(diagnostic.attemptCount()).isEqualTo(1);
        assertThat(diagnostic.clientEvents())
            .extracting(PushResponses.PushClientEventResponse::stage)
            .containsExactly("push_received", "displayed_acknowledged");
    }

    @Test
    void forAccountReturnsGroupedNotificationAttempts() {
        String androidEndpoint = "https://fcm.googleapis.com/fcm/send/android";
        String androidEndpointHash = PushNotificationService.hashEndpoint(androidEndpoint);
        String iosEndpoint = "https://webpush.push.apple.com/ios";
        String iosEndpointHash = PushNotificationService.hashEndpoint(iosEndpoint);
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate("line-2", "2", "suspension", "on-change", "Victoria Park to Kennedy", Instant.parse("2026-06-05T14:50:00Z")),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account1,
            androidEndpoint,
            androidEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account1,
            iosEndpoint,
            iosEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationDeliveryEntity androidDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_android",
            event,
            androidSubscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );
        PushNotificationDeliveryEntity iosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            event,
            iosSubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T15:00:06Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(iosDelivery, androidDelivery));
        when(clientEventRepository.findByDeliveryIds(List.of("push_delivery_ios", "push_delivery_android")))
            .thenReturn(List.of());
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription));

        PushResponses.PushDeliveryDiagnosticsResponse response = service.forAccount("user_1");

        assertThat(response.deliveries()).hasSize(2);
        assertThat(response.notifications()).hasSize(1);
        PushResponses.PushNotificationDiagnosticGroupResponse notification = response.notifications().getFirst();
        assertThat(notification.id()).isEqualTo("push_event_1");
        assertThat(notification.notificationKey()).isEqualTo("line-current|line-2|suspension|ttc-route-70610");
        assertThat(notification.sourceIncidentKey()).isEqualTo("line-current|line-2|ttc-route-70610");
        assertThat(notification.attempts())
            .extracting(PushResponses.PushDeliveryDiagnosticResponse::deviceLabel)
            .containsExactly("iOS Safari", "Android Chrome");
        assertThat(notification.attempts())
            .extracting(PushResponses.PushDeliveryDiagnosticResponse::endpointHashPrefix)
            .containsExactly(iosEndpointHash.substring(0, 12), androidEndpointHash.substring(0, 12));
    }

    @Test
    void forAccountIncludesRecipientsThatWereNotAttempted() {
        String iosEndpoint = "https://webpush.push.apple.com/ios";
        String iosEndpointHash = PushNotificationService.hashEndpoint(iosEndpoint);
        String androidEndpoint = "https://fcm.googleapis.com/fcm/send/android";
        String androidEndpointHash = PushNotificationService.hashEndpoint(androidEndpoint);
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate("line-1", "1", "delay", "on-change", "St Andrew station", Instant.parse("2026-06-05T14:50:00Z")),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity iosSubscription = PushSubscriptionEntity.create(
            "push_subscription_ios",
            account1,
            iosEndpoint,
            iosEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Mobile Safari iPhone",
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PushSubscriptionEntity androidSubscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account1,
            androidEndpoint,
            androidEndpointHash,
            "p256dh-key",
            "auth-secret",
            "Chrome Android Pixel 6a",
            Instant.parse("2026-06-05T20:30:00Z")
        );
        PushNotificationDeliveryEntity iosDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_ios",
            event,
            iosSubscription,
            PushDeliveryResult.accepted(201),
            Instant.parse("2026-06-05T15:00:05Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(iosDelivery));
        when(clientEventRepository.findByDeliveryIds(List.of("push_delivery_ios")))
            .thenReturn(List.of());
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1"))
            .thenReturn(List.of(androidSubscription, iosSubscription));

        PushResponses.PushDeliveryDiagnosticsResponse response = service.forAccount("user_1");

        PushResponses.PushNotificationDiagnosticGroupResponse notification = response.notifications().getFirst();
        assertThat(notification.recipients())
            .extracting(PushResponses.PushRecipientDiagnosticResponse::deviceLabel)
            .containsExactly("Android Chrome", "iOS Safari");
        PushResponses.PushRecipientDiagnosticResponse androidRecipient = notification.recipients().getFirst();
        assertThat(androidRecipient.status()).isEqualTo("not-attempted");
        assertThat(androidRecipient.reasonCode()).isEqualTo("subscription-registered-after-event");
        assertThat(androidRecipient.reason()).isEqualTo("Device was enabled after this notification became eligible.");
        assertThat(androidRecipient.delivery()).isNull();
        PushResponses.PushRecipientDiagnosticResponse iosRecipient = notification.recipients().get(1);
        assertThat(iosRecipient.status()).isEqualTo("attempted");
        assertThat(iosRecipient.delivery().id()).isEqualTo("push_delivery_ios");
    }

    @Test
    void forAccountIdentifiesDisabledSubscriptionsAndReasonCodes() {
        String endpoint = "https://fcm.googleapis.com/fcm/send/disabled-device";
        String endpointHash = PushNotificationService.hashEndpoint(endpoint);
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate("line-1", "1", "delay", "on-change", "St Andrew station", Instant.parse("2026-06-05T15:00:00Z")),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity activeSub = PushSubscriptionEntity.create(
            "sub_active", account1, "https://fcm.googleapis.com/fcm/send/active", "active-hash", "p256", "auth", "Android", Instant.parse("2026-06-05T14:00:00Z")
        );
        PushSubscriptionEntity disabledBeforeSub = PushSubscriptionEntity.create(
            "sub_disabled_before", account1, endpoint, endpointHash, "p256", "auth", "Android", Instant.parse("2026-06-05T12:00:00Z")
        );
        disabledBeforeSub.disable(Instant.parse("2026-06-05T14:30:00Z"), "user-disabled");

        PushSubscriptionEntity disabledAfterSub = PushSubscriptionEntity.create(
            "sub_disabled_after", account1, "https://fcm.googleapis.com/fcm/send/other", "other-hash", "p256", "auth", "iOS", Instant.parse("2026-06-05T12:00:00Z")
        );
        disabledAfterSub.disable(Instant.parse("2026-06-05T16:00:00Z"), "user-disabled");

        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "delivery_active", event, activeSub, PushDeliveryResult.accepted(202), Instant.parse("2026-06-05T15:00:05Z")
        );

        when(deliveryRepository.findRecentDeliveriesForAccount("user_1", PageRequest.of(0, 50)))
            .thenReturn(List.of(delivery));
        when(clientEventRepository.findByDeliveryIds(List.of("delivery_active"))).thenReturn(List.of());
        when(subscriptionRepository.findByAccountIdOrderByUpdatedAtDesc("user_1"))
            .thenReturn(List.of(activeSub, disabledBeforeSub, disabledAfterSub));

        PushResponses.PushDeliveryDiagnosticsResponse response = service.forAccount("user_1");

        PushResponses.PushNotificationDiagnosticGroupResponse group = response.notifications().getFirst();
        List<PushResponses.PushRecipientDiagnosticResponse> recipients = group.recipients();
        assertThat(recipients).hasSize(3);

        PushResponses.PushRecipientDiagnosticResponse beforeRecipient = recipients.stream()
            .filter(r -> r.subscriptionId().equals("sub_disabled_before"))
            .findFirst()
            .orElseThrow();
        assertThat(beforeRecipient.status()).isEqualTo("not-attempted");
        assertThat(beforeRecipient.reasonCode()).isEqualTo("subscription-disabled-before-event");

        PushResponses.PushRecipientDiagnosticResponse afterRecipient = recipients.stream()
            .filter(r -> r.subscriptionId().equals("sub_disabled_after"))
            .findFirst()
            .orElseThrow();
        assertThat(afterRecipient.status()).isEqualTo("not-attempted");
        assertThat(afterRecipient.reasonCode()).isEqualTo("subscription-disabled");
    }

    @Test
    void toDiagnosticResponseFormatsEventAndDeliveryFields() {
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate("line-4", "4", "delay", "on-change", "Bessarion", Instant.parse("2026-06-05T15:00:00Z")),
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity sub = PushSubscriptionEntity.create(
            "sub_1", account1, "https://fcm.googleapis.com/fcm/send/test", "hash12345678901234", "p256", "auth", "Android Firefox", Instant.parse("2026-06-05T14:00:00Z")
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "delivery_1", event, sub, PushDeliveryResult.accepted(202), Instant.parse("2026-06-05T15:00:05Z")
        );

        PushResponses.PushDeliveryDiagnosticResponse response = service.toDiagnosticResponse(delivery, List.of());

        assertThat(response.id()).isEqualTo("delivery_1");
        assertThat(response.lineId()).isEqualTo("line-4");
        assertThat(response.lineNumber()).isEqualTo("4");
        assertThat(response.deviceLabel()).isEqualTo("Android Firefox");
        assertThat(response.endpointHashPrefix()).isEqualTo("hash12345678");
        assertThat(response.deliveryStatus()).isEqualTo("accepted");
        assertThat(response.httpStatus()).isEqualTo(202);
        assertThat(response.clientEvents()).isEmpty();
    }

    private static PushNotificationCandidate candidate(
        String lineId,
        String lineNumber,
        String impactKind,
        String alertPhase,
        String scope,
        Instant sourceUpdatedAt
    ) {
        String key = "line-current|" + lineId + "|" + impactKind + "|ttc-route-70610";
        FormattedPushNotification notification = new FormattedPushNotification(
            "Line " + lineNumber + " alert",
            "Alert description",
            "Subject",
            scope,
            "Direction",
            "TTC Line",
            sourceUpdatedAt
        );
        return new PushNotificationCandidate(
            "user_1",
            null,
            null,
            lineId,
            lineNumber,
            "line-current",
            impactKind,
            alertPhase,
            "line-current|" + lineId + "|ttc-route-70610",
            key,
            "dedupe|" + lineId,
            notification,
            "/?panel=alerts"
        );
    }
}
