package com.calebhabesh.linewatch.feedback;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class FeedbackRateLimiter {
    private final FeedbackProperties properties;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public FeedbackRateLimiter(FeedbackProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public synchronized void requireFeedbackAttempt(String remoteAddress) {
        FeedbackProperties.RateLimit limit = properties.getRateLimit();
        if (!limit.isEnabled() || limit.getMaxRequests() <= 0) {
            return;
        }

        Instant now = clock.instant();
        String key = "feedback:" + normalizeAddress(remoteAddress);
        if (!buckets.containsKey(key) && buckets.size() >= Math.max(1, limit.getMaxBuckets())) {
            buckets.entrySet().removeIf(entry ->
                !entry.getValue().windowStart().plus(limit.getWindow()).isAfter(now)
            );
            if (buckets.size() >= Math.max(1, limit.getMaxBuckets())) {
                throw rateLimited();
            }
        }
        buckets.compute(key, (ignored, bucket) -> {
            if (bucket == null || !bucket.windowStart().plus(limit.getWindow()).isAfter(now)) {
                return new Bucket(now, 1);
            }
            if (bucket.count() >= limit.getMaxRequests()) {
                throw rateLimited();
            }
            return new Bucket(bucket.windowStart(), bucket.count() + 1);
        });
    }

    private static String normalizeAddress(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 128) {
            normalized = normalized.substring(0, 128);
        }
        return normalized.isBlank() ? "unknown" : normalized;
    }

    int bucketCount() { return buckets.size(); }

    private FeedbackException rateLimited() {
        return new FeedbackException(
            HttpStatus.TOO_MANY_REQUESTS,
            "rate_limited",
            "Too many feedback submissions. Try again later."
        );
    }

    private record Bucket(Instant windowStart, int count) {}
}
