package com.calebhabesh.linewatch.reliability;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Caching and per-client limits for the plan 17 A7 range API. */
@ConfigurationProperties("linewatch.reliability.range")
public class ReliabilityRangeProperties {
    /** Ranges ending before yesterday; evicted per network after each nightly derive. */
    private Duration closedRangeTtl = Duration.ofHours(6);
    private Duration availabilityTtl = Duration.ofMinutes(15);
    private RateLimit rateLimit = new RateLimit();

    public Duration getClosedRangeTtl() { return closedRangeTtl; }
    public void setClosedRangeTtl(Duration closedRangeTtl) { this.closedRangeTtl = closedRangeTtl; }
    public Duration getAvailabilityTtl() { return availabilityTtl; }
    public void setAvailabilityTtl(Duration availabilityTtl) { this.availabilityTtl = availabilityTtl; }
    public RateLimit getRateLimit() { return rateLimit; }
    public void setRateLimit(RateLimit rateLimit) { this.rateLimit = rateLimit; }

    public static class RateLimit {
        private boolean enabled = true;
        private Duration window = Duration.ofMinutes(10);
        /** Uncached range computations (cache misses) per client per window. */
        private int maxComputations = 120;
        /** CSV exports per client per window; exports are never cached. */
        private int maxExports = 10;
        private int maxBuckets = 10_000;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public Duration getWindow() { return window; }
        public void setWindow(Duration window) { this.window = window; }
        public int getMaxComputations() { return maxComputations; }
        public void setMaxComputations(int maxComputations) { this.maxComputations = maxComputations; }
        public int getMaxExports() { return maxExports; }
        public void setMaxExports(int maxExports) { this.maxExports = maxExports; }
        public int getMaxBuckets() { return maxBuckets; }
        public void setMaxBuckets(int maxBuckets) { this.maxBuckets = maxBuckets; }
    }
}
