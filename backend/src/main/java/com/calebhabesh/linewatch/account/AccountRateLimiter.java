package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class AccountRateLimiter {
    private final AccountRateLimitProperties properties;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public AccountRateLimiter(AccountRateLimitProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public void requireAuthAttempt(String operation, String remoteAddress) {
        check("auth:" + normalize(operation) + ":" + normalizeAddress(remoteAddress), properties.getAuthMaxRequests());
    }

    public void requireDemoAttempt(String remoteAddress) {
        check("demo:" + normalizeAddress(remoteAddress), properties.getDemoMaxRequests());
    }

    public void requirePasswordResetAttempt(String remoteAddress, String email) {
        check("password-reset-ip:" + normalizeAddress(remoteAddress), properties.getPasswordResetMaxRequests());
        check("password-reset-email:" + normalize(email), properties.getPasswordResetMaxRequests());
    }

    public void requirePreferenceMutation(String accountId) {
        check("preference:" + normalize(accountId), properties.getPreferenceMutationMaxRequests());
    }

    public static String clientAddress(HttpServletRequest request) {
        String cloudflare = firstHeaderValue(request.getHeader("CF-Connecting-IP"));
        if (!cloudflare.isBlank()) {
            return cloudflare;
        }
        String forwardedFor = firstHeaderValue(request.getHeader("X-Forwarded-For"));
        if (!forwardedFor.isBlank()) {
            return forwardedFor;
        }
        String remote = request.getRemoteAddr();
        return remote == null || remote.isBlank() ? "unknown" : remote.trim();
    }

    private void check(String key, int maxRequests) {
        if (!properties.isEnabled() || maxRequests <= 0) {
            return;
        }
        Instant now = clock.instant();
        buckets.compute(key, (ignored, bucket) -> {
            if (bucket == null || !bucket.windowStart().plus(properties.getWindow()).isAfter(now)) {
                return new Bucket(now, 1);
            }
            if (bucket.count() >= maxRequests) {
                throw new AccountException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "rate_limited",
                    "Too many attempts. Try again later."
                );
            }
            return new Bucket(bucket.windowStart(), bucket.count() + 1);
        });
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeAddress(String value) {
        String normalized = normalize(value);
        return normalized.isBlank() ? "unknown" : normalized;
    }

    private static String firstHeaderValue(String header) {
        if (header == null || header.isBlank()) {
            return "";
        }
        return header.split(",", 2)[0].trim();
    }

    private record Bucket(Instant windowStart, int count) {}
}
