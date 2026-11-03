package com.calebhabesh.linewatch.streetcarposition;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Live TTC bus positions (plan 13, S8): the S4 vehicle feed read, with their own switch. The feed
 * URL, cadence and freshness limits are the streetcar ones ({@link StreetcarPositionProperties}):
 * one read serves both, and neither flag turns on the other's positions.
 */
@ConfigurationProperties("linewatch.bus-positions")
public class BusPositionProperties {
    private boolean enabled;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { this.enabled = value; }
}
