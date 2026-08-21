package com.calebhabesh.linewatch.account;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AccountWebConfiguration implements WebMvcConfigurer {
    private final AccountSessionCookieInterceptor sessionCookieInterceptor;

    public AccountWebConfiguration(AccountSessionCookieInterceptor sessionCookieInterceptor) {
        this.sessionCookieInterceptor = sessionCookieInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(sessionCookieInterceptor)
            .addPathPatterns(
                "/api/account/**",
                "/api/auth/me",
                "/api/auth/google/link",
                "/api/auth/google/callback"
            );
    }
}
