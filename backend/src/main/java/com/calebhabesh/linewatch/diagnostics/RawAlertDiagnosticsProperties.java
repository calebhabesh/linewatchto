package com.calebhabesh.linewatch.diagnostics;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.diagnostics.raw-alerts")
public class RawAlertDiagnosticsProperties {
    private boolean enabled;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}
