package com.calebhabesh.linewatch.regional;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.ingestion.metrolinx")
public class MetrolinxProperties {
    private boolean enabled;
    private URI baseUrl = URI.create("https://api.openmetrolinx.com/OpenDataAPI/");
    private String apiKey = "";
    private Duration initialDelay = Duration.ofSeconds(5);
    private Duration fixedDelay = Duration.ofMinutes(2);
    private Duration maxDashboardAge = Duration.ofMinutes(10);
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(10);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public URI getBaseUrl() { return baseUrl; }
    public void setBaseUrl(URI baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey == null ? "" : apiKey.trim(); }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public boolean isConfigured() { return !getApiKey().isEmpty(); }
    public Duration getInitialDelay() { return initialDelay; }
    public void setInitialDelay(Duration initialDelay) { this.initialDelay = initialDelay; }
    public Duration getFixedDelay() { return fixedDelay; }
    public void setFixedDelay(Duration fixedDelay) { this.fixedDelay = fixedDelay; }
    public Duration getMaxDashboardAge() { return maxDashboardAge; }
    public void setMaxDashboardAge(Duration maxDashboardAge) { this.maxDashboardAge = maxDashboardAge; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
}
