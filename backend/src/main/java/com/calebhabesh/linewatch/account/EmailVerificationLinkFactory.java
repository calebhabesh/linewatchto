package com.calebhabesh.linewatch.account;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class EmailVerificationLinkFactory {
    private static final String DEFAULT_FRONTEND_BASE_URL = "http://localhost:3000";

    private final String frontendBaseUrl;

    public EmailVerificationLinkFactory(
        @Value("${linewatch.auth.email-verification.frontend-base-url:http://localhost:3000}") String frontendBaseUrl
    ) {
        String normalized = frontendBaseUrl == null ? "" : frontendBaseUrl.trim();
        this.frontendBaseUrl = normalized.isBlank() ? DEFAULT_FRONTEND_BASE_URL : stripTrailingSlashes(normalized);
    }

    public String verificationUrl(String rawToken) {
        String verificationPage = UriComponentsBuilder.fromUriString(frontendBaseUrl)
            .path("/verify-email")
            .build()
            .toUriString();
        // Fragments stay in the browser and therefore keep the bearer token out
        // of HTTP request targets, proxy access logs, and Referer headers.
        return verificationPage + "#token=" + rawToken;
    }

    private String stripTrailingSlashes(String value) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '/') {
            end--;
        }
        return value.substring(0, end);
    }
}
