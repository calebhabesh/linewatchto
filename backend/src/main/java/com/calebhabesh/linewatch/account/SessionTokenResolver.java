package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

@Component
public class SessionTokenResolver {
    public static final String BEARER_PREFIX = "Bearer ";

    public String resolveSessionToken(HttpServletRequest request) {
        if (request == null) {
            return null;
        }
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authHeader != null && !authHeader.isBlank()) {
            if (authHeader.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
                String token = authHeader.substring(BEARER_PREFIX.length()).trim();
                if (!token.isBlank()) {
                    return token;
                }
            } else {
                String token = authHeader.trim();
                if (!token.isBlank()) {
                    return token;
                }
            }
        }
        String customHeader = request.getHeader("X-Session-Token");
        if (customHeader != null && !customHeader.isBlank()) {
            return customHeader.trim();
        }
        Cookie cookie = WebUtils.getCookie(request, AuthCookieFactory.COOKIE_NAME);
        if (cookie != null && cookie.getValue() != null && !cookie.getValue().isBlank()) {
            return cookie.getValue();
        }
        return null;
    }

    public boolean isBearerAuth(HttpServletRequest request) {
        if (request == null) {
            return false;
        }
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        return authHeader != null && !authHeader.isBlank();
    }
}
