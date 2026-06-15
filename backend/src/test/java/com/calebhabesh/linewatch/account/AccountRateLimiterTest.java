package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class AccountRateLimiterTest {

    @Test
    void blocksAuthAttemptsAfterConfiguredWindowLimit() {
        MutableClock clock = new MutableClock(Instant.parse("2026-06-15T14:00:00Z"));
        AccountRateLimitProperties properties = new AccountRateLimitProperties();
        properties.setWindow(Duration.ofMinutes(15));
        properties.setAuthMaxRequests(2);
        AccountRateLimiter limiter = new AccountRateLimiter(properties, clock);

        limiter.requireAuthAttempt("login", "203.0.113.10");
        limiter.requireAuthAttempt("login", "203.0.113.10");

        assertThatThrownBy(() -> limiter.requireAuthAttempt("login", "203.0.113.10"))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void resetsAuthAttemptsAfterWindowExpires() {
        MutableClock clock = new MutableClock(Instant.parse("2026-06-15T14:00:00Z"));
        AccountRateLimitProperties properties = new AccountRateLimitProperties();
        properties.setWindow(Duration.ofMinutes(15));
        properties.setAuthMaxRequests(1);
        AccountRateLimiter limiter = new AccountRateLimiter(properties, clock);

        limiter.requireAuthAttempt("login", "203.0.113.10");
        clock.advance(Duration.ofMinutes(16));

        limiter.requireAuthAttempt("login", "203.0.113.10");
    }

    @Test
    void passwordResetLimitAppliesToNormalizedEmailAcrossRemoteAddresses() {
        MutableClock clock = new MutableClock(Instant.parse("2026-06-15T14:00:00Z"));
        AccountRateLimitProperties properties = new AccountRateLimitProperties();
        properties.setWindow(Duration.ofMinutes(15));
        properties.setPasswordResetMaxRequests(1);
        AccountRateLimiter limiter = new AccountRateLimiter(properties, clock);

        limiter.requirePasswordResetAttempt("203.0.113.10", "Rider@Example.COM");

        assertThatThrownBy(() -> limiter.requirePasswordResetAttempt("203.0.113.10", " rider@example.com "))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);

        assertThatThrownBy(() -> limiter.requirePasswordResetAttempt("203.0.113.11", "rider@example.com"))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void passwordResetLimitAppliesToRemoteAddressAcrossTargetEmails() {
        MutableClock clock = new MutableClock(Instant.parse("2026-06-15T14:00:00Z"));
        AccountRateLimitProperties properties = new AccountRateLimitProperties();
        properties.setWindow(Duration.ofMinutes(15));
        properties.setPasswordResetMaxRequests(2);
        AccountRateLimiter limiter = new AccountRateLimiter(properties, clock);

        limiter.requirePasswordResetAttempt("203.0.113.10", "first@example.com");
        limiter.requirePasswordResetAttempt("203.0.113.10", "second@example.com");

        assertThatThrownBy(() -> limiter.requirePasswordResetAttempt("203.0.113.10", "third@example.com"))
            .isInstanceOf(AccountException.class)
            .extracting("status")
            .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    @Test
    void extractsCloudflareForwardedClientAddressBeforeRemoteAddress() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        request.addHeader("CF-Connecting-IP", "203.0.113.20");

        org.assertj.core.api.Assertions.assertThat(AccountRateLimiter.clientAddress(request))
            .isEqualTo("203.0.113.20");
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        void advance(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
