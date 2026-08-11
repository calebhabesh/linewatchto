package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountException;
import java.net.URI;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;

public class PushEndpointPolicy {
    private static final int MAX_ENDPOINT_LENGTH = 2_048;
    private static final List<String> ALLOWED_HOSTS = List.of(
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "push.services.mozilla.com",
        "push.apple.com",
        "notify.windows.com"
    );

    public String requireAllowed(String value) {
        String endpoint = value == null ? "" : value.trim();
        if (endpoint.isBlank()) {
            throw new AccountException(HttpStatus.BAD_REQUEST, "missing_endpoint", "Push subscription endpoint is required.");
        }
        if (endpoint.length() > MAX_ENDPOINT_LENGTH) {
            throw invalidEndpoint();
        }

        final URI uri;
        try {
            uri = URI.create(endpoint);
        } catch (IllegalArgumentException ex) {
            throw invalidEndpoint();
        }
        String host = normalizeHost(uri.getHost());
        boolean allowedHost = ALLOWED_HOSTS.stream().anyMatch(allowed ->
            host.equals(allowed) || host.endsWith("." + allowed)
        );
        if (
            !"https".equalsIgnoreCase(uri.getScheme()) ||
                host.isBlank() ||
                !allowedHost ||
                uri.getUserInfo() != null ||
                uri.getFragment() != null ||
                (uri.getPort() != -1 && uri.getPort() != 443)
        ) {
            throw invalidEndpoint();
        }
        return endpoint;
    }

    private static String normalizeHost(String host) {
        String normalized = host == null ? "" : host.trim().toLowerCase(Locale.ROOT);
        return normalized.endsWith(".") ? normalized.substring(0, normalized.length() - 1) : normalized;
    }

    private AccountException invalidEndpoint() {
        return new AccountException(
            HttpStatus.BAD_REQUEST,
            "invalid_push_endpoint",
            "Push subscription endpoint is not a supported Web Push provider."
        );
    }
}
