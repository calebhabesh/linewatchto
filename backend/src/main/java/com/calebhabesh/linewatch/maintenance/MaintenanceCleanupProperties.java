package com.calebhabesh.linewatch.maintenance;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.maintenance.cleanup")
public class MaintenanceCleanupProperties {
    private boolean enabled = true;
    private Duration ingestionRunRetention = Duration.ofDays(90);
    private Duration alertSourceRecordRetention = Duration.ofDays(90);
    private int retainInactiveGtfsImports = 1;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Duration getIngestionRunRetention() {
        return ingestionRunRetention;
    }

    public void setIngestionRunRetention(Duration ingestionRunRetention) {
        this.ingestionRunRetention = ingestionRunRetention;
    }

    public Duration getAlertSourceRecordRetention() {
        return alertSourceRecordRetention;
    }

    public void setAlertSourceRecordRetention(Duration alertSourceRecordRetention) {
        this.alertSourceRecordRetention = alertSourceRecordRetention;
    }

    public int getRetainInactiveGtfsImports() {
        return retainInactiveGtfsImports;
    }

    public void setRetainInactiveGtfsImports(int retainInactiveGtfsImports) {
        this.retainInactiveGtfsImports = retainInactiveGtfsImports;
    }
}
