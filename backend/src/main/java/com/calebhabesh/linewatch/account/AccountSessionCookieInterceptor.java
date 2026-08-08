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
    public void postHandle(
        HttpServletRequest request,
        HttpServletResponse response,
        Object handler,
        org.springframework.web.servlet.ModelAndView modelAndView
    ) {
        if (!sessionContext.shouldRenewCookie() || response.getStatus() >= 400) {
            return;
        }
        Cookie sessionCookie = WebUtils.getCookie(request, AuthCookieFactory.COOKIE_NAME);
        if (sessionCookie == null || sessionCookie.getValue() == null || sessionCookie.getValue().isBlank()) {
            return;
        }
        response.addHeader(
            HttpHeaders.SET_COOKIE,
            cookieFactory.sessionCookie(sessionCookie.getValue(), accountService.sessionTtl()).toString()
        );
    }
}
