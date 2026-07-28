package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class MetrolinxApiClient {
    private static final String GO_ALERTS_PATH = "api/V1/ServiceUpdate/ServiceAlert/All";
    private static final String UP_ALERTS_PATH = "api/V1/UP/Gtfs/Feed/Alerts";
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter METROLINX_DATE_TIME =
        DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss", Locale.CANADA);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final MetrolinxProperties properties;

    public MetrolinxApiClient(
        RestClient metrolinxRestClient,
        ObjectMapper objectMapper,
        MetrolinxProperties properties
    ) {
        this.restClient = metrolinxRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public MetrolinxFeed fetchAlerts() {
        if (!properties.isConfigured()) {
            throw new MetrolinxClientException("Metrolinx API key is not configured");
        }
        JsonNode go = fetch(GO_ALERTS_PATH, "GO service alerts");
        JsonNode up = fetch(UP_ALERTS_PATH, "UP Express alerts");
        validateGo(go);
        validateUp(up);

        List<MetrolinxFetchedRecord> records = new ArrayList<>();
        for (JsonNode message : array(go.path("Messages").path("Message"))) {
            String sourceId = message.path("Code").asText("").trim();
            if (!sourceId.isBlank()) {
                records.add(fetched(MetrolinxSourceSystem.GO_SERVICE_ALERTS, sourceId, message));
            }
        }
        for (JsonNode entity : array(up.path("entity"))) {
            String sourceId = entity.path("id").asText("").trim();
            if (!sourceId.isBlank()) {
                records.add(fetched(MetrolinxSourceSystem.UP_GTFS_ALERTS, sourceId, entity));
            }
        }

        OffsetDateTime goTimestamp = parseTimestamp(go.path("Metadata").path("TimeStamp").asText(""));
        OffsetDateTime upTimestamp = epoch(up.path("header").get("timestamp"));
        OffsetDateTime sourceUpdatedAt = latest(goTimestamp, upTimestamp);
        Map<String, Boolean> completeSources = new LinkedHashMap<>();
        completeSources.put(MetrolinxSourceSystem.GO_SERVICE_ALERTS, true);
        completeSources.put(MetrolinxSourceSystem.UP_GTFS_ALERTS, true);
        return new MetrolinxFeed(sourceUpdatedAt, List.copyOf(records), Map.copyOf(completeSources));
    }

    private JsonNode fetch(String path, String label) {
        try {
            String body = restClient.get()
                .uri(uri(path))
                .retrieve()
                .body(String.class);
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject()) {
                throw new IllegalArgumentException("payload is not an object");
            }
            return root;
        } catch (Exception ignored) {
            // Do not chain the upstream exception: HTTP client messages may contain the key-bearing URI.
            throw new MetrolinxClientException("Unable to fetch Metrolinx " + label);
        }
    }

    private URI uri(String path) {
        return UriComponentsBuilder.fromUri(properties.getBaseUrl())
            .path(path)
            .queryParam("key", properties.getApiKey())
            .build()
            .encode()
            .toUri();
    }

    private void validateGo(JsonNode root) {
        String errorCode = root.path("Metadata").path("ErrorCode").asText("");
        if (!"200".equals(errorCode) || !root.path("Messages").path("Message").isArray()) {
            throw new MetrolinxClientException("Metrolinx GO service-alert response was not a successful full dataset");
        }
    }

    private void validateUp(JsonNode root) {
        String incrementality = root.path("header").path("incrementality").asText("");
        if (!"FULL_DATASET".equalsIgnoreCase(incrementality) || !root.path("entity").isArray()) {
            throw new MetrolinxClientException("Metrolinx UP alert response was not a full dataset");
        }
    }

    private MetrolinxFetchedRecord fetched(String sourceSystem, String sourceId, JsonNode payload) {
        try {
            return new MetrolinxFetchedRecord(sourceSystem, sourceId, objectMapper.writeValueAsString(payload));
        } catch (Exception exception) {
            throw new MetrolinxClientException("Unable to preserve a Metrolinx source record");
        }
    }

    private List<JsonNode> array(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<JsonNode> values = new ArrayList<>();
        node.forEach(values::add);
        return List.copyOf(values);
    }

    private OffsetDateTime parseTimestamp(String value) {
        try {
            return LocalDateTime.parse(value, METROLINX_DATE_TIME).atZone(TORONTO_ZONE).toOffsetDateTime();
        } catch (Exception ignored) {
            return null;
        }
    }

    private OffsetDateTime epoch(JsonNode value) {
        return value == null || !value.canConvertToLong()
            ? null
            : OffsetDateTime.ofInstant(Instant.ofEpochSecond(value.asLong()), ZoneOffset.UTC);
    }

    private OffsetDateTime latest(OffsetDateTime first, OffsetDateTime second) {
        if (first == null) return second;
        if (second == null) return first;
        return first.isAfter(second) ? first : second;
    }
}
