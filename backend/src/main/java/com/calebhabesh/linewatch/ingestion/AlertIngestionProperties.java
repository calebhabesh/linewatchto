package com.calebhabesh.linewatch.ingestion;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.ingestion.alerts")
public class AlertIngestionProperties {
    private boolean enabled;
    private URI url = URI.create("https://alerts.ttc.ca/api/alerts/live-alerts");
    private Duration fixedDelay = Duration.ofMinutes(2);
    private Duration maxDashboardAge = Duration.ofMinutes(10);
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(8);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public URI getUrl() {
        return url;
    }

    public void setUrl(URI url) {
        this.url = url;
    }

    public Duration getFixedDelay() {
        return fixedDelay;
    }

    public void setFixedDelay(Duration fixedDelay) {
        this.fixedDelay = fixedDelay;
    }

    public Duration getMaxDashboardAge() {
        return maxDashboardAge;
    }

    public void setMaxDashboardAge(Duration maxDashboardAge) {
        this.maxDashboardAge = maxDashboardAge;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }
}
