package com.calebhabesh.linewatch.gobusposition;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Live GO bus positions on the GO/UP Map View (plan 13, S9): the GO VehiclePosition read the
 * train markers make, with its own switch and freshness limits. Neither this flag nor the train
 * markers' turns on the other's vehicles.
 *
 * GO buses report less often than TTC vehicles (sampled 2026-11-03: buses under way median 17 s,
 * p90 about 160 s), so a bus is stale after 5 min and dropped after 15 (owner decision); the feed
 * itself is stale after 2 min, as for the train markers.
 */
@ConfigurationProperties("linewatch.regional.bus-positions")
public class GoBusPositionProperties {
    private boolean enabled;
    private Duration maxSourceAge = Duration.ofMinutes(2);
    private Duration vehicleStaleAfter = Duration.ofMinutes(5);
    private Duration vehicleMaxAge = Duration.ofMinutes(15);
    /** How often the Map View asks again while buses are shown. */
    private Duration refreshInterval = Duration.ofSeconds(15);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { this.enabled = value; }
    public Duration getMaxSourceAge() { return maxSourceAge; }
    public void setMaxSourceAge(Duration value) { this.maxSourceAge = value; }
    public Duration getVehicleStaleAfter() { return vehicleStaleAfter; }
    public void setVehicleStaleAfter(Duration value) { this.vehicleStaleAfter = value; }
    public Duration getVehicleMaxAge() { return vehicleMaxAge; }
    public void setVehicleMaxAge(Duration value) { this.vehicleMaxAge = value; }
    public Duration getRefreshInterval() { return refreshInterval; }
    public void setRefreshInterval(Duration value) { this.refreshInterval = value; }
}
