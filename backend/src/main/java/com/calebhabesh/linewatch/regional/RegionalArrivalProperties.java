package com.calebhabesh.linewatch.regional;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.regional.arrivals")
public class RegionalArrivalProperties {
    private boolean enabled;
    private Duration cacheTtl = Duration.ofSeconds(30);
    private Duration maxSourceAge = Duration.ofMinutes(5);
    private Duration horizon = Duration.ofHours(3);
    private int maxArrivalsPerLine = 4;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getCacheTtl() { return cacheTtl; }
    public void setCacheTtl(Duration cacheTtl) { this.cacheTtl = cacheTtl; }
    public Duration getMaxSourceAge() { return maxSourceAge; }
    public void setMaxSourceAge(Duration maxSourceAge) { this.maxSourceAge = maxSourceAge; }
    public Duration getHorizon() { return horizon; }
    public void setHorizon(Duration horizon) { this.horizon = horizon; }
    public int getMaxArrivalsPerLine() { return maxArrivalsPerLine; }
    public void setMaxArrivalsPerLine(int maxArrivalsPerLine) { this.maxArrivalsPerLine = maxArrivalsPerLine; }
}
