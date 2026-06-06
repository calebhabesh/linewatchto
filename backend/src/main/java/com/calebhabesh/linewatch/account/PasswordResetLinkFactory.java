package com.calebhabesh.linewatch.account;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class PasswordResetLinkFactory {
    private static final String DEFAULT_FRONTEND_BASE_URL = "http://localhost:3000";

    private final String frontendBaseUrl;

    public PasswordResetLinkFactory(
        @Value("${linewatch.auth.password-reset.frontend-base-url:http://localhost:3000}") String frontendBaseUrl
    ) {
        String normalized = frontendBaseUrl == null ? "" : frontendBaseUrl.trim();
        this.frontendBaseUrl = normalized.isBlank() ? DEFAULT_FRONTEND_BASE_URL : stripTrailingSlashes(normalized);
    }

    public String resetUrl(String rawResetToken) {
        return UriComponentsBuilder.fromUriString(frontendBaseUrl)
            .path("/reset-password")
            .queryParam("token", rawResetToken)
            .build()
            .toUriString();
    }

    private String stripTrailingSlashes(String value) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '/') {
            end--;
        }
        return value.substring(0, end);
    }
}
