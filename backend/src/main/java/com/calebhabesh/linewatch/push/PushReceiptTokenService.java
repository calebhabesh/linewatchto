package com.calebhabesh.linewatch.push;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;

@Service
class PushReceiptTokenService {
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private final PushProperties properties;

    PushReceiptTokenService(PushProperties properties) {
        this.properties = properties;
    }

    String tokenFor(PushNotificationDeliveryEntity delivery) {
        return tokenFor(delivery.getId(), delivery.getSubscription(), delivery.getEvent());
    }

    String tokenFor(
        String deliveryId,
        PushSubscriptionEntity subscription,
        PushNotificationEventEntity event
    ) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret().getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(mac.doFinal(tokenMaterial(deliveryId, subscription, event).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not sign push receipt token", ex);
        }
    }

    boolean matches(PushNotificationDeliveryEntity delivery, String token) {
        if (delivery == null || token == null || token.isBlank()) {
            return false;
        }
        byte[] expected = tokenFor(delivery).getBytes(StandardCharsets.US_ASCII);
        byte[] actual = token.trim().getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(expected, actual);
    }

    private String tokenMaterial(
        String deliveryId,
        PushSubscriptionEntity subscription,
        PushNotificationEventEntity event
    ) {
        return String.join("\n",
            safe(deliveryId),
            safe(event.getId()),
            safe(event.getAccountId()),
            safe(subscription.getId()),
            safe(subscription.getEndpointHash()),
            safe(event.getNotificationKey()),
            safe(event.getNotificationState())
        );
    }

    private String secret() {
        String configured = properties.getReceiptSigningSecret();
        if (configured != null && !configured.isBlank()) {
            return configured.trim();
        }
        String vapidPrivateKey = properties.getVapidPrivateKey();
        if (vapidPrivateKey != null && !vapidPrivateKey.isBlank()) {
            return vapidPrivateKey.trim();
        }
        throw new IllegalStateException("Push receipt signing secret is not configured.");
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
