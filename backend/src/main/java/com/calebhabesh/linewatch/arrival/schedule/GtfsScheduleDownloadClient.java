package com.calebhabesh.linewatch.arrival.schedule;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class GtfsScheduleDownloadClient {
    private final ArrivalProperties properties;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public GtfsScheduleDownloadClient(
        ArrivalProperties properties,
        @Qualifier("arrivalRestClient") RestClient restClient,
        ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.restClient = restClient;
        this.objectMapper = objectMapper;
    }

    /** Reads only CKAN package metadata, so it is cheap enough to poll frequently. */
    public GtfsRelease currentRelease() throws IOException {
        String packageBody = restClient.get()
            .uri(properties.getGtfsRefreshPackageUrl())
            .retrieve()
            .body(String.class);
        return findRelease(packageBody == null ? "" : packageBody);
    }

    public DownloadedGtfs download(GtfsRelease release) throws IOException {
        URI zipUri = release.zipUri();
        byte[] zipBytes = restClient.get()
            .uri(zipUri)
            .retrieve()
            .body(byte[].class);
        if (zipBytes == null || zipBytes.length == 0) {
            throw new IOException("Downloaded TTC GTFS zip was empty");
        }
        Path tempFile = Files.createTempFile("linewatch-ttc-gtfs-", ".zip");
        Files.write(tempFile, zipBytes);
        return new DownloadedGtfs(tempFile, zipUri.toString());
    }

    private GtfsRelease findRelease(String packageBody) throws IOException {
        JsonNode resources = objectMapper.readTree(packageBody).path("result").path("resources");
        if (!resources.isArray()) {
            throw new IOException("TTC GTFS CKAN response did not contain resources");
        }
        for (JsonNode resource : resources) {
            String url = resource.path("url").asText("");
            String format = resource.path("format").asText("").toLowerCase(java.util.Locale.ROOT);
            if (!url.isBlank() && (url.toLowerCase(java.util.Locale.ROOT).endsWith(".zip") || format.contains("zip"))) {
                // CKAN bumps last_modified when the file is replaced; without it, always import.
                String lastModified = resource.path("last_modified").asText("");
                return new GtfsRelease(URI.create(url), lastModified.isBlank() ? null : url + "@" + lastModified);
            }
        }
        throw new IOException("TTC GTFS CKAN response did not include a zip resource");
    }

    public record GtfsRelease(URI zipUri, String version) {}

    public record DownloadedGtfs(Path zipPath, String sourceUrl) {}
}
