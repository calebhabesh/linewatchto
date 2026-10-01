package com.calebhabesh.linewatch.arrival;

import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class PublicArrivalClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final ArrivalProperties properties;

    public PublicArrivalClient(
        RestClient arrivalRestClient,
        ObjectMapper objectMapper,
        ArrivalProperties properties
    ) {
        this.restClient = arrivalRestClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public List<ArrivalPrediction> fetchArrivals(String stopId) {
        try {
            URI targetUri = UriComponentsBuilder.fromUri(properties.getUrl())
                .queryParam("stopId", stopId)
                .build()
                .toUri();

            String body = restClient.get()
                .uri(targetUri)
                .retrieve()
                .body(String.class);

            return parse(body);
        } catch (Exception exception) {
            throw new RuntimeException("Failed to fetch arrivals for stop: " + stopId, exception);
        }
    }

    public List<ArrivalPrediction> parse(String body) {
        try {
            JsonArrival[] array = objectMapper.readValue(body, JsonArrival[].class);
            List<ArrivalPrediction> predictions = new ArrayList<>();
            if (array != null) {
                for (JsonArrival json : array) {
                    predictions.add(new ArrivalPrediction(
                        json.lineId(),
                        json.direction(),
                        json.minutes(),
                        json.predictedAt(),
                        "TTC Live Predictions",
                        "live",
                        json.minutes() != null ? json.minutes() + " min" : ""
                    ));
                }
            }
            return predictions;
        } catch (Exception exception) {
            throw new RuntimeException("Failed to parse arrivals response", exception);
        }
    }

    public record JsonArrival(
        @JsonProperty("lineId") String lineId,
        @JsonProperty("direction") String direction,
        @JsonProperty("minutes") Integer minutes,
        @JsonProperty("predictedAt") OffsetDateTime predictedAt
    ) {}
}
