package com.calebhabesh.linewatch.arrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class PublicArrivalClientTest {
    private MockRestServiceServer server;
    private PublicArrivalClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        ArrivalProperties properties = new ArrivalProperties();
        properties.setUrl(URI.create("https://bustime.ttc.ca/gtfsrt"));
        client = new PublicArrivalClient(
            builder.build(),
            new ObjectMapper().findAndRegisterModules(),
            properties
        );
    }

    @Test
    void fetchArrivalsParsesPredictionsForStop() {
        String body = """
            [
              {
                "lineId": "line-1",
                "direction": "Northbound",
                "minutes": 3,
                "predictedAt": "2026-06-03T12:00:00Z"
              },
              {
                "lineId": "line-1",
                "direction": "Northbound",
                "minutes": 8,
                "predictedAt": "2026-06-03T12:00:00Z"
              }
            ]
            """;
        server.expect(requestTo("https://bustime.ttc.ca/gtfsrt?stopId=SPA_PLAT_L1_N"))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        List<ArrivalPrediction> predictions = client.fetchArrivals("SPA_PLAT_L1_N");

        assertThat(predictions).hasSize(2);
        assertThat(predictions.get(0).lineId()).isEqualTo("line-1");
        assertThat(predictions.get(0).direction()).isEqualTo("Northbound");
        assertThat(predictions.get(0).minutes()).isEqualTo(3);
        assertThat(predictions.get(0).predictedAt()).isEqualTo(OffsetDateTime.parse("2026-06-03T12:00:00Z"));
        assertThat(predictions.get(0).status()).isEqualTo("live");
        server.verify();
    }

    @Test
    void fetchArrivalsWrapsMalformedJson() {
        server.expect(requestTo("https://bustime.ttc.ca/gtfsrt?stopId=SPA_PLAT_L1_N"))
            .andRespond(withSuccess("{\"invalid\": \"payload\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.fetchArrivals("SPA_PLAT_L1_N"))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("Failed to fetch")
            .hasRootCauseInstanceOf(com.fasterxml.jackson.databind.exc.MismatchedInputException.class);
    }

    @Test
    void fetchArrivalsWrapsUpstreamHttpFailure() {
        server.expect(requestTo("https://bustime.ttc.ca/gtfsrt?stopId=SPA_PLAT_L1_N"))
            .andRespond(withServerError());

        assertThatThrownBy(() -> client.fetchArrivals("SPA_PLAT_L1_N"))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("Failed to fetch");
    }
}
