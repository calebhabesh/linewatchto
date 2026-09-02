package com.calebhabesh.linewatch.account;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AccountWebConfiguration implements WebMvcConfigurer {
    private final AccountSessionCookieInterceptor sessionCookieInterceptor;
    private final SessionTokenArgumentResolver sessionTokenArgumentResolver;

    public AccountWebConfiguration(
        AccountSessionCookieInterceptor sessionCookieInterceptor,
        SessionTokenArgumentResolver sessionTokenArgumentResolver
    ) {
        this.sessionCookieInterceptor = sessionCookieInterceptor;
        this.sessionTokenArgumentResolver = sessionTokenArgumentResolver;
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

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(sessionTokenArgumentResolver);
    }
}
