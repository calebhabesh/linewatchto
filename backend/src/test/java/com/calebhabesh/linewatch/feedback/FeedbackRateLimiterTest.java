package com.calebhabesh.linewatch.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class FeedbackRateLimiterTest {
    @Test
    void limitsFeedbackSubmissionsByClientAddress() {
        FeedbackProperties properties = new FeedbackProperties();
        properties.getRateLimit().setEnabled(true);
        properties.getRateLimit().setMaxRequests(2);
        properties.getRateLimit().setWindow(Duration.ofMinutes(15));
        FeedbackRateLimiter limiter = new FeedbackRateLimiter(
            properties,
            Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneOffset.UTC)
        );

        limiter.requireFeedbackAttempt("203.0.113.10");
        limiter.requireFeedbackAttempt("203.0.113.10");

        assertThatThrownBy(() -> limiter.requireFeedbackAttempt("203.0.113.10"))
            .isInstanceOf(FeedbackException.class)
            .satisfies(error -> {
                FeedbackException ex = (FeedbackException) error;
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                assertThat(ex.getError()).isEqualTo("rate_limited");
                assertThat(ex.getMessage()).isEqualTo("Too many feedback submissions. Try again later.");
            });
    }
}
