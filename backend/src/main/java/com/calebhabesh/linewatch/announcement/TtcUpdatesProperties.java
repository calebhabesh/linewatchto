package com.calebhabesh.linewatch.announcement;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.announcements.ttc-updates")
public class TtcUpdatesProperties {
    private boolean enabled = true;
    private URI url = URI.create("https://www.ttc.ca/riding-the-ttc/Updates");
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(8);
    private Duration refreshInterval = Duration.ofHours(6);
    private Duration retryInterval = Duration.ofMinutes(15);
    private int maxEntries = 20;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public URI getUrl() { return url; }
    public void setUrl(URI url) { this.url = url; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
    public Duration getRefreshInterval() { return refreshInterval; }
    public void setRefreshInterval(Duration refreshInterval) { this.refreshInterval = refreshInterval; }
    public Duration getRetryInterval() { return retryInterval; }
    public void setRetryInterval(Duration retryInterval) { this.retryInterval = retryInterval; }
    public int getMaxEntries() { return maxEntries; }
    public void setMaxEntries(int maxEntries) { this.maxEntries = maxEntries; }
}
