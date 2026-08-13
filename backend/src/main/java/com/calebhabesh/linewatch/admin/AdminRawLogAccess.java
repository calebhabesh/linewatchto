package com.calebhabesh.linewatch.admin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class AdminRawLogAccess {
    private static final String BEARER_PREFIX = "Bearer ";

    private final AdminRawLogProperties properties;

    public AdminRawLogAccess(AdminRawLogProperties properties) {
        this.properties = properties;
    }

    public void requireAuthorized(String authorization) {
        if (!properties.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        String supplied = authorization != null && authorization.startsWith(BEARER_PREFIX)
            ? authorization.substring(BEARER_PREFIX.length())
            : "";
        if (!constantTimeEquals(properties.getToken(), supplied)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }

    private boolean constantTimeEquals(String expected, String supplied) {
        return MessageDigest.isEqual(
            expected.getBytes(StandardCharsets.UTF_8),
            supplied.getBytes(StandardCharsets.UTF_8)
        );
    }
}
