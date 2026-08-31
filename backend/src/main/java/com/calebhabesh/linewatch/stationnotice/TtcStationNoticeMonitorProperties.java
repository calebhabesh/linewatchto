package com.calebhabesh.linewatch.stationnotice;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.station-notices.monitor")
public class TtcStationNoticeMonitorProperties {
    private boolean enabled = false;
    private URI sitemapUrl = URI.create("https://www.ttc.ca/sitemap.xml");
    private Duration initialDelay = Duration.ofMinutes(1);
    private Duration fixedDelay = Duration.ofHours(24);
    private Duration fullRefreshInterval = Duration.ofDays(7);
    private Duration requestDelay = Duration.ofSeconds(1);
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(10);
    private int maxSitemaps = 8;
    private int maxStationPages = 160;
    private int maxResponseCharacters = 1_000_000;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public URI getSitemapUrl() { return sitemapUrl; }
    public void setSitemapUrl(URI sitemapUrl) { this.sitemapUrl = sitemapUrl; }
    public Duration getInitialDelay() { return initialDelay; }
    public void setInitialDelay(Duration initialDelay) { this.initialDelay = initialDelay; }
    public Duration getFixedDelay() { return fixedDelay; }
    public void setFixedDelay(Duration fixedDelay) { this.fixedDelay = fixedDelay; }
    public Duration getFullRefreshInterval() { return fullRefreshInterval; }
    public void setFullRefreshInterval(Duration fullRefreshInterval) { this.fullRefreshInterval = fullRefreshInterval; }
    public Duration getRequestDelay() { return requestDelay; }
    public void setRequestDelay(Duration requestDelay) { this.requestDelay = requestDelay; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
    public int getMaxSitemaps() { return maxSitemaps; }
    public void setMaxSitemaps(int maxSitemaps) { this.maxSitemaps = maxSitemaps; }
    public int getMaxStationPages() { return maxStationPages; }
    public void setMaxStationPages(int maxStationPages) { this.maxStationPages = maxStationPages; }
    public int getMaxResponseCharacters() { return maxResponseCharacters; }
    public void setMaxResponseCharacters(int maxResponseCharacters) { this.maxResponseCharacters = maxResponseCharacters; }
}
