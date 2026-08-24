package com.calebhabesh.linewatch.account;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.URI;
import java.util.Arrays;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class EmailVerificationDevLinkPolicy implements InitializingBean {
    private final boolean enabled;
    private final String serverAddress;
    private final String allowedOrigins;
    private final String frontendBaseUrl;

    public EmailVerificationDevLinkPolicy(
        @Value("${linewatch.auth.email-verification.dev-links:false}") boolean enabled,
        @Value("${server.address:}") String serverAddress,
        @Value("${linewatch.auth.allowed-origins:}") String allowedOrigins,
        @Value("${linewatch.auth.email-verification.frontend-base-url:http://localhost:3000}") String frontendBaseUrl
    ) {
        this.enabled = enabled;
        this.serverAddress = serverAddress;
        this.allowedOrigins = allowedOrigins;
        this.frontendBaseUrl = frontendBaseUrl;
    }

    @Override
    public void afterPropertiesSet() {
        if (!enabled) {
            return;
        }
        if (!isLoopbackHost(serverAddress)) {
            throw unsafeConfiguration("SERVER_ADDRESS must be explicitly bound to a loopback address");
        }
        if (!isLoopbackUrl(frontendBaseUrl)) {
            throw unsafeConfiguration("the email-verification frontend URL must use a loopback host");
        }
        boolean publicOrigin = Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .anyMatch(origin -> !isLoopbackUrl(origin));
        if (publicOrigin) {
            throw unsafeConfiguration("all allowed origins must use loopback hosts");
        }
    }

    public AccountService.EmailVerificationRequestResponse filterResponse(
        AccountService.EmailVerificationRequestResponse response,
        HttpServletRequest request
    ) {
        if (response.devVerificationToken() == null || canExposeTo(request)) {
            return response;
        }
        return new AccountService.EmailVerificationRequestResponse(
            response.accepted(),
            response.message(),
            null,
            null
        );
    }

    private boolean canExposeTo(HttpServletRequest request) {
        return enabled
            && isLoopbackHost(request.getRemoteAddr())
            && isLoopbackHost(request.getServerName())
            && blank(request.getHeader("Forwarded"))
            && blank(request.getHeader("X-Forwarded-For"))
            && blank(request.getHeader("CF-Connecting-IP"));
    }

    private static boolean isLoopbackUrl(String value) {
        try {
            URI uri = URI.create(value == null ? "" : value.trim());
            return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                && uri.getUserInfo() == null
                && isLoopbackHost(uri.getHost());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static boolean isLoopbackHost(String value) {
        String host = value == null ? "" : value.trim();
        if (host.isEmpty()) {
            return false;
        }
        if ("localhost".equalsIgnoreCase(host)) {
            return true;
        }
        boolean numeric = host.indexOf(':') >= 0
            ? host.matches("[0-9A-Fa-f:.]+") && !host.contains("%")
            : host.matches("[0-9.]+");
        if (!numeric) {
            return false;
        }
        try {
            return InetAddress.getByName(host).isLoopbackAddress();
        } catch (Exception exception) {
            return false;
        }
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static IllegalStateException unsafeConfiguration(String detail) {
        return new IllegalStateException(
            "Email-verification dev links expose account activation tokens and are local-only: " + detail + "."
        );
    }
}
