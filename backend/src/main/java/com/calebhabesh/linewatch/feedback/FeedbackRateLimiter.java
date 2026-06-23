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

    public void requireFeedbackAttempt(String remoteAddress) {
        FeedbackProperties.RateLimit limit = properties.getRateLimit();
        if (!limit.isEnabled() || limit.getMaxRequests() <= 0) {
            return;
        }

        Instant now = clock.instant();
        String key = "feedback:" + normalizeAddress(remoteAddress);
        buckets.compute(key, (ignored, bucket) -> {
            if (bucket == null || !bucket.windowStart().plus(limit.getWindow()).isAfter(now)) {
                return new Bucket(now, 1);
            }
            if (bucket.count() >= limit.getMaxRequests()) {
                throw new FeedbackException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "rate_limited",
                    "Too many feedback submissions. Try again later."
                );
            }
            return new Bucket(bucket.windowStart(), bucket.count() + 1);
        });
    }

    private static String normalizeAddress(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? "unknown" : normalized;
    }

    private record Bucket(Instant windowStart, int count) {}
}
