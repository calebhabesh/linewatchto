package com.calebhabesh.linewatch.regional;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Optional language-model reading of Metrolinx notice text. In primary mode a confident, validated
 * reading classifies the notice and the deterministic classifier is the fallback; shadow mode only
 * records where the two differ.
 */
@ConfigurationProperties("linewatch.ingestion.metrolinx.extraction")
public class RegionalAlertExtractionProperties {
    public enum Mode { SHADOW, PRIMARY }

    private boolean enabled;
    private Mode mode = Mode.PRIMARY;
    private URI baseUrl = URI.create("https://generativelanguage.googleapis.com/v1beta/");
    private String apiKey = "";
    private String model = "gemini-3.5-flash-lite";
    private Duration initialDelay = Duration.ofSeconds(30);
    private Duration fixedDelay = Duration.ofMinutes(1);
    private int maxRequestsPerRun = 5;
    private int dailyRequestBudget = 400;
    private int maxAttempts = 5;
    private Duration retryBackoff = Duration.ofMinutes(5);
    private Duration maxRetryBackoff = Duration.ofHours(6);
    private Duration feedPresenceWindow = Duration.ofMinutes(30);
    private Duration connectTimeout = Duration.ofSeconds(5);
    private Duration readTimeout = Duration.ofSeconds(20);
    private int pollRequestLimit = 5;
    private Duration pollTimeBudget = Duration.ofSeconds(15);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Mode getMode() { return mode == null ? Mode.PRIMARY : mode; }
    public void setMode(Mode mode) { this.mode = mode; }
    public boolean primary() { return isActive() && getMode() == Mode.PRIMARY; }
    public URI getBaseUrl() { return baseUrl; }
    public void setBaseUrl(URI baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey == null ? "" : apiKey.trim(); }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getModel() { return model == null ? "" : model.trim().toLowerCase(Locale.ROOT); }
    public void setModel(String model) { this.model = model; }
    /** Enabled and able to call a model. */
    public boolean isActive() { return enabled && !getApiKey().isEmpty() && !getModel().isEmpty(); }
    public Duration getInitialDelay() { return initialDelay; }
    public void setInitialDelay(Duration initialDelay) { this.initialDelay = initialDelay; }
    public Duration getFixedDelay() { return fixedDelay; }
    public void setFixedDelay(Duration fixedDelay) { this.fixedDelay = fixedDelay; }
    public int getMaxRequestsPerRun() { return Math.max(1, maxRequestsPerRun); }
    public void setMaxRequestsPerRun(int maxRequestsPerRun) { this.maxRequestsPerRun = maxRequestsPerRun; }
    public int getDailyRequestBudget() { return Math.max(0, dailyRequestBudget); }
    public void setDailyRequestBudget(int dailyRequestBudget) { this.dailyRequestBudget = dailyRequestBudget; }
    public int getMaxAttempts() { return Math.max(1, maxAttempts); }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
    public Duration getRetryBackoff() { return positive(retryBackoff, Duration.ofMinutes(5)); }
    public void setRetryBackoff(Duration retryBackoff) { this.retryBackoff = retryBackoff; }
    public Duration getMaxRetryBackoff() { return positive(maxRetryBackoff, Duration.ofHours(6)); }
    public void setMaxRetryBackoff(Duration maxRetryBackoff) { this.maxRetryBackoff = maxRetryBackoff; }
    public Duration getFeedPresenceWindow() { return positive(feedPresenceWindow, Duration.ofMinutes(30)); }
    public void setFeedPresenceWindow(Duration feedPresenceWindow) { this.feedPresenceWindow = feedPresenceWindow; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    /** New notices read during a Metrolinx poll, before its alerts are stored; the rest wait for the job. */
    public int getPollRequestLimit() { return Math.max(0, pollRequestLimit); }
    public void setPollRequestLimit(int pollRequestLimit) { this.pollRequestLimit = pollRequestLimit; }
    /** No new request starts once a poll has spent this long reading notices. */
    public Duration getPollTimeBudget() { return positive(pollTimeBudget, Duration.ofSeconds(15)); }
    public void setPollTimeBudget(Duration pollTimeBudget) { this.pollTimeBudget = pollTimeBudget; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }

    private static Duration positive(Duration value, Duration fallback) {
        return value == null || value.isNegative() || value.isZero() ? fallback : value;
    }
}
