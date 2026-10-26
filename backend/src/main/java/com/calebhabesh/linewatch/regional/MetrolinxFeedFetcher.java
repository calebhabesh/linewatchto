package com.calebhabesh.linewatch.regional;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Fetches a Metrolinx JSON feed for the live paths (train markers, trip
 * updates, station arrivals), retrying timeouts, I/O errors, 401, 429 and 5xx
 * responses up to the configured attempts, like alert ingestion does.
 * Metrolinx's gateway rejects roughly one request in three with a fast 401
 * even for a valid key (measured 2026-10-26); an immediate retry succeeds.
 * Failures are logged with a safe reason only (HTTP status or error type):
 * request URLs carry the API key and are never logged.
 */
@Component
public class MetrolinxFeedFetcher {
    private static final Logger log = LoggerFactory.getLogger(MetrolinxFeedFetcher.class);
    private static final Duration LOG_INTERVAL = Duration.ofMinutes(1);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final MetrolinxProperties properties;
    private final Clock clock;
    private final Map<String, Instant> lastLogged = new ConcurrentHashMap<>();

    public MetrolinxFeedFetcher(
        RestClient metrolinxRestClient,
        ObjectMapper objectMapper,
        MetrolinxProperties properties,
        Clock clock
    ) {
        this.restClient = metrolinxRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.clock = clock;
    }

    public JsonNode fetch(String path, String label) {
        if (!properties.isConfigured()) throw new MetrolinxClientException("Metrolinx API key is not configured");
        int attempts = properties.getFetchAttempts();
        String reason = "unknown error";
        for (int attempt = 1; attempt <= attempts; attempt += 1) {
            long started = System.nanoTime();
            try {
                String body = restClient.get().uri(uri(path)).retrieve().body(String.class);
                JsonNode root = objectMapper.readTree(body);
                if (root == null || !root.isObject()) {
                    reason = "payload is not a JSON object";
                    break;
                }
                log.debug("{} attempt {}: ok in {} ms", label, attempt, (System.nanoTime() - started) / 1_000_000);
                return root;
            } catch (Exception exception) {
                reason = safeReason(exception);
                log.debug("{} attempt {}: {} in {} ms", label, attempt, reason, (System.nanoTime() - started) / 1_000_000);
                if (!retryable(exception) || attempt == attempts) break;
                pause();
            }
        }
        logFailure(label, reason);
        throw new MetrolinxClientException("Unable to fetch " + label + " (" + reason + ")");
    }

    /** A description safe to log: never the exception message, which can contain the request URL. */
    static String safeReason(Exception exception) {
        if (exception instanceof RestClientResponseException response) {
            return "HTTP " + response.getStatusCode().value();
        }
        if (exception instanceof ResourceAccessException access) {
            Throwable cause = access.getCause();
            return cause == null ? "I/O error" : cause.getClass().getSimpleName();
        }
        return exception.getClass().getSimpleName();
    }

    private static boolean retryable(Exception exception) {
        if (exception instanceof ResourceAccessException) return true;
        if (exception instanceof RestClientResponseException response) {
            int status = response.getStatusCode().value();
            return status == 401 || status == 429 || status >= 500;
        }
        return false;
    }

    private void pause() {
        long millis = properties.getFetchRetryDelay().toMillis();
        if (millis <= 0) return;
        try {
            Thread.sleep(millis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private void logFailure(String label, String reason) {
        Instant now = clock.instant();
        Instant previous = lastLogged.get(label);
        if (previous != null && Duration.between(previous, now).compareTo(LOG_INTERVAL) < 0) return;
        lastLogged.put(label, now);
        log.warn("{} fetch failed: {}", label, reason);
    }

    private URI uri(String path) {
        return UriComponentsBuilder.fromUri(properties.getBaseUrl()).path(path)
            .queryParam("key", properties.getApiKey()).build().encode().toUri();
    }
}
