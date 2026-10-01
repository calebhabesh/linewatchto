package com.calebhabesh.linewatch.ingestion;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private static final int SEARCH_PAGE_SIZE = 100;

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
            Map<String, String> detailPaths = fetchAllDetailPaths();
            List<TtcFetchedRecord> records = new ArrayList<>();
            for (Map.Entry<String, String> entry : detailPaths.entrySet()) {
                URI detailUri = safeDetailUri(entry.getValue());
                String detailHtml = restClient.get().uri(detailUri).retrieve().body(String.class);
                records.add(parser.parse(entry.getKey(), detailUri, detailHtml));
            }
            return new TtcSubwayClosureSnapshot(true, records);
        } catch (Exception exception) {
            log.warn("Unable to fetch TTC.ca subway service-advisory supplement", exception);
            return TtcSubwayClosureSnapshot.unavailable();
        }
    }

    private Map<String, String> fetchAllDetailPaths() throws Exception {
        int limit = Math.max(1, Math.min(properties.getSubwayClosureMaxEntries(), 250));
        int pageSize = Math.min(SEARCH_PAGE_SIZE, limit);
        int offset = 0;
        int totalCount;
        Map<String, String> detailPaths = new LinkedHashMap<>();
        do {
            String listing = restClient.get()
                .uri(searchUri(pageSize, offset))
                .retrieve()
                .body(String.class);
            JsonNode response = objectMapper.readTree(listing);
            JsonNode results = response.path("Results");
            if (!results.isArray()) {
                throw new IllegalStateException("TTC advisory search response is missing Results");
            }
            totalCount = response.path("Count").canConvertToInt()
                ? response.path("Count").asInt()
                : results.size();
            if (totalCount > limit) {
                throw new IllegalStateException(
                    "TTC advisory search returned " + totalCount
                        + " entries, exceeding the configured complete-snapshot limit of " + limit
                );
            }
            for (JsonNode result : results) {
                String id = result.path("Id").asText("").trim();
                String path = result.path("Url").asText("").trim();
                if (!id.isEmpty() && !path.isEmpty()) {
                    detailPaths.putIfAbsent(id, path);
                }
            }
            offset += pageSize;
        } while (offset < totalCount);
        return detailPaths;
    }

    private URI searchUri(int pageSize, int offset) {
        return UriComponentsBuilder.fromUri(properties.getSubwayClosureSearchUrl())
            .queryParam("v", VARIANT)
            .queryParam("s", SCOPE)
            .queryParam("p", pageSize)
            .queryParam("e", offset)
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
