package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.http.Cookie;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AccountSessionCookieInterceptorTest {
    private final AccountSessionRequestContext sessionContext = mock(AccountSessionRequestContext.class);
    private final AccountService accountService = mock(AccountService.class);
    private final AccountSessionCookieInterceptor interceptor = new AccountSessionCookieInterceptor(
        sessionContext,
        new AuthCookieFactory(false),
        accountService
    );

    @Test
    void refreshesCookieOnlyWhenServerSessionWasRenewed() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/account/commutes");
        request.setCookies(new Cookie(AuthCookieFactory.COOKIE_NAME, "raw-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(sessionContext.shouldRenewCookie()).thenReturn(true);
        when(accountService.sessionTtl()).thenReturn(Duration.ofDays(365));

        interceptor.postHandle(request, response, new Object(), null);

        assertThat(response.getHeader(HttpHeaders.SET_COOKIE))
            .contains("linewatch_session=raw-token")
            .contains("Max-Age=31536000")
            .contains("HttpOnly")
            .contains("SameSite=Lax");
    }

    @Test
    void refreshesCookieAfterValidatedRenewalEvenWhenHandlerReturnsAnError() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/account/commutes");
        request.setCookies(new Cookie(AuthCookieFactory.COOKIE_NAME, "raw-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(401);
        when(sessionContext.shouldRenewCookie()).thenReturn(true);
        when(accountService.sessionTtl()).thenReturn(Duration.ofDays(365));

        interceptor.postHandle(request, response, new Object(), null);

        assertThat(response.getHeader(HttpHeaders.SET_COOKIE))
            .contains("linewatch_session=raw-token")
            .contains("Max-Age=31536000");
    }

    @Test
    void preHandlerRenewsProtectedSessionAndCookieBeforeLaterFailure() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/account/commutes");
        request.setCookies(new Cookie(AuthCookieFactory.COOKIE_NAME, "raw-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(accountService.renewSessionBeforeProtectedRequest("raw-token")).thenReturn(true);
        when(accountService.sessionTtl()).thenReturn(Duration.ofDays(365));

        assertThat(interceptor.preHandle(request, response, new Object())).isTrue();
        response.setStatus(409);

        assertThat(response.getHeader(HttpHeaders.SET_COOKIE))
            .contains("linewatch_session=raw-token")
            .contains("Max-Age=31536000");
        verify(accountService).renewSessionBeforeProtectedRequest("raw-token");
    }

    @Test
    void doesNotRefreshCookieWithoutAValidatedRenewal() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/me");
        request.setCookies(new Cookie(AuthCookieFactory.COOKIE_NAME, "raw-token"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        when(sessionContext.shouldRenewCookie()).thenReturn(false);

        interceptor.postHandle(request, response, new Object(), null);

        assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }
}
