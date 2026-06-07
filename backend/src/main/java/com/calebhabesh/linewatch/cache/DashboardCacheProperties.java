package com.calebhabesh.linewatch.cache;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.cache.dashboard")
public class DashboardCacheProperties {
    private boolean enabled = true;
    private Duration statusTtl = Duration.ofSeconds(30);
    private Duration mapTtl = Duration.ofSeconds(30);
    private Duration alertsTtl = Duration.ofSeconds(30);
    private Duration ingestionHealthTtl = Duration.ofSeconds(15);
    private Duration performanceTtl = Duration.ofMinutes(30);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getStatusTtl() { return statusTtl; }
    public void setStatusTtl(Duration statusTtl) { this.statusTtl = statusTtl; }
    public Duration getMapTtl() { return mapTtl; }
    public void setMapTtl(Duration mapTtl) { this.mapTtl = mapTtl; }
    public Duration getAlertsTtl() { return alertsTtl; }
    public void setAlertsTtl(Duration alertsTtl) { this.alertsTtl = alertsTtl; }
    public Duration getIngestionHealthTtl() { return ingestionHealthTtl; }
    public void setIngestionHealthTtl(Duration ingestionHealthTtl) { this.ingestionHealthTtl = ingestionHealthTtl; }
    public Duration getPerformanceTtl() { return performanceTtl; }
    public void setPerformanceTtl(Duration performanceTtl) { this.performanceTtl = performanceTtl; }
}
