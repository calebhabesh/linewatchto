package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class PasswordResetDevLinkPolicyTest {
    private static final AccountService.PasswordResetRequestResponse RESPONSE =
        new AccountService.PasswordResetRequestResponse(
            true,
            "If an account exists for that email, a password reset link has been sent.",
            "raw-reset-token",
            Instant.parse("2026-08-11T15:00:00Z")
        );

    @Test
    void acceptsExplicitLoopbackOnlyDevelopmentConfiguration() {
        PasswordResetDevLinkPolicy policy = policy("127.0.0.1", "http://localhost:3000", "http://127.0.0.1:3000");

        assertThatCode(policy::afterPropertiesSet).doesNotThrowAnyException();
    }

    @Test
    void rejectsDevLinksWhenServerBindsAllInterfaces() {
        PasswordResetDevLinkPolicy policy = policy("0.0.0.0", "http://localhost:3000", "http://localhost:3000");

        assertThatThrownBy(policy::afterPropertiesSet)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("loopback");
    }

    @Test
    void rejectsDevLinksWithAnyPublicOrigin() {
        PasswordResetDevLinkPolicy policy = policy(
            "127.0.0.1",
            "http://localhost:3000,https://dev.linewatch.example",
            "http://localhost:3000"
        );

        assertThatThrownBy(policy::afterPropertiesSet)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("allowed origins");
    }

    @Test
    void suppressesRecoveryCapabilityForForwardedRequests() {
        PasswordResetDevLinkPolicy policy = policy("127.0.0.1", "http://localhost:3000", "http://localhost:3000");
        MockHttpServletRequest request = requestFrom("127.0.0.1", "localhost");
        request.addHeader("X-Forwarded-For", "203.0.113.20");

        AccountService.PasswordResetRequestResponse filtered = policy.filterResponse(RESPONSE, request);

        assertThat(filtered.devResetToken()).isNull();
        assertThat(filtered.expiresAt()).isNull();
    }

    @Test
    void preservesRecoveryCapabilityForDirectLoopbackRequests() {
        PasswordResetDevLinkPolicy policy = policy("127.0.0.1", "http://localhost:3000", "http://localhost:3000");

        AccountService.PasswordResetRequestResponse filtered = policy.filterResponse(
            RESPONSE,
            requestFrom("127.0.0.1", "localhost")
        );

        assertThat(filtered).isEqualTo(RESPONSE);
    }

    private static PasswordResetDevLinkPolicy policy(String bind, String origins, String frontend) {
        return new PasswordResetDevLinkPolicy(true, bind, origins, frontend);
    }

    private static MockHttpServletRequest requestFrom(String remote, String host) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remote);
        request.setServerName(host);
        return request;
    }
}
