package com.calebhabesh.linewatch.push;

public interface WebPushClient {
    PushDeliveryResult send(PushSubscriptionEntity subscription, String topic, WebPushPayload payload);
}
