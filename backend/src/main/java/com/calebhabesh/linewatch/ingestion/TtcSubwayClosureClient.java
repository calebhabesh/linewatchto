package com.calebhabesh.linewatch.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class TtcSubwayClosureClient {
    private static final Logger log = LoggerFactory.getLogger(TtcSubwayClosureClient.class);
    private static final String VARIANT = "{23DC07D4-6BAC-4B98-A9CC-07606C5B1322}";
    private static final String SCOPE = "{99D7699F-DB47-4BB1-8946-77561CE7B320}";
    private static final String ITEM_ID = "{72CC555F-9128-4581-AD12-3D04AB1C87BA}";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final AlertIngestionProperties properties;
    private final TtcSubwayClosureParser parser;

    public TtcSubwayClosureClient(
        RestClient ttcAlertRestClient,
        ObjectMapper objectMapper,
        AlertIngestionProperties properties,
        TtcSubwayClosureParser parser
    ) {
        this.restClient = ttcAlertRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.parser = parser;
    }

    public TtcSubwayClosureSnapshot fetch() {
        if (!properties.isSubwayClosureSupplementEnabled()) {
            return new TtcSubwayClosureSnapshot(true, List.of());
        }
        try {
            String listing = restClient.get().uri(searchUri()).retrieve().body(String.class);
            JsonNode results = objectMapper.readTree(listing).path("Results");
            if (!results.isArray()) {
                throw new IllegalStateException("TTC closure search response is missing Results");
            }

            List<TtcFetchedRecord> records = new ArrayList<>();
            int limit = Math.max(1, Math.min(properties.getSubwayClosureMaxEntries(), 250));
            for (JsonNode result : results) {
                if (records.size() >= limit) {
                    break;
                }
                String id = result.path("Id").asText("").trim();
                String path = result.path("Url").asText("").trim();
                if (id.isEmpty() || path.isEmpty()) {
                    continue;
                }
                URI detailUri = safeDetailUri(path);
                String detail = restClient.get().uri(detailUri).retrieve().body(String.class);
                records.add(parser.parse(id, detailUri, detail));
            }
            return new TtcSubwayClosureSnapshot(true, records);
        } catch (Exception exception) {
            log.warn("Unable to fetch TTC.ca subway service-advisory supplement", exception);
            return TtcSubwayClosureSnapshot.unavailable();
        }
    }

    private URI searchUri() {
        return UriComponentsBuilder.fromUri(properties.getSubwayClosureSearchUrl())
            .queryParam("v", VARIANT)
            .queryParam("s", SCOPE)
            .queryParam("p", Math.max(1, Math.min(properties.getSubwayClosureMaxEntries(), 250)))
            .queryParam("itemid", ITEM_ID)
            .build()
            .encode()
            .toUri();
    }

    private URI safeDetailUri(String path) {
        URI base = properties.getSubwayClosureBaseUrl();
        URI resolved = base.resolve(path);
        if (!base.getScheme().equalsIgnoreCase(resolved.getScheme())
            || !base.getHost().equalsIgnoreCase(resolved.getHost())
            || resolved.getPath() == null
            || !resolved.getPath().startsWith("/service-advisories/subway-service/")) {
            throw new IllegalArgumentException("TTC closure search returned an unsafe detail URL");
        }
        return resolved;
    }
}
