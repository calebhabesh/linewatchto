package com.calebhabesh.linewatch.surfacearrival;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.surface-arrivals")
public class SurfaceArrivalProperties {
    private boolean ttcEnabled;
    private URI ttcBusUrl = URI.create("https://gtfsrt.ttc.ca/trips/bus?format=text");
    private URI ttcStreetcarUrl = URI.create("https://gtfsrt.ttc.ca/trips/streetcar?format=text");
    private Duration ttcInitialDelay = Duration.ofSeconds(10);
    private Duration ttcFixedDelay = Duration.ofSeconds(15);
    private Duration ttcMaxSourceAge = Duration.ofMinutes(2);
    private boolean regionalEnabled;
    private Duration regionalCacheTtl = Duration.ofSeconds(30);
    private Duration regionalMaxSourceAge = Duration.ofMinutes(5);
    private Duration horizon = Duration.ofHours(2);
    private int maxArrivalsPerRoute = 3;

    public boolean isTtcEnabled() { return ttcEnabled; }
    public void setTtcEnabled(boolean value) { this.ttcEnabled = value; }
    public URI getTtcBusUrl() { return ttcBusUrl; }
    public void setTtcBusUrl(URI value) { this.ttcBusUrl = value; }
    public URI getTtcStreetcarUrl() { return ttcStreetcarUrl; }
    public void setTtcStreetcarUrl(URI value) { this.ttcStreetcarUrl = value; }
    public Duration getTtcInitialDelay() { return ttcInitialDelay; }
    public void setTtcInitialDelay(Duration value) { this.ttcInitialDelay = value; }
    public Duration getTtcFixedDelay() { return ttcFixedDelay; }
    public void setTtcFixedDelay(Duration value) { this.ttcFixedDelay = value; }
    public Duration getTtcMaxSourceAge() { return ttcMaxSourceAge; }
    public void setTtcMaxSourceAge(Duration value) { this.ttcMaxSourceAge = value; }
    public boolean isRegionalEnabled() { return regionalEnabled; }
    public void setRegionalEnabled(boolean value) { this.regionalEnabled = value; }
    public Duration getRegionalCacheTtl() { return regionalCacheTtl; }
    public void setRegionalCacheTtl(Duration value) { this.regionalCacheTtl = value; }
    public Duration getRegionalMaxSourceAge() { return regionalMaxSourceAge; }
    public void setRegionalMaxSourceAge(Duration value) { this.regionalMaxSourceAge = value; }
    public Duration getHorizon() { return horizon; }
    public void setHorizon(Duration value) { this.horizon = value; }
    public int getMaxArrivalsPerRoute() { return maxArrivalsPerRoute; }
    public void setMaxArrivalsPerRoute(int value) { this.maxArrivalsPerRoute = value; }
}
