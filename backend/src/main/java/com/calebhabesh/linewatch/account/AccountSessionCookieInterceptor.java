package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.util.WebUtils;

@Component
public class AccountSessionCookieInterceptor implements HandlerInterceptor {
    private final AccountSessionRequestContext sessionContext;
    private final AuthCookieFactory cookieFactory;
    private final AccountService accountService;

    public AccountSessionCookieInterceptor(
        AccountSessionRequestContext sessionContext,
        AuthCookieFactory cookieFactory,
        AccountService accountService
    ) {
        this.sessionContext = sessionContext;
        this.cookieFactory = cookieFactory;
        this.accountService = accountService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!requiresPreHandlerRenewal(request.getRequestURI())) {
            return true;
        }
        Cookie sessionCookie = sessionCookie(request);
        if (sessionCookie != null && accountService.renewSessionBeforeProtectedRequest(sessionCookie.getValue())) {
            addRenewedCookie(response, sessionCookie.getValue());
        }
        return true;
    }

    @Override
    public void postHandle(
        HttpServletRequest request,
        HttpServletResponse response,
        Object handler,
        org.springframework.web.servlet.ModelAndView modelAndView
    ) {
        if (!sessionContext.shouldRenewCookie()) {
            return;
        }
        Cookie sessionCookie = sessionCookie(request);
        if (sessionCookie == null) {
            return;
        }
        addRenewedCookie(response, sessionCookie.getValue());
    }

    private boolean requiresPreHandlerRenewal(String requestUri) {
        return requestUri.startsWith("/api/account/")
            || requestUri.equals("/api/auth/google/link")
            || requestUri.equals("/api/auth/google/callback");
    }

    private Cookie sessionCookie(HttpServletRequest request) {
        Cookie cookie = WebUtils.getCookie(request, AuthCookieFactory.COOKIE_NAME);
        if (cookie == null || cookie.getValue() == null || cookie.getValue().isBlank()) {
            return null;
        }
        return cookie;
    }

    private void addRenewedCookie(HttpServletResponse response, String rawSessionToken) {
        response.addHeader(
            HttpHeaders.SET_COOKIE,
            cookieFactory.sessionCookie(rawSessionToken, accountService.sessionTtl()).toString()
        );
    }
}
