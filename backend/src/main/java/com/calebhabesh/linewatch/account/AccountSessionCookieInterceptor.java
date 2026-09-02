package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AccountSessionCookieInterceptor implements HandlerInterceptor {
    private final AccountSessionRequestContext sessionContext;
    private final AuthCookieFactory cookieFactory;
    private final AccountService accountService;
    private final SessionTokenResolver sessionTokenResolver;

    public AccountSessionCookieInterceptor(
        AccountSessionRequestContext sessionContext,
        AuthCookieFactory cookieFactory,
        AccountService accountService,
        SessionTokenResolver sessionTokenResolver
    ) {
        this.sessionContext = sessionContext;
        this.cookieFactory = cookieFactory;
        this.accountService = accountService;
        this.sessionTokenResolver = sessionTokenResolver;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!requiresPreHandlerRenewal(request.getRequestURI())) {
            return true;
        }
        String sessionToken = sessionTokenResolver.resolveSessionToken(request);
        if (sessionToken != null && accountService.renewSessionBeforeProtectedRequest(sessionToken)) {
            addRenewedCredentials(request, response, sessionToken);
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
        String sessionToken = sessionTokenResolver.resolveSessionToken(request);
        if (sessionToken == null) {
            return;
        }
        addRenewedCredentials(request, response, sessionToken);
    }

    private boolean requiresPreHandlerRenewal(String requestUri) {
        return requestUri.startsWith("/api/account/")
            || requestUri.equals("/api/auth/google/link")
            || requestUri.equals("/api/auth/google/callback");
    }

    private void addRenewedCredentials(HttpServletRequest request, HttpServletResponse response, String rawSessionToken) {
        response.addHeader(
            HttpHeaders.SET_COOKIE,
            cookieFactory.sessionCookie(rawSessionToken, accountService.sessionTtl()).toString()
        );
        if (sessionTokenResolver.isBearerAuth(request)) {
            response.setHeader(HttpHeaders.AUTHORIZATION, "Bearer " + rawSessionToken);
        }
    }
}
