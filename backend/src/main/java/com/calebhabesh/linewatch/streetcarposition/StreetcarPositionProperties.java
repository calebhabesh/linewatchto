package com.calebhabesh.linewatch.streetcarposition;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Live TTC streetcar positions (plan 13, S4). Enabled and judged fresh on their own,
 * independently of surface trip updates and alerts.
 */
@ConfigurationProperties("linewatch.streetcar-positions")
public class StreetcarPositionProperties {
    private boolean enabled;
    /** The BusTime vehicle feed named by the Open Data Toronto NVAS dataset; ?debug is its text form. */
    private URI url = URI.create("https://bustime.ttc.ca/gtfsrt/vehicles?debug");
    private Duration initialDelay = Duration.ofSeconds(12);
    private Duration fixedDelay = Duration.ofSeconds(15);
    /** The source is stale when its feed header is older than this. */
    private Duration maxSourceAge = Duration.ofMinutes(2);
    /** A car is stale when its own report is older than this. */
    private Duration vehicleStaleAfter = Duration.ofMinutes(2);
    /** A car whose report is older than this is not returned at all. */
    private Duration vehicleMaxAge = Duration.ofMinutes(5);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { this.enabled = value; }
    public URI getUrl() { return url; }
    public void setUrl(URI value) { this.url = value; }
    public Duration getInitialDelay() { return initialDelay; }
    public void setInitialDelay(Duration value) { this.initialDelay = value; }
    public Duration getFixedDelay() { return fixedDelay; }
    public void setFixedDelay(Duration value) { this.fixedDelay = value; }
    public Duration getMaxSourceAge() { return maxSourceAge; }
    public void setMaxSourceAge(Duration value) { this.maxSourceAge = value; }
    public Duration getVehicleStaleAfter() { return vehicleStaleAfter; }
    public void setVehicleStaleAfter(Duration value) { this.vehicleStaleAfter = value; }
    public Duration getVehicleMaxAge() { return vehicleMaxAge; }
    public void setVehicleMaxAge(Duration value) { this.vehicleMaxAge = value; }
}
