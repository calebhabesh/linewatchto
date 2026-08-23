package com.calebhabesh.linewatch.regional;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.regional.arrivals")
public class RegionalArrivalProperties {
    private boolean enabled;
    private Duration cacheTtl = Duration.ofSeconds(30);
    private Duration maxSourceAge = Duration.ofMinutes(5);
    private Duration liveArrivalRetention = Duration.ofSeconds(90);
    private Duration horizon = Duration.ofHours(3);
    private int maxArrivalsPerLine = 4;
    private boolean scheduleEnabled;
    private boolean scheduleRefreshEnabled;
    private String goScheduleZipPath = "";
    private String upScheduleZipPath = "";
    private URI goScheduleUrl = URI.create("https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip");
    private URI upScheduleUrl = URI.create("https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/UP-GTFS.zip");
    private Duration scheduleConnectTimeout = Duration.ofSeconds(10);
    private Duration scheduleReadTimeout = Duration.ofMinutes(2);
    private Duration scheduleRefreshInitialDelay = Duration.ofSeconds(45);
    private Duration scheduleRefreshFixedDelay = Duration.ofHours(24);
    private int scheduleLookaheadDays = 7;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getCacheTtl() { return cacheTtl; }
    public void setCacheTtl(Duration cacheTtl) { this.cacheTtl = cacheTtl; }
    public Duration getMaxSourceAge() { return maxSourceAge; }
    public void setMaxSourceAge(Duration maxSourceAge) { this.maxSourceAge = maxSourceAge; }
    public Duration getLiveArrivalRetention() { return liveArrivalRetention; }
    public void setLiveArrivalRetention(Duration value) { this.liveArrivalRetention = value; }
    public Duration getHorizon() { return horizon; }
    public void setHorizon(Duration horizon) { this.horizon = horizon; }
    public int getMaxArrivalsPerLine() { return maxArrivalsPerLine; }
    public void setMaxArrivalsPerLine(int maxArrivalsPerLine) { this.maxArrivalsPerLine = maxArrivalsPerLine; }
    public boolean isScheduleEnabled() { return scheduleEnabled; }
    public void setScheduleEnabled(boolean scheduleEnabled) { this.scheduleEnabled = scheduleEnabled; }
    public boolean isScheduleRefreshEnabled() { return scheduleRefreshEnabled; }
    public void setScheduleRefreshEnabled(boolean scheduleRefreshEnabled) { this.scheduleRefreshEnabled = scheduleRefreshEnabled; }
    public String getGoScheduleZipPath() { return goScheduleZipPath; }
    public void setGoScheduleZipPath(String goScheduleZipPath) { this.goScheduleZipPath = goScheduleZipPath; }
    public String getUpScheduleZipPath() { return upScheduleZipPath; }
    public void setUpScheduleZipPath(String upScheduleZipPath) { this.upScheduleZipPath = upScheduleZipPath; }
    public URI getGoScheduleUrl() { return goScheduleUrl; }
    public void setGoScheduleUrl(URI goScheduleUrl) { this.goScheduleUrl = goScheduleUrl; }
    public URI getUpScheduleUrl() { return upScheduleUrl; }
    public void setUpScheduleUrl(URI upScheduleUrl) { this.upScheduleUrl = upScheduleUrl; }
    public Duration getScheduleConnectTimeout() { return scheduleConnectTimeout; }
    public void setScheduleConnectTimeout(Duration value) { this.scheduleConnectTimeout = value; }
    public Duration getScheduleReadTimeout() { return scheduleReadTimeout; }
    public void setScheduleReadTimeout(Duration value) { this.scheduleReadTimeout = value; }
    public Duration getScheduleRefreshInitialDelay() { return scheduleRefreshInitialDelay; }
    public void setScheduleRefreshInitialDelay(Duration value) { this.scheduleRefreshInitialDelay = value; }
    public Duration getScheduleRefreshFixedDelay() { return scheduleRefreshFixedDelay; }
    public void setScheduleRefreshFixedDelay(Duration value) { this.scheduleRefreshFixedDelay = value; }
    public int getScheduleLookaheadDays() { return scheduleLookaheadDays; }
    public void setScheduleLookaheadDays(int scheduleLookaheadDays) { this.scheduleLookaheadDays = scheduleLookaheadDays; }
}
