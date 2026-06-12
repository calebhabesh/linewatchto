package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationService {
    private final PushProperties properties;
    private final PushSubscriptionRepository subscriptionRepository;
    private final PushNotificationDeliveryRepository deliveryRepository;
    private final Clock clock;

    @Autowired
    public PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository
    ) {
        this(properties, subscriptionRepository, deliveryRepository, Clock.systemUTC());
    }

    PushNotificationService(
        PushProperties properties,
        PushSubscriptionRepository subscriptionRepository,
        PushNotificationDeliveryRepository deliveryRepository,
        Clock clock
    ) {
        this.properties = properties;
        this.subscriptionRepository = subscriptionRepository;
        this.deliveryRepository = deliveryRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PushResponses.PushConfigResponse config(AccountEntity account) {
        PushResponses.PushPreferencesResponse preferences = subscriptionRepository
            .findByAccountIdAndEnabledTrue(account.getId())
            .stream()
            .findFirst()
            .map(this::preferences)
            .orElse(new PushResponses.PushPreferencesResponse(true, true));
        return new PushResponses.PushConfigResponse(
            properties.webPushConfigured(),
            properties.getVapidPublicKey() == null ? "" : properties.getVapidPublicKey().trim(),
            preferences
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
        PushSubscriptionEntity subscription = subscriptionRepository.findByAccountIdAndEnabledTrue(account.getId())
            .stream()
            .findFirst()
            .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "push_subscription_not_found", "Enable notifications before changing notification preferences."));
        subscription.updatePreferences(
            request.commuteNotificationsEnabled(),
            request.plannedClosureNotificationsEnabled(),
            clock.instant()
        );
        return toResponse(subscriptionRepository.save(subscription));
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
                    event.getCategory() + "|" + event.getCommuteId() + "|" + event.getDedupeKey()
                ));
            })
            .orElse(new PushResponses.PendingPushNotificationResponse(null));
    }

    private PushResponses.PushSubscriptionResponse toResponse(PushSubscriptionEntity subscription) {
        return new PushResponses.PushSubscriptionResponse(
            subscription.getId(),
            subscription.isEnabled(),
            subscription.isCommuteNotificationsEnabled(),
            subscription.isPlannedClosureNotificationsEnabled()
        );
    }

    private PushResponses.PushPreferencesResponse preferences(PushSubscriptionEntity subscription) {
        return new PushResponses.PushPreferencesResponse(
            subscription.isCommuteNotificationsEnabled(),
            subscription.isPlannedClosureNotificationsEnabled()
        );
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
