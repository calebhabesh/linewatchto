package com.calebhabesh.linewatch.account;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AuthCorsConfiguration implements WebMvcConfigurer {
    private final List<String> allowedOrigins;

    public AuthCorsConfiguration(
        @Value("${linewatch.auth.allowed-origins:http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4173,http://192.168.*:*,http://10.*:*,http://172.16.*:*,http://*.local:*}") List<String> allowedOrigins
    ) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOriginPatterns(allowedOrigins.toArray(String[]::new))
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("*")
            .allowCredentials(true);
    }
}
