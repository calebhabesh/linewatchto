package com.calebhabesh.linewatch.account;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.auth.google")
public class GoogleAuthProperties {
    private boolean enabled = false;
    private String clientId = "";
    private String jwkSetUri = "https://www.googleapis.com/oauth2/v3/certs";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getJwkSetUri() {
        return jwkSetUri;
    }

    public void setJwkSetUri(String jwkSetUri) {
        this.jwkSetUri = jwkSetUri;
    }

    public boolean configured() {
        return enabled && clientId != null && !clientId.isBlank();
    }
}
