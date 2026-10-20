package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.calebhabesh.linewatch.arrival.ArrivalProperties;
import java.net.URI;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

class GtfsScheduleDownloadClientTest {
    private static final String PACKAGE_URL = "https://ckan.example.test/api/3/action/package_show?id=ttc-gtfs";
    private static final String ZIP_URL = "https://ckan.example.test/download/completegtfs.zip";

    private MockRestServiceServer server;
    private GtfsScheduleDownloadClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        ArrivalProperties properties = new ArrivalProperties();
        properties.setGtfsRefreshPackageUrl(URI.create(PACKAGE_URL));
        client = new GtfsScheduleDownloadClient(properties, builder.build(), JsonMapper.builder().build());
    }

    @Test
    void releaseVersionChangesWhenCkanReplacesTheZip() throws Exception {
        server.expect(requestTo(PACKAGE_URL)).andRespond(withSuccess(packageJson("2026-09-30T14:17:52"), MediaType.APPLICATION_JSON));

        GtfsScheduleDownloadClient.GtfsRelease release = client.currentRelease();

        assertThat(release.zipUri()).isEqualTo(URI.create(ZIP_URL));
        assertThat(release.version()).isEqualTo(ZIP_URL + "@2026-09-30T14:17:52");
        server.verify();
    }

    @Test
    void releaseHasNoVersionWhenCkanOmitsLastModified() throws Exception {
        server.expect(requestTo(PACKAGE_URL)).andRespond(withSuccess(packageJson(""), MediaType.APPLICATION_JSON));

        assertThat(client.currentRelease().version()).isNull();
    }

    private static String packageJson(String lastModified) {
        return """
            {"result": {"resources": [
              {"name": "Readme", "format": "PDF", "url": "https://ckan.example.test/download/readme.pdf"},
              {"name": "Complete GTFS ZIP", "format": "ZIP", "url": "%s", "last_modified": "%s"}
            ]}}
            """.formatted(ZIP_URL, lastModified);
    }
}
