package com.calebhabesh.linewatch.ingestion;

import com.calebhabesh.linewatch.surface.GtfsRtServiceAlertTextParser;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.SocketTimeoutException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class TtcAlertClient {
    private static final Logger log = LoggerFactory.getLogger(TtcAlertClient.class);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AlertIngestionProperties properties;
    private final GtfsRtServiceAlertTextParser gtfsRtServiceAlertTextParser;

    public TtcAlertClient(
        RestClient ttcAlertRestClient,
        ObjectMapper objectMapper,
        AlertIngestionProperties properties,
        GtfsRtServiceAlertTextParser gtfsRtServiceAlertTextParser
    ) {
        this.restClient = ttcAlertRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.gtfsRtServiceAlertTextParser = gtfsRtServiceAlertTextParser;
    }

    public TtcAlertFeed fetch() {
        try {
            String body = restClient.get()
                .uri(properties.getUrl())
                .retrieve()
                .body(String.class);
            TtcAlertFeed feed = parse(body);
            List<TtcFetchedRecord> gtfsRtServiceAlerts = fetchGtfsRtServiceAlertRecords();
            if (gtfsRtServiceAlerts.isEmpty()) {
                return feed;
            }

            List<TtcFetchedRecord> routes = new ArrayList<>(feed.routes());
            routes.addAll(gtfsRtServiceAlerts);
            return new TtcAlertFeed(
                feed.lastUpdated(),
                List.copyOf(routes),
                feed.accessibility(),
                feed.siteWideAnnouncements(),
                feed.generalAnnouncements()
            );
        } catch (TtcAlertClientException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            throw new TtcAlertClientException(
                "TTC Live Alerts returned HTTP " + exception.getStatusCode().value(),
                exception,
                TtcSourceFetchStatus.HTTP_ERROR,
                exception.getStatusCode().value()
            );
        } catch (Exception exception) {
            throw new TtcAlertClientException(
                "Unable to fetch TTC Live Alerts",
                exception,
                containsSocketTimeout(exception)
                    ? TtcSourceFetchStatus.TIMEOUT
                    : TtcSourceFetchStatus.REQUEST_ERROR,
                null
            );
        }
    }

    TtcAlertFeed parse(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject()) {
                throw TtcAlertClientException.invalidResponse("TTC Live Alerts payload must be an object");
            }
            return new TtcAlertFeed(
                parseOptionalTimestamp(root.get("lastUpdated")),
                parseSection(root, "routes"),
                parseSection(root, "accessibility"),
                combine(
                    parseOptionalSection(root, "siteWide"),
                    parseOptionalSection(root, "siteWideCustom")
                ),
                parseOptionalSection(root, "generalCustom")
            );
        } catch (TtcAlertClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw TtcAlertClientException.invalidResponse("Unable to parse TTC Live Alerts payload", exception);
        }
    }

    private List<TtcFetchedRecord> parseSection(JsonNode root, String section) throws Exception {
        JsonNode records = root.get(section);
        if (records == null || !records.isArray()) {
            throw TtcAlertClientException.invalidResponse("TTC Live Alerts payload requires array: " + section);
        }
        List<TtcFetchedRecord> parsed = new ArrayList<>();
        for (JsonNode node : records) {
            parsed.add(new TtcFetchedRecord(
                objectMapper.treeToValue(node, TtcAlertRecord.class),
                objectMapper.writeValueAsString(node)
            ));
        }
        return List.copyOf(parsed);
    }

    private List<TtcFetchedRecord> parseOptionalSection(JsonNode root, String section) throws Exception {
        JsonNode records = root.get(section);
        if (records == null || records.isNull()) {
            return List.of();
        }
        if (records.isObject()) {
            return List.of(parseRecord(records));
        }
        if (!records.isArray()) {
            throw TtcAlertClientException.invalidResponse(
                "TTC Live Alerts optional section must be an object, array, or null: " + section
            );
        }
        List<TtcFetchedRecord> parsed = new ArrayList<>();
        for (JsonNode node : records) {
            parsed.add(parseRecord(node));
        }
        return List.copyOf(parsed);
    }

    private TtcFetchedRecord parseRecord(JsonNode node) throws Exception {
        return new TtcFetchedRecord(
            objectMapper.treeToValue(node, TtcAlertRecord.class),
            objectMapper.writeValueAsString(node)
        );
    }

    private List<TtcFetchedRecord> combine(
        List<TtcFetchedRecord> first,
        List<TtcFetchedRecord> second
    ) {
        List<TtcFetchedRecord> combined = new ArrayList<>(first);
        combined.addAll(second);
        return List.copyOf(combined);
    }

    private OffsetDateTime parseOptionalTimestamp(JsonNode node) {
        return node == null || node.isNull() ? null : TtcAlertTimes.parse(node.asText());
    }

    private List<TtcFetchedRecord> fetchGtfsRtServiceAlertRecords() {
        if (!properties.isSurfaceGtfsRtEnabled()) {
            return List.of();
        }

        List<TtcFetchedRecord> records = new ArrayList<>();
        for (URI url : properties.getSurfaceGtfsRtUrls()) {
            records.addAll(fetchGtfsRtServiceAlertRecords(url));
        }
        return List.copyOf(records);
    }

    private List<TtcFetchedRecord> fetchGtfsRtServiceAlertRecords(URI url) {
        try {
            String body = restClient.get()
                .uri(url)
                .retrieve()
                .body(String.class);
            return gtfsRtServiceAlertTextParser.parse(body).stream()
                .filter(this::isSurfaceServiceAlertRecord)
                .toList();
        } catch (Exception exception) {
            log.warn("Unable to fetch TTC GTFS-RT service-alert supplement from {}", url, exception);
            return List.of();
        }
    }

    private boolean isSurfaceServiceAlertRecord(TtcFetchedRecord fetched) {
        if (fetched == null || fetched.record() == null || fetched.record().routeType() == null) {
            return false;
        }
        String routeType = fetched.record().routeType().toLowerCase(Locale.ROOT);
        return routeType.contains("bus")
            || routeType.contains("streetcar")
            || routeType.equals("surface");
    }

    private boolean containsSocketTimeout(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof SocketTimeoutException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
