package com.calebhabesh.linewatch.reliability;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Plan 17 A2: property-enabled runner for backfilling missing historical schedule days and spans
 * from an archived static GTFS zip without activating or retaining the temporary import.
 */
@ConfigurationProperties("linewatch.reliability.schedule-backfill")
public class ReliabilityScheduleBackfillProperties {
    private boolean enabled = false;
    private String source = "";
    private String zipPath = "";
    private String archiveUrl = "";
    private String feedVersion = "";

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getZipPath() { return zipPath; }
    public void setZipPath(String zipPath) { this.zipPath = zipPath; }
    public String getArchiveUrl() { return archiveUrl; }
    public void setArchiveUrl(String archiveUrl) { this.archiveUrl = archiveUrl; }
    public String getFeedVersion() { return feedVersion; }
    public void setFeedVersion(String feedVersion) { this.feedVersion = feedVersion; }
}
