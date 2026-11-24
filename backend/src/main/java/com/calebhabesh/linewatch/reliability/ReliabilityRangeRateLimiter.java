package com.calebhabesh.linewatch.reliability;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Fixed-window per-client limits for the range API, following {@code FeedbackRateLimiter}:
 * one budget for uncached range computations and one for CSV exports. Cached responses are
 * never counted.
 */
@Component
public class ReliabilityRangeRateLimiter {
    private final ReliabilityRangeProperties properties;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public ReliabilityRangeRateLimiter(ReliabilityRangeProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public void requireComputation(String remoteAddress) {
        require("compute:", remoteAddress, properties.getRateLimit().getMaxComputations(),
            "Too many uncached reliability ranges. Try again in a few minutes, or choose a preset range.");
    }

    public void requireExport(String remoteAddress) {
        require("export:", remoteAddress, properties.getRateLimit().getMaxExports(),
            "Too many reliability exports. Try again in a few minutes.");
    }

    private synchronized void require(String kind, String remoteAddress, int maxRequests, String message) {
        ReliabilityRangeProperties.RateLimit limit = properties.getRateLimit();
        if (!limit.isEnabled() || maxRequests <= 0) {
            return;
        }
        Instant now = clock.instant();
        String key = kind + normalizeAddress(remoteAddress);
        if (!buckets.containsKey(key) && buckets.size() >= Math.max(1, limit.getMaxBuckets())) {
            buckets.entrySet().removeIf(entry -> !entry.getValue().windowStart().plus(limit.getWindow()).isAfter(now));
            if (buckets.size() >= Math.max(1, limit.getMaxBuckets())) {
                throw rateLimited(message);
            }
        }
        buckets.compute(key, (ignored, bucket) -> {
            if (bucket == null || !bucket.windowStart().plus(limit.getWindow()).isAfter(now)) {
                return new Bucket(now, 1);
            }
            if (bucket.count() >= maxRequests) {
                throw rateLimited(message);
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

    int bucketCount() {
        return buckets.size();
    }

    private static ReliabilityRangeException rateLimited(String message) {
        return new ReliabilityRangeException(HttpStatus.TOO_MANY_REQUESTS, "rate_limited", message);
    }

    private record Bucket(Instant windowStart, int count) {}
}
