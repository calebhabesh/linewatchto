package com.calebhabesh.linewatch.feedback;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.feedback")
public class FeedbackProperties {
    private boolean enabled = false;
    private String from = "no-reply@linewatch.local";
    private String to = "feedback@linewatchto.ca";
    private int maxMessageLength = 2000;
    private RateLimit rateLimit = new RateLimit();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = from;
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public int getMaxMessageLength() {
        return maxMessageLength;
    }

    public void setMaxMessageLength(int maxMessageLength) {
        this.maxMessageLength = maxMessageLength;
    }

    public RateLimit getRateLimit() {
        return rateLimit;
    }

    public void setRateLimit(RateLimit rateLimit) {
        this.rateLimit = rateLimit;
    }

    public static class RateLimit {
        private boolean enabled = true;
        private Duration window = Duration.ofMinutes(15);
        private int maxRequests = 5;
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

        public int getMaxRequests() {
            return maxRequests;
        }

        public void setMaxRequests(int maxRequests) {
            this.maxRequests = maxRequests;
        }

        public int getMaxBuckets() { return maxBuckets; }
        public void setMaxBuckets(int maxBuckets) { this.maxBuckets = maxBuckets; }
    }
}
