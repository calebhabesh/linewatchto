package com.calebhabesh.linewatch.push;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.push")
public class PushProperties {
    private boolean enabled = false;
    private String vapidPublicKey = "";
    private String vapidPrivateKey = "";
    private String vapidSubject = "mailto:linewatch@example.invalid";
    private long evaluationDelayMs = 60_000;
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

    public long getEvaluationDelayMs() {
        return evaluationDelayMs;
    }

    public void setEvaluationDelayMs(long evaluationDelayMs) {
        this.evaluationDelayMs = evaluationDelayMs;
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
