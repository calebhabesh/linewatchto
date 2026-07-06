package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushReceiptTokenServiceTest {
    private final PushNotificationFormatter formatter = new PushNotificationFormatter();

    @Test
    void tokenIsBoundToDeliverySubscriptionAndEvent() {
        PushProperties properties = new PushProperties();
        properties.setVapidPrivateKey("test-receipt-secret");
        PushReceiptTokenService service = new PushReceiptTokenService(properties);
        AccountEntity account = AccountEntity.create(
            "user_1",
            "rider@example.com",
            "Rider",
            "$2a$hash",
            false,
            Instant.parse("2026-06-05T14:00:00Z")
        );
        PushNotificationCandidate candidate = candidate("line-current|line-2|suspension|ttc-route-70610");
        PushNotificationEventEntity event = PushNotificationEventEntity.create(
            "push_event_1",
            candidate,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
            "push_subscription_android",
            account,
            "https://fcm.googleapis.com/fcm/send/android",
            "android-endpoint-hash",
            "p256dh-key",
            "auth-secret",
            "Chrome Android",
            Instant.parse("2026-06-05T14:45:00Z")
        );
        PushNotificationDeliveryEntity delivery = PushNotificationDeliveryEntity.create(
            "push_delivery_1",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:05Z")
        );
        PushNotificationDeliveryEntity otherDelivery = PushNotificationDeliveryEntity.create(
            "push_delivery_2",
            event,
            subscription,
            PushDeliveryResult.accepted(202),
            Instant.parse("2026-06-05T15:00:06Z")
        );

        String token = service.tokenFor(delivery);

        assertThat(service.matches(delivery, token)).isTrue();
        assertThat(service.matches(otherDelivery, token)).isFalse();
        assertThat(token).doesNotContain("+").doesNotContain("/").doesNotContain("=");
    }

    private PushNotificationCandidate candidate(String notificationKey) {
        FormattedPushNotification notification = formatter.formatActive(new PushNotificationFacts(
            "line-2",
            "2",
            "suspension",
            "on-change",
            "Broadview to St George",
            null,
            false,
            null,
            null,
            Instant.parse("2026-06-05T14:50:00Z"),
            "security incident",
            "Line 2 Bloor-Danforth Suspension",
            "No service between Broadview and St George stations."
        ));
        return new PushNotificationCandidate(
            "user_1",
            null,
            null,
            "line-2",
            "2",
            "line-current",
            "suspension",
            "on-change",
            "line-current|line-2|ttc-route-70610",
            notificationKey,
            "user_1|line|line-2|suspension|on-change|ttc-route-70610",
            notification,
            "/?panel=alerts&impactKind=suspension&impactId=ttc-route-70610"
        );
    }
}
