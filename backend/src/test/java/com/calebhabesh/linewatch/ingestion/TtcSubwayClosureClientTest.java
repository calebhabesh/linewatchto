package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class TtcSubwayClosureClientTest {
    private MockRestServiceServer server;
    private AlertIngestionProperties properties;
    private TtcSubwayClosureClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        properties = new AlertIngestionProperties();
        client = new TtcSubwayClosureClient(
            builder.build(),
            new ObjectMapper(),
            properties,
            new TtcSubwayClosureParser()
        );
    }

    @Test
    void fetchesOfficialSitecoreListingAndDetailPage() {
        server.expect(request -> {
            URI uri = request.getURI();
            assertThat(uri.getPath()).isEqualTo("/sxa/search/results/");
            assertThat(uri.getRawQuery())
                .contains("v=%7B23DC07D4-6BAC-4B98-A9CC-07606C5B1322%7D")
                .contains("s=%7B99D7699F-DB47-4BB1-8946-77561CE7B320%7D")
                .contains("itemid=%7B72CC555F-9128-4581-AD12-3D04AB1C87BA%7D");
        }).andRespond(withSuccess("""
            {"Results":[{"Id":"closure-id","Url":"/service-advisories/subway-service/example"}]}
            """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://www.ttc.ca/service-advisories/subway-service/example"))
            .andRespond(withSuccess(detailPage(), MediaType.TEXT_HTML));

        TtcSubwayClosureSnapshot snapshot = client.fetch();

        assertThat(snapshot.available()).isTrue();
        assertThat(snapshot.records()).singleElement().satisfies(record ->
            assertThat(record.record().id()).isEqualTo("ttc-ca-closure-closure-id")
        );
        server.verify();
    }

    @Test
    void marksSupplementUnavailableWithoutReturningAnAuthoritativeEmptySet() {
        server.expect(request -> assertThat(request.getURI().getPath())
            .isEqualTo("/sxa/search/results/"))
            .andRespond(withServerError());

        TtcSubwayClosureSnapshot snapshot = client.fetch();

        assertThat(snapshot.available()).isFalse();
        assertThat(snapshot.records()).isEmpty();
        server.verify();
    }

    private String detailPage() {
        return """
            <html><body>
              <h1>
                <span class="field-routename">Line 2 (Bloor-Danforth)</span>
                <span class="field-satitle">St George to Broadview stations – Nightly early closures starting at 11:59 p.m.</span>
              </h1>
              <div class="sa-effective-date">
                <span class="field-starteffectivedate">August 31, 2026</span>
                <span class="field-endeffectivedate">September 3, 2026</span>
              </div>
              <div class="component content"><div class="u-type--body">
                Subway service will end early at 11:59 p.m. for planned track work.
                Regular subway service will resume each morning at 6 a.m.
              </div></div>
            </body></html>
            """;
    }
}
