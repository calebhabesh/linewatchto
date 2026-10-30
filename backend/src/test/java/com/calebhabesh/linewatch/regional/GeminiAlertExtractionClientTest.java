package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class GeminiAlertExtractionClientTest {
    private static final String KEY = "test-extraction-key";
    private static final String ENDPOINT =
        "https://models.example.test/v1beta/models/gemini-3.5-flash-lite:generateContent";
    private static final RegionalAlertExtractionInput INPUT = new RegionalAlertExtractionInput(
        "up-1", List.of("regional-up"), "Weekend service adjustments",
        "GO buses will run direct between Union Station Bus Terminal and Pearson Airport Terminal 1.", List.of());
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private MockRestServiceServer server;
    private GeminiAlertExtractionClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        RegionalAlertExtractionProperties properties = new RegionalAlertExtractionProperties();
        properties.setEnabled(true);
        properties.setBaseUrl(URI.create("https://models.example.test/v1beta/"));
        properties.setApiKey(KEY);
        client = new GeminiAlertExtractionClient(builder.build(), objectMapper, properties);
    }

    @Test
    void sendsTheKeyOnlyInAHeaderWithACatalogConstrainedSchemaAndSkipsThoughtParts() {
        String[] requestBody = new String[1];
        server.expect(requestTo(ENDPOINT))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header("x-goog-api-key", KEY))
            .andExpect(request -> requestBody[0] = ((MockClientHttpRequest) request).getBodyAsString())
            .andRespond(withSuccess("""
                {"candidates":[{"finishReason":"STOP","content":{"parts":[
                  {"text":"considering the stations","thought":true},
                  {"text":"{\\"effect\\":\\"no-service\\",\\"scope\\":\\"corridor\\"}"}
                ]}}]}
                """, MediaType.APPLICATION_JSON));

        JsonNode reply = client.extract(INPUT);

        assertThat(reply.path("effect").asText()).isEqualTo("no-service");
        assertThat(requestBody[0]).doesNotContain(KEY);
        JsonNode request = objectMapper.readTree(requestBody[0]);
        JsonNode schema = request.path("generationConfig").path("responseSchema");
        assertThat(request.path("generationConfig").path("responseMimeType").asText()).isEqualTo("application/json");
        JsonNode section = schema.path("properties").path("spans").path("items");
        assertThat(schema.path("properties").path("spans").path("type").asText()).isEqualTo("ARRAY");
        assertThat(section.path("required")).extracting(JsonNode::asText).containsExactly("from", "to");
        for (String end : List.of("from", "to")) {
            assertThat(section.path("properties").path(end).path("enum")).extracting(JsonNode::asText)
                .containsExactly("bloor", "mount-dennis", "pearson-airport", "union", "weston");
        }
        assertThat(schema.path("properties").has("spanFrom")).isFalse();
        assertThat(schema.path("properties").path("skippedStations").path("items").path("enum"))
            .extracting(JsonNode::asText).containsExactly("union", "bloor", "mount-dennis", "weston", "pearson-airport");
        String prompt = request.path("contents").path(0).path("parts").path(0).path("text").asText();
        assertThat(prompt).contains("pearson-airport = Pearson Airport")
            .contains("Notice: GO buses will run direct between Union Station Bus Terminal");
        server.verify();
    }

    @Test
    void reportsQuotaWaitsAndRefusalsWithShortSafeCodes() {
        server.expect(requestTo(ENDPOINT)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS)
            .contentType(MediaType.APPLICATION_JSON).body("""
                {"error":{"code":429,"message":"Quota exceeded for key test-extraction-key","details":[
                  {"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"37s"}]}}
                """));
        assertThatThrownBy(() -> client.extract(INPUT))
            .isInstanceOfSatisfying(RegionalAlertExtractionClient.ExtractionException.class, failure -> {
                assertThat(failure.code()).isEqualTo("rate-limited");
                assertThat(failure.retryable()).isTrue();
                assertThat(failure.stopsRun()).isTrue();
                assertThat(failure.retryAfter()).isEqualTo(Duration.ofSeconds(37));
                assertThat(failure.getMessage()).doesNotContain(KEY);
            });

        server.reset();
        server.expect(requestTo(ENDPOINT)).andRespond(withStatus(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> client.extract(INPUT))
            .isInstanceOfSatisfying(RegionalAlertExtractionClient.ExtractionException.class, failure -> {
                assertThat(failure.code()).isEqualTo("unauthorized");
                assertThat(failure.retryable()).isFalse();
            });

        server.reset();
        server.expect(requestTo(ENDPOINT)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        assertThatThrownBy(() -> client.extract(INPUT))
            .isInstanceOfSatisfying(RegionalAlertExtractionClient.ExtractionException.class, failure -> {
                assertThat(failure.code()).isEqualTo("http-503");
                assertThat(failure.retryable()).isTrue();
            });

        server.reset();
        server.expect(requestTo(ENDPOINT)).andRespond(withSuccess("""
            {"candidates":[{"finishReason":"SAFETY","content":{"parts":[]}}]}
            """, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.extract(INPUT))
            .isInstanceOfSatisfying(RegionalAlertExtractionClient.ExtractionException.class,
                failure -> assertThat(failure.code()).isEqualTo("blocked"));

        server.reset();
        server.expect(requestTo(ENDPOINT)).andRespond(withSuccess("""
            {"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"not json"}]}}]}
            """, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.extract(INPUT))
            .isInstanceOfSatisfying(RegionalAlertExtractionClient.ExtractionException.class,
                failure -> assertThat(failure.code()).isEqualTo("invalid-json"));
    }
}
