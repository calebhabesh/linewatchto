package com.calebhabesh.linewatch.regional;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Gemini API structured-output client. The key travels only in a request header. */
@Component
class GeminiAlertExtractionClient implements RegionalAlertExtractionClient {
    private static final Pattern MODEL_NAME = Pattern.compile("[a-z0-9][a-z0-9.\\-]{0,79}");
    private static final Pattern RETRY_DELAY = Pattern.compile("^(\\d+)(?:\\.\\d+)?s$");
    private static final int MAX_RESPONSE_BYTES = 256 * 1024;

    static final String INSTRUCTIONS = """
        You read one GO Transit or UP Express rider notice and report its rail service impact using only \
        the station identifiers provided. Report what the notice states; do not guess. When the notice does \
        not say, use "unknown", null, or an empty list, and lower your confidence.

        effect:
        - no-service: trains do not run on part or all of a line, including when buses replace trains. \
        This includes notices that say trains run only between some stations while buses or nothing serve \
        the rest of the line, and notices that close a station to all service.
        - delay: trains run late, slower than usual, at reduced speed, or with reduced service.
        - service-adjustment: timetable or trip changes while trains keep running.
        - trip-cancellation: specific scheduled trips are cancelled.
        - service-resumed: the notice says an earlier problem is over and service is normal.
        - service-recovering: an earlier problem is over but residual delays are possible.
        - unknown: none of the above is stated.
        scope:
        - corridor: the whole line is affected.
        - segment-span: one or more sections of line, each between two stations, are affected.
        - listed-stations: only specific stations are closed or affected; the track between them is not.
        - unknown: the notice does not say where.
        spans: for segment-span only, every affected section as {from, to}: the two stations that bound \
        it, in the order the notice names them. List each separate section once. When a no-service \
        notice says only where trains still run, the affected sections are the rest of that line, from \
        each end of the running section to the last station listed for that end of the line, even when \
        the notice names an earlier station as a bus terminus. Stations a replacement bus skips are \
        never section ends.
        listedStations: for listed-stations only, the stations the notice names as affected.
        replacement: go-bus when GO buses replace trains, bus for other buses, none when no replacement is \
        mentioned, unknown otherwise.
        skippedStations: stations the replacement service does not serve.
        statedWindow: the dates or times the notice states, copied as written, or null.
        confidence: high only when the effect, scope and stations are all stated explicitly; medium when \
        one of them needs interpretation; low otherwise.
        """;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final RegionalAlertExtractionProperties properties;

    GeminiAlertExtractionClient(
        @Qualifier("regionalAlertExtractionRestClient") RestClient restClient,
        ObjectMapper objectMapper,
        RegionalAlertExtractionProperties properties
    ) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    @Override
    public JsonNode extract(RegionalAlertExtractionInput input) {
        String model = properties.getModel();
        if (!MODEL_NAME.matcher(model).matches()) throw new ExtractionException("invalid-model", false, null);
        if (properties.getApiKey().isEmpty()) throw new ExtractionException("unauthorized", false, null);
        URI uri = properties.getBaseUrl().resolve("models/" + model + ":generateContent");
        String body = objectMapper.writeValueAsString(request(input));
        Reply reply;
        try {
            reply = restClient.post()
                .uri(uri)
                .header("x-goog-api-key", properties.getApiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> new Reply(response.getStatusCode().value(), read(response.getBody())));
        } catch (ResourceAccessException exception) {
            throw new ExtractionException("unavailable", true, null);
        } catch (RestClientException exception) {
            throw new ExtractionException("transport", true, null);
        }
        if (reply == null) throw new ExtractionException("unavailable", true, null);
        if (reply.status() == 429) throw new ExtractionException("rate-limited", true, retryDelay(reply.body()));
        if (reply.status() == 401 || reply.status() == 403) throw new ExtractionException("unauthorized", false, null);
        if (reply.status() == 404) throw new ExtractionException("model-not-found", false, null);
        if (reply.status() >= 500) throw new ExtractionException("http-" + reply.status(), true, null);
        if (reply.status() != 200) throw new ExtractionException("http-" + reply.status(), false, null);
        return replyJson(reply.body());
    }

    ObjectNode request(RegionalAlertExtractionInput input) {
        ObjectNode root = objectMapper.createObjectNode();
        root.putObject("systemInstruction").putArray("parts").addObject().put("text", INSTRUCTIONS);
        ObjectNode content = root.putArray("contents").addObject();
        content.put("role", "user");
        content.putArray("parts").addObject().put("text", noticeText(input));
        ObjectNode generation = root.putObject("generationConfig");
        generation.put("responseMimeType", "application/json");
        generation.set("responseSchema", schema(input.candidateStationIds()));
        generation.put("maxOutputTokens", 4096);
        return root;
    }

    static String noticeText(RegionalAlertExtractionInput input) {
        StringBuilder text = new StringBuilder("Lines and their stations in route order (identifier = name):\n");
        for (String lineId : input.lineIds()) {
            RegionalNetworkCatalog.route(lineId).ifPresent(route -> {
                text.append("- ").append(route.displayName()).append(": ");
                text.append(String.join(", ", route.stationIds().stream()
                    .map(stationId -> stationId + " = " + RegionalNetworkCatalog.station(stationId)
                        .map(station -> station.name()).orElse(stationId))
                    .toList()));
                text.append('\n');
            });
        }
        if (!input.structuredStationIds().isEmpty()) {
            text.append("Stations Metrolinx tagged on this notice: ")
                .append(String.join(", ", input.structuredStationIds())).append('\n');
        }
        text.append("\nTitle: ").append(input.title()).append("\nNotice: ").append(input.description());
        return text.toString();
    }

    private ObjectNode schema(List<String> stations) {
        ObjectNode schema = objectMapper.createObjectNode();
        schema.put("type", "OBJECT");
        ObjectNode fields = schema.putObject("properties");
        enumField(fields, "effect", RegionalAlertExtraction.EFFECTS, false);
        enumField(fields, "scope", RegionalAlertExtraction.SCOPES, false);
        sectionList(fields, "spans", stations);
        stationList(fields, "listedStations", stations);
        enumField(fields, "replacement", RegionalAlertExtraction.REPLACEMENTS, false);
        stationList(fields, "skippedStations", stations);
        fields.putObject("statedWindow").put("type", "STRING").put("nullable", true);
        enumField(fields, "confidence", RegionalAlertExtraction.CONFIDENCES, false);
        ArrayNode required = schema.putArray("required");
        List.of("effect", "scope", "spans", "listedStations", "replacement", "skippedStations",
            "statedWindow", "confidence").forEach(required::add);
        ArrayNode ordering = schema.putArray("propertyOrdering");
        required.forEach(ordering::add);
        return schema;
    }

    private static void enumField(ObjectNode fields, String name, java.util.Collection<String> values, boolean nullable) {
        ObjectNode field = fields.putObject(name);
        field.put("type", "STRING");
        if (nullable) field.put("nullable", true);
        ArrayNode allowed = field.putArray("enum");
        values.stream().sorted().forEach(allowed::add);
    }

    private static void sectionList(ObjectNode fields, String name, List<String> stations) {
        ObjectNode field = fields.putObject(name);
        field.put("type", "ARRAY");
        ObjectNode section = field.putObject("items");
        section.put("type", "OBJECT");
        ObjectNode ends = section.putObject("properties");
        for (String end : List.of("from", "to")) {
            ObjectNode station = ends.putObject(end);
            station.put("type", "STRING");
            ArrayNode allowed = station.putArray("enum");
            stations.stream().sorted().forEach(allowed::add);
        }
        section.putArray("required").add("from").add("to");
        section.putArray("propertyOrdering").add("from").add("to");
    }

    private static void stationList(ObjectNode fields, String name, List<String> stations) {
        ObjectNode field = fields.putObject(name);
        field.put("type", "ARRAY");
        ObjectNode items = field.putObject("items");
        items.put("type", "STRING");
        ArrayNode allowed = items.putArray("enum");
        stations.forEach(allowed::add);
    }

    private JsonNode replyJson(String body) {
        JsonNode root;
        try {
            root = objectMapper.readTree(body);
        } catch (JacksonException exception) {
            throw new ExtractionException("invalid-response", true, null);
        }
        if (root.path("promptFeedback").hasNonNull("blockReason")) throw new ExtractionException("blocked", false, null);
        JsonNode candidate = root.path("candidates").path(0);
        String finish = candidate.path("finishReason").asText("");
        if (!finish.isEmpty() && !"STOP".equals(finish)) {
            throw new ExtractionException("MAX_TOKENS".equals(finish) ? "truncated" : "blocked",
                "MAX_TOKENS".equals(finish), null);
        }
        StringBuilder text = new StringBuilder();
        for (JsonNode part : candidate.path("content").path("parts")) {
            if (part.path("thought").asBoolean(false)) continue;
            text.append(part.path("text").asText(""));
        }
        if (text.isEmpty()) throw new ExtractionException("empty-response", true, null);
        try {
            return objectMapper.readTree(text.toString());
        } catch (JacksonException exception) {
            throw new ExtractionException("invalid-json", true, null);
        }
    }

    /** Gemini states quota waits as google.rpc.RetryInfo, e.g. {"retryDelay":"37s"}. */
    private Duration retryDelay(String body) {
        try {
            for (JsonNode detail : objectMapper.readTree(body).path("error").path("details")) {
                Matcher matcher = RETRY_DELAY.matcher(detail.path("retryDelay").asText(""));
                if (matcher.matches()) return Duration.ofSeconds(Long.parseLong(matcher.group(1)));
            }
        } catch (JacksonException | NumberFormatException exception) {
            return null;
        }
        return null;
    }

    private static String read(InputStream body) throws IOException {
        if (body == null) return "";
        byte[] bytes = body.readNBytes(MAX_RESPONSE_BYTES + 1);
        if (bytes.length > MAX_RESPONSE_BYTES) throw new IOException("Extraction response too large");
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private record Reply(int status, String body) {}
}
