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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class MetrolinxApiClient {
    private static final Logger log = LoggerFactory.getLogger(MetrolinxApiClient.class);
    private static final String GO_SERVICE_ALERTS_PATH = "api/V1/ServiceUpdate/ServiceAlert/All";
    private static final String GO_INFORMATION_ALERTS_PATH = "api/V1/ServiceUpdate/InformationAlert/All";
    private static final String GO_MARKETING_ALERTS_PATH = "api/V1/ServiceUpdate/MarketingAlert/All";
    private static final String GO_GTFS_ALERTS_PATH = "api/V1/Gtfs/Feed/Alerts";
    private static final String GO_TRAIN_EXCEPTIONS_PATH = "api/V1/ServiceUpdate/Exceptions/Train";
    private static final String GO_GTFS_TRIP_UPDATES_PATH = "api/V1/Gtfs/Feed/TripUpdates";
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
        JsonNode goService = fetch(GO_SERVICE_ALERTS_PATH, "GO service alerts");
        JsonNode goInformation = fetchOptionalRest(GO_INFORMATION_ALERTS_PATH, "GO information alerts");
        JsonNode goMarketing = fetchOptionalRest(GO_MARKETING_ALERTS_PATH, "GO marketing alerts");
        JsonNode goGtfs = fetchOptional(GO_GTFS_ALERTS_PATH, "GO GTFS-RT alerts");
        JsonNode goTrainExceptions = fetchOptionalRest(GO_TRAIN_EXCEPTIONS_PATH, "GO train exceptions");
        JsonNode goTripUpdates = fetchOptional(GO_GTFS_TRIP_UPDATES_PATH, "GO GTFS-RT trip updates");
        JsonNode up = fetch(UP_ALERTS_PATH, "UP Express alerts");
        validateRestAlerts(goService, "service-alert");
        validateGtfsAlerts(up, "UP");
        boolean informationComplete = isSuccessfulRestAlerts(goInformation);
        boolean marketingComplete = isSuccessfulRestAlerts(goMarketing);
        boolean goGtfsComplete = isFullGtfsFeed(goGtfs);
        boolean trainExceptionsComplete = isSuccessfulTrainExceptions(goTrainExceptions);
        boolean goTripUpdatesComplete = isFullGtfsFeed(goTripUpdates);
        logIfIncomplete("GO information alerts", goInformation, informationComplete);
        logIfIncomplete("GO marketing alerts", goMarketing, marketingComplete);
        logIfIncomplete("GO GTFS-RT alerts", goGtfs, goGtfsComplete);
        logIfIncomplete("GO train exceptions", goTrainExceptions, trainExceptionsComplete);
        logIfIncomplete("GO GTFS-RT trip updates", goTripUpdates, goTripUpdatesComplete);

        List<MetrolinxFetchedRecord> records = new ArrayList<>();
        appendRestAlerts(records, goService, MetrolinxSourceSystem.GO_SERVICE_ALERTS);
        if (informationComplete) appendRestAlerts(records, goInformation, MetrolinxSourceSystem.GO_INFORMATION_ALERTS);
        if (marketingComplete) appendRestAlerts(records, goMarketing, MetrolinxSourceSystem.GO_MARKETING_ALERTS);
        if (goGtfsComplete) appendGtfsAlerts(records, goGtfs, MetrolinxSourceSystem.GO_GTFS_ALERTS);
        if (trainExceptionsComplete) appendTrainExceptions(records, goTrainExceptions);
        if (goTripUpdatesComplete) appendGtfsTripUpdates(records, goTripUpdates);
        appendGtfsAlerts(records, up, MetrolinxSourceSystem.UP_GTFS_ALERTS);

        OffsetDateTime sourceUpdatedAt = latest(
            parseTimestamp(goService.path("Metadata").path("TimeStamp").asText("")),
            informationComplete ? restTimestamp(goInformation) : null,
            marketingComplete ? restTimestamp(goMarketing) : null,
            goGtfsComplete ? epoch(goGtfs.path("header").get("timestamp")) : null,
            trainExceptionsComplete ? restTimestamp(goTrainExceptions) : null,
            goTripUpdatesComplete ? epoch(goTripUpdates.path("header").get("timestamp")) : null,
            epoch(up.path("header").get("timestamp"))
        );
        Map<String, Boolean> completeSources = new LinkedHashMap<>();
        completeSources.put(MetrolinxSourceSystem.GO_SERVICE_ALERTS, true);
        completeSources.put(MetrolinxSourceSystem.GO_INFORMATION_ALERTS, informationComplete);
        completeSources.put(MetrolinxSourceSystem.GO_MARKETING_ALERTS, marketingComplete);
        completeSources.put(MetrolinxSourceSystem.GO_GTFS_ALERTS, goGtfsComplete);
        completeSources.put(MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, trainExceptionsComplete);
        completeSources.put(MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, goTripUpdatesComplete);
        completeSources.put(MetrolinxSourceSystem.UP_GTFS_ALERTS, true);
        Map<String, OffsetDateTime> sourceUpdatedAts = new LinkedHashMap<>();
        putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.GO_SERVICE_ALERTS, restTimestamp(goService));
        if (informationComplete) putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.GO_INFORMATION_ALERTS, restTimestamp(goInformation));
        if (marketingComplete) putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.GO_MARKETING_ALERTS, restTimestamp(goMarketing));
        if (goGtfsComplete) putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.GO_GTFS_ALERTS, epoch(goGtfs.path("header").get("timestamp")));
        if (trainExceptionsComplete) putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS, restTimestamp(goTrainExceptions));
        if (goTripUpdatesComplete) putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, epoch(goTripUpdates.path("header").get("timestamp")));
        putTimestamp(sourceUpdatedAts, MetrolinxSourceSystem.UP_GTFS_ALERTS, epoch(up.path("header").get("timestamp")));
        return new MetrolinxFeed(
            sourceUpdatedAt,
            List.copyOf(records),
            Map.copyOf(completeSources),
            Map.copyOf(sourceUpdatedAts)
        );
    }

    private void appendRestAlerts(List<MetrolinxFetchedRecord> records, JsonNode root, String sourceSystem) {
        for (JsonNode message : restMessages(root)) {
            append(records, sourceSystem, message.path("Code").asText("").trim(), message);
        }
    }

    private void appendGtfsAlerts(List<MetrolinxFetchedRecord> records, JsonNode root, String sourceSystem) {
        for (JsonNode entity : array(root.path("entity"))) {
            append(records, sourceSystem, entity.path("id").asText("").trim(), entity);
        }
    }

    private void appendTrainExceptions(List<MetrolinxFetchedRecord> records, JsonNode root) {
        for (JsonNode trip : trainExceptionTrips(root)) {
            append(
                records,
                MetrolinxSourceSystem.GO_TRAIN_EXCEPTIONS,
                trip.path("TripNumber").asText("").trim(),
                trip
            );
        }
    }

    private void appendGtfsTripUpdates(List<MetrolinxFetchedRecord> records, JsonNode root) {
        for (JsonNode entity : array(root.path("entity"))) {
            String sourceId = entity.path("id").asText("").trim();
            if (sourceId.isBlank()) {
                sourceId = entity.path("trip_update").path("trip").path("trip_id").asText("").trim();
            }
            append(records, MetrolinxSourceSystem.GO_GTFS_TRIP_UPDATES, sourceId, entity);
        }
    }

    private void append(List<MetrolinxFetchedRecord> records, String sourceSystem, String sourceId, JsonNode payload) {
        if (!sourceId.isBlank()) {
            records.add(fetched(sourceSystem, sourceId, payload));
        }
    }

    private JsonNode fetch(String path, String label) {
        return fetch(path, label, false);
    }

    private JsonNode fetch(String path, String label, boolean acceptNoContent) {
        try {
            ResponseEntity<String> response = restClient.get()
                .uri(uri(path))
                .retrieve()
                .toEntity(String.class);
            if (acceptNoContent && response.getStatusCode() == HttpStatus.NO_CONTENT) {
                return objectMapper.createObjectNode().set(
                    "Metadata",
                    objectMapper.createObjectNode()
                        .put("ErrorCode", "204")
                        .put("ErrorMessage", "No Content")
                );
            }
            String body = response.getBody();
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

    private JsonNode fetchOptional(String path, String label) {
        try {
            return fetch(path, label);
        } catch (MetrolinxClientException exception) {
            log.warn("Metrolinx supplemental collection is unavailable: {}", label);
            return null;
        }
    }

    private JsonNode fetchOptionalRest(String path, String label) {
        try {
            return fetch(path, label, true);
        } catch (MetrolinxClientException exception) {
            log.warn("Metrolinx supplemental collection is unavailable: {}", label);
            return null;
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

    private void validateRestAlerts(JsonNode root, String label) {
        if (!isSuccessfulRestAlerts(root)) {
            throw new MetrolinxClientException("Metrolinx GO " + label + " response was not a successful full dataset");
        }
    }

    private void validateGtfsAlerts(JsonNode root, String label) {
        if (!isFullGtfsFeed(root)) {
            throw new MetrolinxClientException("Metrolinx " + label + " GTFS-RT alert response was not a full dataset");
        }
    }

    private boolean isSuccessfulRestAlerts(JsonNode root) {
        if (root == null || !root.isObject()) return false;
        String errorCode = root.path("Metadata").path("ErrorCode").asText("");
        if ("204".equals(errorCode)) return true;
        if (!"200".equals(errorCode)) return false;
        JsonNode messages = root.path("Messages");
        if (!messages.isObject()) return false;
        JsonNode message = messages.get("Message");
        return message == null || message.isNull() || message.isArray() || message.isObject();
    }

    private boolean isSuccessfulTrainExceptions(JsonNode root) {
        if (root == null || !root.isObject()) return false;
        String errorCode = root.path("Metadata").path("ErrorCode").asText("");
        if ("204".equals(errorCode)) return true;
        if (!"200".equals(errorCode)) return false;
        JsonNode trips = trainExceptionValue(root);
        if (trips == null) return false;
        return trips.isNull() || trips.isArray() || trips.isObject();
    }

    private boolean isFullGtfsFeed(JsonNode root) {
        return root != null
            && "FULL_DATASET".equalsIgnoreCase(root.path("header").path("incrementality").asText(""))
            && root.path("entity").isArray();
    }

    private void logIfIncomplete(String label, JsonNode root, boolean complete) {
        if (complete || root == null) return;
        String errorCode = root.path("Metadata").path("ErrorCode").asText("");
        String errorMessage = root.path("Metadata").path("ErrorMessage").asText("");
        log.warn("Metrolinx supplemental collection is incomplete: {} (code={}, message={})",
            label, safeLogValue(errorCode), safeLogValue(errorMessage));
    }

    private String safeLogValue(String value) {
        if (value == null || value.isBlank()) return "unavailable";
        String singleLine = value.replace('\n', ' ').replace('\r', ' ').trim();
        return singleLine.substring(0, Math.min(singleLine.length(), 200));
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

    private List<JsonNode> restMessages(JsonNode root) {
        if (root == null) return List.of();
        JsonNode message = root.path("Messages").get("Message");
        if (message == null || message.isNull()) return List.of();
        return message.isObject() ? List.of(message) : array(message);
    }

    private List<JsonNode> trainExceptionTrips(JsonNode root) {
        JsonNode trips = trainExceptionValue(root);
        if (trips == null || trips.isNull()) return List.of();
        return trips.isObject() ? List.of(trips) : array(trips);
    }

    private JsonNode trainExceptionValue(JsonNode root) {
        if (root == null) return null;
        JsonNode direct = root.get("Trip");
        if (direct != null) return direct;
        JsonNode wrapper = root.get("Trips");
        return wrapper == null || !wrapper.isObject() ? null : wrapper.get("Trip");
    }

    private List<JsonNode> values(JsonNode root, String field) {
        if (root == null) return List.of();
        JsonNode value = root.get(field);
        if (value == null || value.isNull()) return List.of();
        return value.isObject() ? List.of(value) : array(value);
    }

    private OffsetDateTime restTimestamp(JsonNode root) {
        return root == null ? null : parseTimestamp(root.path("Metadata").path("TimeStamp").asText(""));
    }

    private void putTimestamp(Map<String, OffsetDateTime> timestamps, String sourceSystem, OffsetDateTime value) {
        if (value != null) timestamps.put(sourceSystem, value);
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

    private OffsetDateTime latest(OffsetDateTime... values) {
        OffsetDateTime latest = null;
        for (OffsetDateTime value : values) {
            if (value != null && (latest == null || value.isAfter(latest))) {
                latest = value;
            }
        }
        return latest;
    }
}
