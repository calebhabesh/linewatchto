package com.calebhabesh.linewatch.reliability;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Plan 17 A10: independent enablement and cadence gates for supplemental reliability sources
 * (D5 GO/UP on-time performance, D6 TTC official delay log, and TTC performance history).
 * None of these feeds LineWatchTO-observed disruption minutes.
 */
@ConfigurationProperties("linewatch.reliability.sources")
public class ReliabilitySourcesProperties {
    private RegionalOtp regionalOtp = new RegionalOtp();
    private TtcDelayLog ttcDelayLog = new TtcDelayLog();
    private TtcPerformanceHistory ttcPerformanceHistory = new TtcPerformanceHistory();

    public RegionalOtp getRegionalOtp() { return regionalOtp; }
    public void setRegionalOtp(RegionalOtp regionalOtp) { this.regionalOtp = regionalOtp; }
    public TtcDelayLog getTtcDelayLog() { return ttcDelayLog; }
    public void setTtcDelayLog(TtcDelayLog ttcDelayLog) { this.ttcDelayLog = ttcDelayLog; }
    public TtcPerformanceHistory getTtcPerformanceHistory() { return ttcPerformanceHistory; }
    public void setTtcPerformanceHistory(TtcPerformanceHistory ttcPerformanceHistory) { this.ttcPerformanceHistory = ttcPerformanceHistory; }

    public static class RegionalOtp {
        private boolean enabled = false;
        private Duration initialDelay = Duration.ofSeconds(45);
        private Duration fixedDelay = Duration.ofSeconds(60);
        /** Metrolinx published on-time definition: arrival at final destination within 5 minutes. */
        private int onTimeThresholdSeconds = 300;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public Duration getInitialDelay() { return initialDelay; }
        public void setInitialDelay(Duration initialDelay) { this.initialDelay = initialDelay; }
        public Duration getFixedDelay() { return fixedDelay; }
        public void setFixedDelay(Duration fixedDelay) { this.fixedDelay = fixedDelay; }
        public int getOnTimeThresholdSeconds() { return onTimeThresholdSeconds; }
        public void setOnTimeThresholdSeconds(int onTimeThresholdSeconds) { this.onTimeThresholdSeconds = onTimeThresholdSeconds; }
    }

    public static class TtcDelayLog {
        private boolean enabled = false;
        private String packageUrl = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ttc-subway-delay-data";
        private Duration initialDelay = Duration.ofSeconds(90);
        private Duration fixedDelay = Duration.ofHours(24);
        private Duration connectTimeout = Duration.ofSeconds(10);
        private Duration readTimeout = Duration.ofSeconds(30);

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getPackageUrl() { return packageUrl; }
        public void setPackageUrl(String packageUrl) { this.packageUrl = packageUrl; }
        public Duration getInitialDelay() { return initialDelay; }
        public void setInitialDelay(Duration initialDelay) { this.initialDelay = initialDelay; }
        public Duration getFixedDelay() { return fixedDelay; }
        public void setFixedDelay(Duration fixedDelay) { this.fixedDelay = fixedDelay; }
        public Duration getConnectTimeout() { return connectTimeout; }
        public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
        public Duration getReadTimeout() { return readTimeout; }
        public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
    }

    public static class TtcPerformanceHistory {
        private boolean enabled = true;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
    }
}
