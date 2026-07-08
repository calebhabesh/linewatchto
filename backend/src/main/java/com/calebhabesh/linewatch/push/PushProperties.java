package com.calebhabesh.linewatch.push;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.push")
public class PushProperties {
    private boolean enabled = false;
    private String vapidPublicKey = "";
    private String vapidPrivateKey = "";
    private String vapidSubject = "mailto:linewatch@example.invalid";
    private String receiptSigningSecret = "";
    private long evaluationDelayMs = 60_000;
    private Duration activeDeliveryTtl = Duration.ofHours(1);
    private Duration activeDisplayTtl = Duration.ofMinutes(10);
    private Duration clearedDeliveryTtl = Duration.ofHours(24);
    private Duration clearedNotificationRetention = Duration.ofHours(24);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getVapidPublicKey() {
        return vapidPublicKey;
    }

    public void setVapidPublicKey(String vapidPublicKey) {
        this.vapidPublicKey = vapidPublicKey;
    }

    public String getVapidPrivateKey() {
        return vapidPrivateKey;
    }

    public void setVapidPrivateKey(String vapidPrivateKey) {
        this.vapidPrivateKey = vapidPrivateKey;
    }

    public String getVapidSubject() {
        return vapidSubject;
    }

    public void setVapidSubject(String vapidSubject) {
        this.vapidSubject = vapidSubject;
    }

    public String getReceiptSigningSecret() {
        return receiptSigningSecret;
    }

    public void setReceiptSigningSecret(String receiptSigningSecret) {
        this.receiptSigningSecret = receiptSigningSecret;
    }

    public long getEvaluationDelayMs() {
        return evaluationDelayMs;
    }

    public void setEvaluationDelayMs(long evaluationDelayMs) {
        this.evaluationDelayMs = evaluationDelayMs;
    }

    public Duration getActiveDeliveryTtl() {
        return activeDeliveryTtl;
    }

    public void setActiveDeliveryTtl(Duration activeDeliveryTtl) {
        this.activeDeliveryTtl = activeDeliveryTtl;
    }

    public Duration getActiveDisplayTtl() {
        return activeDisplayTtl;
    }

    public void setActiveDisplayTtl(Duration activeDisplayTtl) {
        this.activeDisplayTtl = activeDisplayTtl;
    }

    public Duration getClearedDeliveryTtl() {
        return clearedDeliveryTtl;
    }

    public void setClearedDeliveryTtl(Duration clearedDeliveryTtl) {
        this.clearedDeliveryTtl = clearedDeliveryTtl;
    }

    public Duration deliveryTtlForState(String state) {
        boolean cleared = "CLEARED".equalsIgnoreCase(state);
        Duration ttl = cleared ? clearedDeliveryTtl : activeDeliveryTtl;
        if (ttl == null || ttl.isZero() || ttl.isNegative()) {
            return cleared ? Duration.ofHours(24) : Duration.ofHours(1);
        }
        return ttl;
    }

    public Duration displayTtlForState(String state) {
        boolean cleared = "CLEARED".equalsIgnoreCase(state);
        Duration ttl = cleared ? clearedDeliveryTtl : activeDisplayTtl;
        if (ttl == null || ttl.isZero() || ttl.isNegative()) {
            return cleared ? Duration.ofHours(24) : Duration.ofMinutes(10);
        }
        return ttl;
    }

    public Duration getClearedNotificationRetention() {
        return clearedNotificationRetention;
    }

    public void setClearedNotificationRetention(Duration clearedNotificationRetention) {
        this.clearedNotificationRetention = clearedNotificationRetention;
    }

    public boolean webPushConfigured() {
        return !blank(vapidPublicKey) && !blank(vapidPrivateKey);
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
