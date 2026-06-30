package com.calebhabesh.linewatch.ingestion;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.ingestion.alerts")
public class AlertIngestionProperties {
    private static final URI DEFAULT_BUS_GTFS_RT_URL =
        URI.create("https://gtfsrt.ttc.ca/alerts/bus?format=text");
    private static final URI DEFAULT_STREETCAR_GTFS_RT_URL =
        URI.create("https://gtfsrt.ttc.ca/alerts/streetcar?format=text");

    private boolean enabled;
    private URI url = URI.create("https://alerts.ttc.ca/api/alerts/live-alerts");
    private boolean surfaceGtfsRtEnabled = true;
    private URI surfaceGtfsRtUrl;
    private List<URI> surfaceGtfsRtUrls = List.of(
        DEFAULT_BUS_GTFS_RT_URL,
        DEFAULT_STREETCAR_GTFS_RT_URL
    );
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

    public boolean isSurfaceGtfsRtEnabled() {
        return surfaceGtfsRtEnabled;
    }

    public void setSurfaceGtfsRtEnabled(boolean surfaceGtfsRtEnabled) {
        this.surfaceGtfsRtEnabled = surfaceGtfsRtEnabled;
    }

    public URI getSurfaceGtfsRtUrl() {
        if (surfaceGtfsRtUrl != null) {
            return surfaceGtfsRtUrl;
        }
        return surfaceGtfsRtUrls.isEmpty() ? null : surfaceGtfsRtUrls.getFirst();
    }

    public void setSurfaceGtfsRtUrl(URI surfaceGtfsRtUrl) {
        this.surfaceGtfsRtUrl = surfaceGtfsRtUrl;
        this.surfaceGtfsRtUrls = sanitizeUrls(
            surfaceGtfsRtUrl == null ? List.of() : List.of(surfaceGtfsRtUrl)
        );
    }

    public List<URI> getSurfaceGtfsRtUrls() {
        return List.copyOf(surfaceGtfsRtUrls);
    }

    public void setSurfaceGtfsRtUrls(List<URI> surfaceGtfsRtUrls) {
        this.surfaceGtfsRtUrls = sanitizeUrls(surfaceGtfsRtUrls);
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

    private List<URI> sanitizeUrls(List<URI> urls) {
        if (urls == null) {
            return List.of();
        }
        return urls.stream()
            .filter(uri -> uri != null && !uri.toString().isBlank())
            .toList();
    }
}
