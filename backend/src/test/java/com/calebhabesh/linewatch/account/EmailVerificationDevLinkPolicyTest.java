package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class EmailVerificationDevLinkPolicyTest {
    private static final AccountService.EmailVerificationRequestResponse RESPONSE =
        new AccountService.EmailVerificationRequestResponse(
            true,
            "Check your email.",
            "raw-verification-token",
            Instant.parse("2026-08-25T14:30:00Z")
        );

    @Test
    void acceptsExplicitLoopbackOnlyDevelopmentConfiguration() {
        EmailVerificationDevLinkPolicy policy = policy("127.0.0.1", "http://localhost:3000", "http://127.0.0.1:3000");
        assertThatCode(policy::afterPropertiesSet).doesNotThrowAnyException();
    }

    @Test
    void rejectsPublicDevLinkConfiguration() {
        EmailVerificationDevLinkPolicy policy = policy("0.0.0.0", "http://localhost:3000", "http://localhost:3000");
        assertThatThrownBy(policy::afterPropertiesSet).isInstanceOf(IllegalStateException.class).hasMessageContaining("loopback");
    }

    @Test
    void suppressesTokenForForwardedRequestsButAllowsDirectLoopbackRequests() {
        EmailVerificationDevLinkPolicy policy = policy("127.0.0.1", "http://localhost:3000", "http://localhost:3000");
        MockHttpServletRequest forwarded = requestFrom("127.0.0.1", "localhost");
        forwarded.addHeader("Forwarded", "for=203.0.113.20");

        assertThat(policy.filterResponse(RESPONSE, forwarded).devVerificationToken()).isNull();
        assertThat(policy.filterResponse(RESPONSE, requestFrom("127.0.0.1", "localhost"))).isEqualTo(RESPONSE);
    }

    private static EmailVerificationDevLinkPolicy policy(String bind, String origins, String frontend) {
        return new EmailVerificationDevLinkPolicy(true, bind, origins, frontend);
    }

    private static MockHttpServletRequest requestFrom(String remote, String host) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remote);
        request.setServerName(host);
        return request;
    }
}
