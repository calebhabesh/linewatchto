package com.calebhabesh.linewatch.account;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.auth.rate-limit")
public class AccountRateLimitProperties {
    private boolean enabled = true;
    private Duration window = Duration.ofMinutes(15);
    private int authMaxRequests = 12;
    private int passwordResetMaxRequests = 5;
    private int emailVerificationMaxRequests = 5;
    private int demoMaxRequests = 20;
    private int preferenceMutationMaxRequests = 120;
    private int maxBuckets = 10_000;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Duration getWindow() {
        return window;
    }

    public void setWindow(Duration window) {
        this.window = window;
    }

    public int getAuthMaxRequests() {
        return authMaxRequests;
    }

    public void setAuthMaxRequests(int authMaxRequests) {
        this.authMaxRequests = authMaxRequests;
    }

    public int getPasswordResetMaxRequests() {
        return passwordResetMaxRequests;
    }

    public void setPasswordResetMaxRequests(int passwordResetMaxRequests) {
        this.passwordResetMaxRequests = passwordResetMaxRequests;
    }

    public int getEmailVerificationMaxRequests() {
        return emailVerificationMaxRequests;
    }

    public void setEmailVerificationMaxRequests(int emailVerificationMaxRequests) {
        this.emailVerificationMaxRequests = emailVerificationMaxRequests;
    }

    public int getDemoMaxRequests() {
        return demoMaxRequests;
    }

    public void setDemoMaxRequests(int demoMaxRequests) {
        this.demoMaxRequests = demoMaxRequests;
    }

    public int getPreferenceMutationMaxRequests() {
        return preferenceMutationMaxRequests;
    }

    public void setPreferenceMutationMaxRequests(int preferenceMutationMaxRequests) {
        this.preferenceMutationMaxRequests = preferenceMutationMaxRequests;
    }

    public int getMaxBuckets() { return maxBuckets; }
    public void setMaxBuckets(int maxBuckets) { this.maxBuckets = maxBuckets; }
}
