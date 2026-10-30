package com.calebhabesh.linewatch.regional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Optional model reading of Metrolinx notices. Each poll records new notice text, reads a few new
 * notices within a short time budget before storing alerts, and then classifies from stored
 * readings (primary mode) or only records differences (shadow mode). A background job reads what
 * a poll left over. When the model is unavailable, out of quota, or unsure, the deterministic
 * classification stands, and pending text is read once the model is back, provided the notice is
 * still in the feed and its window has not ended.
 */
@Service
public class RegionalAlertExtractionService {
    /** Gemini daily quotas reset at midnight Pacific time. */
    static final ZoneId QUOTA_ZONE = ZoneId.of("America/Los_Angeles");
    /** Structured trip cancellations are already exact; reading them would spend quota for nothing. */
    private static final Set<String> SKIPPED_EFFECTS = Set.of("trip-cancellation");
    private static final Logger log = LoggerFactory.getLogger(RegionalAlertExtractionService.class);

    private final RegionalAlertExtractionProperties properties;
    private final RegionalAlertExtractionStore store;
    private final RegionalAlertExtractionClient client;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private volatile LocalDate budgetExhaustedOn;

    public RegionalAlertExtractionService(
        RegionalAlertExtractionProperties properties,
        RegionalAlertExtractionStore store,
        RegionalAlertExtractionClient client,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.properties = properties;
        this.store = store;
        this.client = client;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /** Records each classified notice for extraction and refreshes stored comparisons. Never throws. */
    public void observe(List<RegionalAlertClassification> classifications) {
        if (!properties.isActive()) return;
        try {
            OffsetDateTime now = OffsetDateTime.now(clock);
            for (RegionalAlertClassification classification : classifications) {
                if (!eligible(classification)) continue;
                RegionalAlertExtractionInput input = RegionalAlertExtractionInput.of(classification);
                RegionalAlertExtractionPolicy.Reading deterministic = RegionalAlertExtractionPolicy.Reading.of(classification);
                RegionalAlertExtractionStore.Observed observed = store.observe(input.contentHash(), properties.getModel(),
                    RegionalAlertExtractionClient.PROMPT_VERSION, classification.canonicalEventId(), inputJson(input),
                    readingJson(deterministic), classification.activePeriodEnd(), now);
                if (!"succeeded".equals(observed.status()) || observed.resultJson() == null) continue;
                RegionalAlertExtraction extraction = parseResult(observed.resultJson(), input);
                if (extraction == null) continue;
                List<String> differences = RegionalAlertExtractionPolicy.differences(deterministic, extraction);
                if (!differences.equals(stringList(observed.differencesJson()))) {
                    store.updateDifferences(observed.id(), objectMapper.writeValueAsString(differences));
                }
            }
        } catch (RuntimeException exception) {
            log.warn("Metrolinx notice extraction bookkeeping failed: {}", exception.getClass().getSimpleName());
        }
    }

    /** In primary mode, classifies notices from stored readings; otherwise returns them unchanged. */
    public List<RegionalAlertClassification> refine(List<RegionalAlertClassification> classifications) {
        if (!properties.primary() || classifications.isEmpty()) return classifications;
        try {
            Map<String, RegionalAlertExtractionInput> inputs = new LinkedHashMap<>();
            for (RegionalAlertClassification classification : classifications) {
                if (!eligible(classification)) continue;
                RegionalAlertExtractionInput input = RegionalAlertExtractionInput.of(classification);
                inputs.put(input.contentHash(), input);
            }
            Map<String, String> results = store.findSucceeded(inputs.keySet(), properties.getModel(),
                RegionalAlertExtractionClient.PROMPT_VERSION);
            if (results.isEmpty()) return classifications;
            String provenance = properties.getModel() + "@" + RegionalAlertExtractionClient.PROMPT_VERSION;
            List<RegionalAlertClassification> refined = new ArrayList<>(classifications.size());
            for (RegionalAlertClassification classification : classifications) {
                RegionalAlertExtractionInput input = eligible(classification)
                    ? RegionalAlertExtractionInput.of(classification) : null;
                String result = input == null ? null : results.get(input.contentHash());
                RegionalAlertExtraction extraction = result == null ? null : parseResult(result, input);
                RegionalAlertClassification next = RegionalAlertExtractionPolicy.refine(classification, extraction, provenance);
                if (next != classification) {
                    log.debug("Metrolinx event {} refined by model reading: scope {} -> {}, span {} -> {}",
                        classification.canonicalEventId(), classification.scope(), next.scope(),
                        classification.spanStationIds(), next.spanStationIds());
                }
                refined.add(next);
            }
            return List.copyOf(refined);
        } catch (RuntimeException exception) {
            log.warn("Metrolinx model readings were not applied this poll: {}", exception.getClass().getSimpleName());
            return classifications;
        }
    }

    /**
     * Reads this poll's new notice text before its alerts are stored, so the first published
     * version (and any push it causes) already uses the reading. Bounded by the poll request limit
     * and time budget; anything left over is read by the background job. Never throws.
     */
    public int readNew(List<RegionalAlertClassification> classifications) {
        if (!properties.isActive() || properties.getPollRequestLimit() == 0 || classifications.isEmpty()) return 0;
        try {
            List<String> hashes = classifications.stream().filter(RegionalAlertExtractionService::eligible)
                .map(classification -> RegionalAlertExtractionInput.of(classification).contentHash()).distinct().toList();
            OffsetDateTime now = OffsetDateTime.now(clock);
            int remaining = remainingBudget(now);
            if (remaining <= 0) return 0;
            List<RegionalAlertExtractionStore.Due> due = store.findDueByHashes(hashes, properties.getModel(),
                RegionalAlertExtractionClient.PROMPT_VERSION, now, Math.min(properties.getPollRequestLimit(), remaining));
            return process(due, now.plus(properties.getPollTimeBudget()));
        } catch (RuntimeException exception) {
            log.warn("Metrolinx notices were not read during this poll: {}", exception.getClass().getSimpleName());
            return 0;
        }
    }

    /** Reads due pending notices within the per-run and daily limits. Returns the requests sent. */
    public int processDue() {
        if (!properties.isActive()) return 0;
        OffsetDateTime now = OffsetDateTime.now(clock);
        int remaining = remainingBudget(now);
        if (remaining <= 0) return 0;
        List<RegionalAlertExtractionStore.Due> due = store.findDue(properties.getModel(),
            RegionalAlertExtractionClient.PROMPT_VERSION, now, now.minus(properties.getFeedPresenceWindow()),
            Math.min(properties.getMaxRequestsPerRun(), remaining));
        return process(due, null);
    }

    private int remainingBudget(OffsetDateTime now) {
        LocalDate quotaDay = now.atZoneSameInstant(QUOTA_ZONE).toLocalDate();
        int remaining = properties.getDailyRequestBudget() - store.requestsOn(quotaDay, properties.getModel());
        if (remaining <= 0 && !quotaDay.equals(budgetExhaustedOn)) {
            budgetExhaustedOn = quotaDay;
            log.warn("Metrolinx notice extraction reached its daily budget of {} requests; "
                + "notices use the deterministic classification until midnight Pacific", properties.getDailyRequestBudget());
        }
        return remaining;
    }

    private int process(List<RegionalAlertExtractionStore.Due> due, OffsetDateTime deadline) {
        String model = properties.getModel();
        int sent = 0;
        for (RegionalAlertExtractionStore.Due item : due) {
            OffsetDateTime now = OffsetDateTime.now(clock);
            if (deadline != null && !now.isBefore(deadline)) break;
            if (!store.claim(item.id(), now, now.plus(properties.getReadTimeout()).plusMinutes(1))) continue;
            RegionalAlertExtractionInput input = parseInput(item.inputJson());
            if (input == null) {
                store.finish(item.id(), "failed", "stored-input", now);
                continue;
            }
            store.recordRequest(now.atZoneSameInstant(QUOTA_ZONE).toLocalDate(), model);
            sent++;
            try {
                JsonNode reply = client.extract(input);
                RegionalAlertExtraction.Validation validation = RegionalAlertExtraction.validate(reply, input);
                if (!validation.valid()) {
                    store.finish(item.id(), "rejected", "schema:" + validation.rejection(), OffsetDateTime.now(clock));
                    log.warn("Model reading for Metrolinx event {} was rejected ({}); using the deterministic classification",
                        input.canonicalEventId(), validation.rejection());
                    continue;
                }
                List<String> differences = RegionalAlertExtractionPolicy.differences(
                    parseReading(item.deterministicJson()), validation.extraction());
                store.succeed(item.id(), resultJson(validation.extraction()),
                    objectMapper.writeValueAsString(differences), OffsetDateTime.now(clock));
                if (differences.isEmpty()) {
                    log.debug("Model reading for Metrolinx event {} agrees with the deterministic classification",
                        input.canonicalEventId());
                } else {
                    log.info("Model reading for Metrolinx event {} ({} confidence) differs from the deterministic one: {}",
                        input.canonicalEventId(), validation.extraction().confidence(), String.join("; ", differences));
                }
            } catch (RegionalAlertExtractionClient.ExtractionException exception) {
                if (handleFailure(item, exception)) break;
            } catch (RuntimeException exception) {
                handleFailure(item, new RegionalAlertExtractionClient.ExtractionException("internal", true, null));
                log.warn("Metrolinx notice extraction failed for event {}: {}",
                    input.canonicalEventId(), exception.getClass().getSimpleName());
            }
        }
        return sent;
    }

    /** Stores a failed attempt. Returns true when the run should stop. */
    private boolean handleFailure(RegionalAlertExtractionStore.Due item, RegionalAlertExtractionClient.ExtractionException exception) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        if ("rate-limited".equals(exception.code())) {
            Duration wait = exception.retryAfter() != null && exception.retryAfter().compareTo(properties.getRetryBackoff()) > 0
                ? exception.retryAfter() : properties.getRetryBackoff();
            store.retryLater(item.id(), exception.code(), now.plus(wait), false);
            log.info("Metrolinx notice extraction is rate limited; retrying in {}", wait);
            return true;
        }
        int attempts = item.attempts() + 1;
        if (!exception.retryable() || attempts >= properties.getMaxAttempts()) {
            store.finish(item.id(), "failed", exception.code(), now);
            if ("unauthorized".equals(exception.code())) {
                log.error("Metrolinx notice extraction was refused by the model provider; check the API key");
            } else {
                log.warn("Metrolinx notice extraction gave up on a notice after {} attempts ({})", attempts, exception.code());
            }
            return exception.stopsRun();
        }
        store.retryLater(item.id(), exception.code(), now.plus(backoff(attempts)), true);
        return exception.stopsRun();
    }

    Duration backoff(int attempts) {
        Duration delay = properties.getRetryBackoff();
        for (int attempt = 1; attempt < attempts && delay.compareTo(properties.getMaxRetryBackoff()) < 0; attempt++) {
            delay = delay.multipliedBy(2);
        }
        return delay.compareTo(properties.getMaxRetryBackoff()) > 0 ? properties.getMaxRetryBackoff() : delay;
    }

    private static boolean eligible(RegionalAlertClassification classification) {
        return !classification.lineIds().isEmpty() && !SKIPPED_EFFECTS.contains(classification.serviceEffect());
    }

    String inputJson(RegionalAlertExtractionInput input) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("canonicalEventId", input.canonicalEventId());
        strings(node.putArray("lineIds"), input.lineIds());
        node.put("title", input.title());
        node.put("description", input.description());
        strings(node.putArray("structuredStationIds"), input.structuredStationIds());
        return objectMapper.writeValueAsString(node);
    }

    private RegionalAlertExtractionInput parseInput(String json) {
        try {
            JsonNode node = objectMapper.readTree(json);
            return new RegionalAlertExtractionInput(node.path("canonicalEventId").asText(""),
                stringList(node.path("lineIds")), node.path("title").asText(""), node.path("description").asText(""),
                stringList(node.path("structuredStationIds")));
        } catch (JacksonException exception) {
            return null;
        }
    }

    String readingJson(RegionalAlertExtractionPolicy.Reading reading) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("effect", reading.effect());
        node.put("scope", reading.scope());
        strings(node.putArray("span"), reading.span());
        strings(node.putArray("listed"), reading.listed());
        node.put("replacement", reading.replacement());
        strings(node.putArray("skipped"), reading.skipped());
        return objectMapper.writeValueAsString(node);
    }

    private RegionalAlertExtractionPolicy.Reading parseReading(String json) {
        JsonNode node = json == null ? objectMapper.createObjectNode() : objectMapper.readTree(json);
        return new RegionalAlertExtractionPolicy.Reading(node.path("effect").asText(null), node.path("scope").asText(null),
            stringList(node.path("span")), stringList(node.path("listed")), node.path("replacement").asText("none"),
            stringList(node.path("skipped")));
    }

    /** Stored with the reply schema's field names, so stored results re-validate like fresh replies. */
    String resultJson(RegionalAlertExtraction extraction) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("effect", extraction.effect());
        node.put("scope", extraction.scope());
        ArrayNode spans = node.putArray("spans");
        RegionalSpans.pairs(extraction.spans()).forEach(pair ->
            spans.addObject().put("from", pair.getFirst()).put("to", pair.getLast()));
        strings(node.putArray("listedStations"), extraction.listedStations());
        node.put("replacement", extraction.replacement());
        strings(node.putArray("skippedStations"), extraction.skippedStations());
        node.put("statedWindow", extraction.statedWindow());
        node.put("confidence", extraction.confidence());
        return objectMapper.writeValueAsString(node);
    }

    /** Re-validates a stored result, so catalog changes cannot apply a stale station. */
    private RegionalAlertExtraction parseResult(String json, RegionalAlertExtractionInput input) {
        try {
            return RegionalAlertExtraction.validate(objectMapper.readTree(json), input).extraction();
        } catch (JacksonException exception) {
            return null;
        }
    }

    private List<String> stringList(String json) {
        if (json == null) return List.of();
        try {
            return stringList(objectMapper.readTree(json));
        } catch (JacksonException exception) {
            return List.of();
        }
    }

    private static List<String> stringList(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node != null && node.isArray()) node.forEach(value -> values.add(value.asText("")));
        return List.copyOf(values);
    }

    private static void strings(ArrayNode array, List<String> values) {
        values.forEach(array::add);
    }
}
