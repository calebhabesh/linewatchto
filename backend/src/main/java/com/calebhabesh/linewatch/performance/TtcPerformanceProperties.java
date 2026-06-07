package com.calebhabesh.linewatch.performance;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.performance.ttc")
public class TtcPerformanceProperties {
    private boolean enabled = true;
    private URI url = URI.create("https://www.ttc.ca/");
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(8);
    private Duration maxAge = Duration.ofHours(24);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public URI getUrl() { return url; }
    public void setUrl(URI url) { this.url = url; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
    public Duration getMaxAge() { return maxAge; }
    public void setMaxAge(Duration maxAge) { this.maxAge = maxAge; }
}
