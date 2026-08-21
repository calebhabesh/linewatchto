package com.calebhabesh.linewatch.arrival;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.arrivals")
public class ArrivalProperties {
    public enum ProviderMode {
        SCHEDULED,
        DEMO,
        UNAVAILABLE,
        LIVE
    }

    private boolean enabled = false;
    private URI url = URI.create("https://bustime.ttc.ca/gtfsrt"); // keeping for backwards compatibility or live mode usage
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(5);
    private Duration maxAge = Duration.ofMinutes(5);

    private ProviderMode provider = ProviderMode.SCHEDULED;
    private String scheduledSourceName = "TTC scheduled service";
    private URI scheduledSourceUrl = URI.create("https://ckan0.cf.opendata.inter.prod-toronto.ca/en/dataset/merged-gtfs-ttc-routes-and-schedules");
    private Duration scheduleHorizon = Duration.ofMinutes(90);
    private int scheduleLookaheadDays = 7;
    private Duration trainMarkerHorizon = Duration.ofMinutes(20);
    private Duration trainMarkerRetention = Duration.ofSeconds(30);
    private int maxArrivalsPerLine = 4;
    private URI liveGtfsRtUrl = URI.create("https://gtfsrt.ttc.ca/trips/subway?format=text");
    private Duration liveGtfsRtInitialDelay = Duration.ofSeconds(10);
    private Duration liveGtfsRtFixedDelay = Duration.ofSeconds(1);
    private String liveSourceName = "TTC GTFS-RT subway trip updates";
    private boolean gtfsImportEnabled = false;
    private String gtfsZipPath = "";
    private boolean gtfsRefreshEnabled = false;
    private URI gtfsRefreshPackageUrl = URI.create("https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules");
    private Duration gtfsRefreshInitialDelay = Duration.ofSeconds(30);
    private Duration gtfsRefreshFixedDelay = Duration.ofHours(24);
    private int gtfsRefreshMinServiceDaysRemaining = 14;
    private Duration gtfsPromotionInitialDelay = Duration.ofSeconds(30);
    private Duration gtfsPromotionFixedDelay = Duration.ofMinutes(5);

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

    public Duration getMaxAge() {
        return maxAge;
    }

    public void setMaxAge(Duration maxAge) {
        this.maxAge = maxAge;
    }

    public ProviderMode getProvider() {
        return provider;
    }

    public void setProvider(ProviderMode provider) {
        this.provider = provider;
    }

    public String getScheduledSourceName() {
        return scheduledSourceName;
    }

    public void setScheduledSourceName(String scheduledSourceName) {
        this.scheduledSourceName = scheduledSourceName;
    }

    public URI getScheduledSourceUrl() {
        return scheduledSourceUrl;
    }

    public void setScheduledSourceUrl(URI scheduledSourceUrl) {
        this.scheduledSourceUrl = scheduledSourceUrl;
    }

    public Duration getScheduleHorizon() {
        return scheduleHorizon;
    }

    public int getScheduleLookaheadDays() {
        return scheduleLookaheadDays;
    }

    public void setScheduleLookaheadDays(int scheduleLookaheadDays) {
        this.scheduleLookaheadDays = scheduleLookaheadDays;
    }

    public void setScheduleHorizon(Duration scheduleHorizon) {
        this.scheduleHorizon = scheduleHorizon;
    }

    public Duration getTrainMarkerHorizon() {
        return trainMarkerHorizon;
    }

    public void setTrainMarkerHorizon(Duration trainMarkerHorizon) {
        this.trainMarkerHorizon = trainMarkerHorizon;
    }

    public Duration getTrainMarkerRetention() {
        return trainMarkerRetention;
    }

    public void setTrainMarkerRetention(Duration trainMarkerRetention) {
        this.trainMarkerRetention = trainMarkerRetention;
    }

    public int getMaxArrivalsPerLine() {
        return maxArrivalsPerLine;
    }

    public void setMaxArrivalsPerLine(int maxArrivalsPerLine) {
        this.maxArrivalsPerLine = maxArrivalsPerLine;
    }

    public URI getLiveGtfsRtUrl() {
        return liveGtfsRtUrl;
    }

    public void setLiveGtfsRtUrl(URI liveGtfsRtUrl) {
        this.liveGtfsRtUrl = liveGtfsRtUrl;
    }

    public Duration getLiveGtfsRtInitialDelay() {
        return liveGtfsRtInitialDelay;
    }

    public void setLiveGtfsRtInitialDelay(Duration liveGtfsRtInitialDelay) {
        this.liveGtfsRtInitialDelay = liveGtfsRtInitialDelay;
    }

    public Duration getLiveGtfsRtFixedDelay() {
        return liveGtfsRtFixedDelay;
    }

    public void setLiveGtfsRtFixedDelay(Duration liveGtfsRtFixedDelay) {
        this.liveGtfsRtFixedDelay = liveGtfsRtFixedDelay;
    }

    public String getLiveSourceName() {
        return liveSourceName;
    }

    public void setLiveSourceName(String liveSourceName) {
        this.liveSourceName = liveSourceName;
    }

    public boolean isGtfsImportEnabled() {
        return gtfsImportEnabled;
    }

    public void setGtfsImportEnabled(boolean gtfsImportEnabled) {
        this.gtfsImportEnabled = gtfsImportEnabled;
    }

    public String getGtfsZipPath() {
        return gtfsZipPath;
    }

    public void setGtfsZipPath(String gtfsZipPath) {
        this.gtfsZipPath = gtfsZipPath;
    }

    public boolean isGtfsRefreshEnabled() {
        return gtfsRefreshEnabled;
    }

    public void setGtfsRefreshEnabled(boolean gtfsRefreshEnabled) {
        this.gtfsRefreshEnabled = gtfsRefreshEnabled;
    }

    public URI getGtfsRefreshPackageUrl() {
        return gtfsRefreshPackageUrl;
    }

    public void setGtfsRefreshPackageUrl(URI gtfsRefreshPackageUrl) {
        this.gtfsRefreshPackageUrl = gtfsRefreshPackageUrl;
    }

    public Duration getGtfsRefreshInitialDelay() {
        return gtfsRefreshInitialDelay;
    }

    public void setGtfsRefreshInitialDelay(Duration gtfsRefreshInitialDelay) {
        this.gtfsRefreshInitialDelay = gtfsRefreshInitialDelay;
    }

    public Duration getGtfsRefreshFixedDelay() {
        return gtfsRefreshFixedDelay;
    }

    public void setGtfsRefreshFixedDelay(Duration gtfsRefreshFixedDelay) {
        this.gtfsRefreshFixedDelay = gtfsRefreshFixedDelay;
    }

    public int getGtfsRefreshMinServiceDaysRemaining() {
        return gtfsRefreshMinServiceDaysRemaining;
    }

    public void setGtfsRefreshMinServiceDaysRemaining(int gtfsRefreshMinServiceDaysRemaining) {
        this.gtfsRefreshMinServiceDaysRemaining = gtfsRefreshMinServiceDaysRemaining;
    }

    public Duration getGtfsPromotionInitialDelay() {
        return gtfsPromotionInitialDelay;
    }

    public void setGtfsPromotionInitialDelay(Duration gtfsPromotionInitialDelay) {
        this.gtfsPromotionInitialDelay = gtfsPromotionInitialDelay;
    }

    public Duration getGtfsPromotionFixedDelay() {
        return gtfsPromotionFixedDelay;
    }

    public void setGtfsPromotionFixedDelay(Duration gtfsPromotionFixedDelay) {
        this.gtfsPromotionFixedDelay = gtfsPromotionFixedDelay;
    }
}
