package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

class SessionTokenResolverTest {
    private final SessionTokenResolver resolver = new SessionTokenResolver();

    @Test
    void resolvesFromBearerAuthorizationHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer test-bearer-token-123");

        assertThat(resolver.resolveSessionToken(request)).isEqualTo("test-bearer-token-123");
        assertThat(resolver.isBearerAuth(request)).isTrue();
    }

    @Test
    void resolvesFromCustomSessionTokenHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Session-Token", "custom-header-token");

        assertThat(resolver.resolveSessionToken(request)).isEqualTo("custom-header-token");
        assertThat(resolver.isBearerAuth(request)).isFalse();
    }

    @Test
    void resolvesFromSessionCookieWhenHeaderIsAbsent() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie(AuthCookieFactory.COOKIE_NAME, "cookie-token-456"));

        assertThat(resolver.resolveSessionToken(request)).isEqualTo("cookie-token-456");
        assertThat(resolver.isBearerAuth(request)).isFalse();
    }

    @Test
    void bearerHeaderTakesPrecedenceOverCookie() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer bearer-wins");
        request.setCookies(new Cookie(AuthCookieFactory.COOKIE_NAME, "cookie-loses"));

        assertThat(resolver.resolveSessionToken(request)).isEqualTo("bearer-wins");
    }

    @Test
    void returnsNullWhenNoAuthIsPresent() {
        MockHttpServletRequest request = new MockHttpServletRequest();

        assertThat(resolver.resolveSessionToken(request)).isNull();
        assertThat(resolver.isBearerAuth(request)).isFalse();
    }
}
