package com.calebhabesh.linewatch.regional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Compares a model reading with the deterministic classification and, in primary mode, lets a
 * confident reading classify the notice. The reading supplies the effect, scope, stations,
 * replacement and skipped stops; dates, timing, delay minutes and rider text stay deterministic
 * because the model does not produce them. The deterministic classification stands when there is
 * no high-confidence reading, when Metrolinx's structure already decides the event (structured
 * trip cancellations, explicit resolution notices), or when the reading cannot say what happened.
 */
final class RegionalAlertExtractionPolicy {
    /** Deterministic effects that come from Metrolinx structure or an explicit title status. */
    private static final Set<String> STRUCTURAL_EFFECTS = Set.of("trip-cancellation", "service-resumed", "service-recovering");
    /** Reading effects the model may decide on its own. */
    private static final Set<String> READING_EFFECTS = Set.of("no-service", "delay", "service-adjustment");
    static final String EXCLUDED_ROLE = "replacement-excluded";

    private RegionalAlertExtractionPolicy() {}

    /** The deterministic answer to the questions a reading answers, for storage and comparison. */
    record Reading(
        String effect, String scope, List<String> span, List<String> listed,
        String replacement, List<String> skipped
    ) {
        static Reading of(RegionalAlertClassification classification) {
            List<String> skipped = classification.stationRoles() == null ? List.of()
                : classification.stationRoles().entrySet().stream()
                    .filter(entry -> EXCLUDED_ROLE.equals(entry.getValue()))
                    .map(Map.Entry::getKey).sorted().toList();
            return new Reading(classification.serviceEffect(), classification.scope(),
                "segment-span".equals(classification.scope()) ? classification.spanStationIds() : List.of(),
                "listed-stations".equals(classification.scope()) ? classification.stationIds() : List.of(),
                classification.replacementService() == null ? "none" : classification.replacementService(),
                skipped);
        }

        static Reading of(RegionalAlertExtraction extraction) {
            String replacement = extraction.replacementService() == null ? "none" : extraction.replacementService();
            return new Reading(extraction.effect(), extraction.scope(), extraction.span(),
                extraction.listedStations(), replacement, extraction.skippedStations().stream().sorted().toList());
        }
    }

    /** Human-readable differences, empty when the reading agrees with the deterministic classification. */
    static List<String> differences(Reading deterministic, RegionalAlertExtraction extraction) {
        Reading model = Reading.of(extraction);
        List<String> differences = new ArrayList<>();
        if (!Objects.equals(deterministic.effect(), model.effect())) {
            differences.add("effect: " + deterministic.effect() + " vs " + model.effect());
        }
        if (!Objects.equals(deterministic.scope(), model.scope())) {
            differences.add("scope: " + deterministic.scope() + " vs " + model.scope());
        }
        if ("segment-span".equals(deterministic.scope()) && "segment-span".equals(model.scope())
            && !sameSections(deterministic.span(), model.span())) {
            differences.add("span: " + String.join("-", deterministic.span()) + " vs " + String.join("-", model.span()));
        }
        if ("listed-stations".equals(deterministic.scope()) && "listed-stations".equals(model.scope())
            && !Set.copyOf(deterministic.listed()).equals(Set.copyOf(model.listed()))) {
            differences.add("listed: " + deterministic.listed() + " vs " + model.listed());
        }
        if (!"unknown".equals(extraction.replacement()) && !Objects.equals(deterministic.replacement(), model.replacement())) {
            differences.add("replacement: " + deterministic.replacement() + " vs " + model.replacement());
        }
        if (!deterministic.skipped().equals(model.skipped())) {
            differences.add("skipped: " + deterministic.skipped() + " vs " + model.skipped());
        }
        return List.copyOf(differences);
    }

    /**
     * Classifies the event from a validated reading where the rules allow, or returns the
     * deterministic classification unchanged. {@code provenance} names the model and prompt version.
     */
    static RegionalAlertClassification refine(
        RegionalAlertClassification classification,
        RegionalAlertExtraction extraction,
        String provenance
    ) {
        if (extraction == null || !extraction.highConfidence()) return classification;
        if (STRUCTURAL_EFFECTS.contains(classification.serviceEffect())) return classification;
        if (!READING_EFFECTS.contains(extraction.effect())) return classification;

        String effect = extraction.effect();
        String scope = extraction.scope();
        List<String> span;
        List<String> scopeStations;
        // Sections the classifier derived from "trains will run between X and Y" follow the notice's
        // own words to the line's ends, so a closure reading keeps them.
        if ("no-service".equals(effect) && fromRunningSection(classification)) {
            scope = classification.scope();
            span = classification.spanStationIds();
            scopeStations = span;
        } else switch (scope) {
            case "segment-span" -> {
                span = extraction.span();
                if (spansFullLine(classification.lineIds(), span)) {
                    scope = "corridor";
                    scopeStations = classification.stationIds();
                } else {
                    scopeStations = span;
                }
            }
            case "corridor" -> {
                span = lineEnds(classification.lineIds());
                scopeStations = classification.stationIds();
            }
            case "listed-stations" -> {
                span = List.of();
                scopeStations = extraction.listedStations();
            }
            default -> {
                // A reading that cannot say where keeps the classifier's place, if it found one.
                scope = classification.scope();
                span = "segment-span".equals(scope) ? classification.spanStationIds() : List.of();
                scopeStations = "segment-span".equals(scope) ? span : classification.stationIds();
            }
        }

        String replacement = "unknown".equals(extraction.replacement())
            ? classification.replacementService() : extraction.replacementService();
        Map<String, String> roles = new LinkedHashMap<>();
        if (classification.stationRoles() != null) {
            classification.stationRoles().forEach((stationId, role) -> {
                if (!EXCLUDED_ROLE.equals(role)) roles.put(stationId, role);
            });
        }
        if (replacement != null) extraction.skippedStations().forEach(stationId -> roles.put(stationId, EXCLUDED_ROLE));

        boolean changed = !effect.equals(classification.serviceEffect()) || !scope.equals(classification.scope())
            || !span.equals(classification.spanStationIds())
            || !Objects.equals(replacement, classification.replacementService())
            || !roles.equals(classification.stationRoles());
        if (!changed) return classification;

        List<RegionalAlertClassification.Impact> impacts = new ArrayList<>();
        boolean primaryImpact = false;
        for (RegionalAlertClassification.Impact impact : classification.impacts()) {
            boolean primary = !impact.id().startsWith("timetable-") && !impact.id().startsWith("unresolved-")
                && Objects.equals(impact.scope(), classification.scope());
            if (!primary) {
                impacts.add(impact);
                continue;
            }
            primaryImpact = true;
            impacts.add(new RegionalAlertClassification.Impact(impact.id(), effect, scope, scopeStations,
                impact.start(), impact.endExclusive(), impact.basis(), impact.evidence(), impact.uncertainty()));
        }
        if (!primaryImpact && ("no-service".equals(effect) || "delay".equals(effect))) {
            // Mirrors the deterministic rules: a disruption without a stated window is an advisory.
            impacts.add(new RegionalAlertClassification.Impact("timing-unknown", effect, scope, scopeStations,
                null, null, "unknown", "notice wording", "Timing not verified"));
        }

        Map<String, List<String>> fieldSources = new LinkedHashMap<>(classification.fieldSources() == null
            ? Map.of() : classification.fieldSources());
        fieldSources.put("modelReading", List.of(provenance));

        return new RegionalAlertClassification(classification.canonicalEventId(), classification.sources(),
            classification.lineIds(), classification.tripNumbers(), classification.timing(), effect,
            classification.operatingChange(), scope, classification.cause(), replacement,
            classification.maximumDelayMinutes(), classification.title(), classification.description(),
            classification.activePeriodStart(), classification.activePeriodEnd(), classification.activePeriodBasis(),
            classification.sourceActivePeriodStart(), classification.sourceActivePeriodEnd(),
            classification.publishedAt(), classification.stationIds(), List.copyOf(span), Map.copyOf(roles),
            Map.copyOf(fieldSources), classification.primaryRawPayload(), impacts);
    }

    private static boolean fromRunningSection(RegionalAlertClassification classification) {
        return "segment-span".equals(classification.scope()) && classification.fieldSources() != null
            && classification.fieldSources().containsKey(MetrolinxAlertNormalizer.RUNNING_SECTION_FIELD);
    }

    /** Equal closed sections, ignoring the order of sections and of each section's ends. */
    static boolean sameSections(List<String> left, List<String> right) {
        return sectionSet(left).equals(sectionSet(right));
    }

    private static Set<Set<String>> sectionSet(List<String> span) {
        List<List<String>> pairs = RegionalSpans.pairs(span);
        if (pairs.isEmpty()) return Set.of(Set.copyOf(span));
        Set<Set<String>> sections = new LinkedHashSet<>();
        pairs.forEach(pair -> sections.add(Set.copyOf(pair)));
        return sections;
    }

    private static boolean spansFullLine(List<String> lineIds, List<String> span) {
        if (span.size() != 2) return false;
        Set<String> endpoints = new LinkedHashSet<>(span);
        return lineIds.stream().map(RegionalNetworkCatalog::route).flatMap(java.util.Optional::stream)
            .anyMatch(route -> endpoints.equals(Set.of(route.stationIds().getFirst(), route.stationIds().getLast())));
    }

    private static List<String> lineEnds(List<String> lineIds) {
        if (lineIds.size() != 1) return List.of();
        return RegionalNetworkCatalog.route(lineIds.getFirst())
            .map(route -> List.of(route.stationIds().getFirst(), route.stationIds().getLast()))
            .orElse(List.of());
    }
}
