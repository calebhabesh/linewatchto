package com.calebhabesh.linewatch.regional;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.regional.train-markers")
public class RegionalTrainMarkerProperties {
    private boolean enabled;
    private Duration cacheTtl = Duration.ofSeconds(15);
    private Duration maxSourceAge = Duration.ofMinutes(2);
    private Duration retentionTtl = Duration.ofSeconds(90);
    private int maxMarkers = 80;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getCacheTtl() { return cacheTtl; }
    public void setCacheTtl(Duration cacheTtl) { this.cacheTtl = cacheTtl; }
    public Duration getMaxSourceAge() { return maxSourceAge; }
    public void setMaxSourceAge(Duration maxSourceAge) { this.maxSourceAge = maxSourceAge; }
    public Duration getRetentionTtl() { return retentionTtl; }
    public void setRetentionTtl(Duration retentionTtl) { this.retentionTtl = retentionTtl; }
    public int getMaxMarkers() { return maxMarkers; }
    public void setMaxMarkers(int maxMarkers) { this.maxMarkers = maxMarkers; }
}
