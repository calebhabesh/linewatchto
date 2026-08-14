package com.calebhabesh.linewatch.regional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.calebhabesh.linewatch.surfacearrival.RegionalSurfaceArrivalFeed;
import com.calebhabesh.linewatch.surfacearrival.SurfaceArrivalRecord;
import java.net.URI;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class MetrolinxArrivalClient {
    static final String GO_SOURCE = "Metrolinx GO Next Service";
    static final String UP_SOURCE = "Metrolinx UP Express GTFS-RT Trip Updates";
    private static final String GO_NEXT_SERVICE_PATH = "api/V1/Stop/NextService/";
    static final String UP_TRIP_UPDATES_PATH = "api/V1/UP/Gtfs/Feed/TripUpdates";
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter METROLINX_DATE_TIME =
        DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss", Locale.CANADA);
    private static final Map<String, String> GO_LINE_IDS = Map.of(
        "BR", "regional-br",
        "GT", "regional-ki",
        "KI", "regional-ki",
        "LE", "regional-le",
        "LW", "regional-lw",
        "MI", "regional-mi",
        "RH", "regional-rh",
        "ST", "regional-st"
    );

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final MetrolinxProperties properties;
    private final MetrolinxUpTripUpdateParser upTripUpdateParser;

    public MetrolinxArrivalClient(
        RestClient metrolinxRestClient,
        ObjectMapper objectMapper,
        MetrolinxProperties properties,
        MetrolinxUpTripUpdateParser upTripUpdateParser
    ) {
        this.restClient = metrolinxRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.upTripUpdateParser = upTripUpdateParser;
    }

    public RegionalArrivalFeed fetchGoNextService(String stopCode) {
        JsonNode root = fetch(GO_NEXT_SERVICE_PATH + stopCode, "GO station arrivals");
        if (!"200".equals(root.path("Metadata").path("ErrorCode").asText(""))) {
            throw new MetrolinxClientException("Metrolinx GO station-arrival response was unsuccessful");
        }
        List<RegionalArrivalRecord> arrivals = new ArrayList<>();
        for (JsonNode row : array(root.path("NextService").path("Lines"))) {
            if (!"T".equalsIgnoreCase(row.path("ServiceType").asText(""))) {
                continue;
            }
            String lineId = GO_LINE_IDS.get(normalize(row.path("LineCode").asText("")));
            OffsetDateTime predictedAt = parseTimestamp(row.path("ComputedDepartureTime").asText(""));
            if (lineId == null || predictedAt == null) {
                continue;
            }
            OffsetDateTime scheduledAt = parseTimestamp(row.path("ScheduledDepartureTime").asText(""));
            arrivals.add(new RegionalArrivalRecord(
                lineId,
                destination(row.path("DirectionName").asText("")),
                scheduledAt == null ? predictedAt : scheduledAt,
                predictedAt,
                preferred(row.path("ActualPlatform").asText(""), row.path("ScheduledPlatform").asText("")),
                row.path("TripNumber").asText("").trim(),
                GO_SOURCE,
                "live"
            ));
        }
        return new RegionalArrivalFeed(
            parseTimestamp(root.path("Metadata").path("TimeStamp").asText("")),
            List.copyOf(arrivals)
        );
    }

    public RegionalSurfaceArrivalFeed fetchGoBusNextService(String stationId, String stopCode) {
        JsonNode root = fetch(GO_NEXT_SERVICE_PATH + stopCode, "GO Bus station connections");
        if (!"200".equals(root.path("Metadata").path("ErrorCode").asText(""))) {
            throw new MetrolinxClientException("Metrolinx GO Bus station-arrival response was unsuccessful");
        }
        List<SurfaceArrivalRecord> arrivals = new ArrayList<>();
        for (JsonNode row : array(root.path("NextService").path("Lines"))) {
            if (!"B".equalsIgnoreCase(row.path("ServiceType").asText(""))) continue;
            OffsetDateTime scheduledAt = parseTimestamp(row.path("ScheduledDepartureTime").asText(""));
            OffsetDateTime computedAt = parseTimestamp(row.path("ComputedDepartureTime").asText(""));
            OffsetDateTime predictedAt = computedAt == null ? scheduledAt : computedAt;
            String route = row.path("LineCode").asText("").trim();
            if (route.isEmpty() || predictedAt == null) continue;
            arrivals.add(new SurfaceArrivalRecord(
                stationId,
                "GO Transit",
                "bus",
                route,
                row.path("LineName").asText("").trim(),
                destination(row.path("DirectionName").asText("")),
                scheduledAt,
                predictedAt,
                preferred(row.path("ActualPlatform").asText(""), row.path("ScheduledPlatform").asText("")),
                row.path("StopCode").asText(stopCode).trim(),
                row.path("TripNumber").asText("").trim(),
                "Metrolinx GO Next Service",
                computedAt == null ? "scheduled" : "live"
            ));
        }
        return new RegionalSurfaceArrivalFeed(
            parseTimestamp(root.path("Metadata").path("TimeStamp").asText("")),
            List.copyOf(arrivals)
        );
    }

    public RegionalArrivalFeed fetchUpTripUpdates(String stopCode) {
        UpTripUpdateFeed feed = fetchUpTripUpdateFeed();
        List<RegionalArrivalRecord> arrivals = new ArrayList<>();
        for (UpTripUpdateFeed.Trip trip : feed.trips()) {
            trip.stopTime(stopCode).ifPresent(stopTime -> arrivals.add(new RegionalArrivalRecord(
                "regional-up", trip.destination(), stopTime.scheduledAt(), stopTime.predictedAt(), "",
                trip.tripId(), UP_SOURCE, "live"
            )));
        }
        return new RegionalArrivalFeed(feed.sourceUpdatedAt(), List.copyOf(arrivals));
    }

    public UpTripUpdateFeed fetchUpTripUpdateFeed() {
        return upTripUpdateParser.parse(fetch(UP_TRIP_UPDATES_PATH, "UP Express trip updates"));
    }

    private JsonNode fetch(String path, String label) {
        if (!properties.isConfigured()) {
            throw new MetrolinxClientException("Metrolinx API key is not configured");
        }
        try {
            String body = restClient.get().uri(uri(path)).retrieve().body(String.class);
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject()) {
                throw new IllegalArgumentException("payload is not an object");
            }
            return root;
        } catch (MetrolinxClientException exception) {
            throw exception;
        } catch (Exception ignored) {
            throw new MetrolinxClientException("Unable to fetch Metrolinx " + label);
        }
    }

    private URI uri(String path) {
        return UriComponentsBuilder.fromUri(properties.getBaseUrl())
            .path(path)
            .queryParam("key", properties.getApiKey())
            .build().encode().toUri();
    }

    private List<JsonNode> array(JsonNode node) {
        if (node == null || !node.isArray()) return List.of();
        List<JsonNode> values = new ArrayList<>();
        node.forEach(values::add);
        return values;
    }

    private OffsetDateTime parseTimestamp(String value) {
        try {
            return LocalDateTime.parse(value, METROLINX_DATE_TIME).atZone(TORONTO_ZONE).toOffsetDateTime();
        } catch (Exception ignored) {
            return null;
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.CANADA);
    }

    private String destination(String value) {
        String normalized = value == null ? "" : value.trim();
        int separator = normalized.indexOf(" - ");
        return separator >= 0 ? normalized.substring(separator + 3).trim() : normalized;
    }

    private String preferred(String first, String second) {
        String primary = first == null ? "" : first.trim();
        return primary.isEmpty() ? (second == null ? "" : second.trim()) : primary;
    }
}
