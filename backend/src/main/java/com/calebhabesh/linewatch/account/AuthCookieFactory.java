package com.calebhabesh.linewatch.account;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class AuthCookieFactory {
    public static final String COOKIE_NAME = "linewatch_session";
    private final boolean secureCookie;

    public AuthCookieFactory(@Value("${linewatch.auth.secure-cookie:false}") boolean secureCookie) {
        this.secureCookie = secureCookie;
    }

    public ResponseCookie sessionCookie(String rawSessionToken, Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, rawSessionToken)
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(maxAge)
            .build();
    }

    public ResponseCookie expiredCookie() {
        return ResponseCookie.from(COOKIE_NAME, "")
            .httpOnly(true)
            .secure(secureCookie)
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ZERO)
            .build();
    }
}
