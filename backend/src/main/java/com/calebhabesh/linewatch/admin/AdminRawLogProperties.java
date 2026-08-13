package com.calebhabesh.linewatch.admin;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.admin.raw-logs")
public class AdminRawLogProperties {
    private static final int MINIMUM_TOKEN_LENGTH = 32;
    private boolean enabled;
    private String token = "";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token == null ? "" : token;
    }

    public boolean isConfigured() {
        return enabled && token.length() >= MINIMUM_TOKEN_LENGTH;
    }
}
