package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcAlertClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AlertIngestionProperties properties;

    public TtcAlertClient(
        RestClient ttcAlertRestClient,
        ObjectMapper objectMapper,
        AlertIngestionProperties properties
    ) {
        this.restClient = ttcAlertRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public TtcAlertFeed fetch() {
        try {
            String body = restClient.get()
                .uri(properties.getUrl())
                .retrieve()
                .body(String.class);
            return parse(body);
        } catch (TtcAlertClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new TtcAlertClientException("Unable to fetch TTC Live Alerts", exception);
        }
    }

    TtcAlertFeed parse(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isObject()) {
                throw new TtcAlertClientException("TTC Live Alerts payload must be an object");
            }
            return new TtcAlertFeed(
                parseOptionalTimestamp(root.get("lastUpdated")),
                parseSection(root, "routes"),
                parseSection(root, "accessibility")
            );
        } catch (TtcAlertClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new TtcAlertClientException("Unable to parse TTC Live Alerts payload", exception);
        }
    }

    private List<TtcFetchedRecord> parseSection(JsonNode root, String section) throws Exception {
        JsonNode records = root.get(section);
        if (records == null || !records.isArray()) {
            throw new TtcAlertClientException("TTC Live Alerts payload requires array: " + section);
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

    private OffsetDateTime parseOptionalTimestamp(JsonNode node) {
        return node == null || node.isNull() ? null : TtcAlertTimes.parse(node.asText());
    }
}
