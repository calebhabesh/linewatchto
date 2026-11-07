package com.calebhabesh.linewatch.regional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiPredicate;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Consolidates classified Metrolinx events that describe the same rider event, so each consumer sees
 * one event that still references every source record.
 *
 * <p>Each notice has a role. Line notices are the events riders see. Station lists and banners are
 * supplementary: they fold into the one line notice they describe and never lead. Any notice can be a
 * republication of another with identical rider content, and a line notice can be restated by a later
 * one that changes a sentence but states the same facts. Updates and resolutions change the title,
 * place, window, or facts, so they never match the notice they follow and need no role of their own.
 */
final class MetrolinxNoticeConsolidator {
    private static final Pattern TRAILING_DIGITS = Pattern.compile("(\\d+)$");
    private static final Set<String> AUDITED_EFFECTS = Set.of("no-service", "delay");

    enum NoticeRole { LINE_NOTICE, STATION_LIST, BANNER }

    enum MergeReason {
        /** Identical rider content republished under another notice ID. */
        REPUBLISHED,
        /** A later line notice restating the same event with a sentence added or changed. */
        RESTATED,
        /** Station-information list of stops inside the line notice's span. */
        STATION_LIST,
        /** Top Red Banner restating the line notice. */
        BANNER
    }

    record Merge(String leadEventId, String absorbedEventId, MergeReason reason) {}

    /** Two surviving events that may describe one rider event; reported for review, never merged. */
    record NearDuplicate(String firstEventId, String secondEventId) {}

    record Result(List<RegionalAlertClassification> events, List<Merge> merges, List<NearDuplicate> nearDuplicates) {}

    private MetrolinxNoticeConsolidator() {}

    /**
     * @param bannerEventIds events published as a Top Red Banner
     * @param reclassify classifies the combined evidence of the given events, in that order
     */
    static Result consolidate(
        List<RegionalAlertClassification> events,
        Set<String> bannerEventIds,
        Function<List<String>, RegionalAlertClassification> reclassify
    ) {
        List<Merge> merges = new ArrayList<>();
        List<RegionalAlertClassification> consolidated = mergeRepublishedEvents(events, reclassify, merges);
        Map<String, NoticeRole> roles = new LinkedHashMap<>();
        for (RegionalAlertClassification event : consolidated) {
            roles.put(event.canonicalEventId(), bannerEventIds.contains(event.canonicalEventId()) ? NoticeRole.BANNER
                : "listed-stations".equals(event.scope()) ? NoticeRole.STATION_LIST
                : NoticeRole.LINE_NOTICE);
        }
        // Restatements fold first, so a station list describing a restated notice has one lead.
        consolidated = foldRestatements(consolidated, roles, merges);
        consolidated = foldInto(consolidated, MergeReason.STATION_LIST, merges, (detail, lead) ->
            roles.get(detail.canonicalEventId()) == NoticeRole.STATION_LIST
                && roles.get(lead.canonicalEventId()) == NoticeRole.LINE_NOTICE
                && stationListFoldsInto(detail, lead));
        consolidated = foldInto(consolidated, MergeReason.BANNER, merges, (detail, lead) ->
            roles.get(detail.canonicalEventId()) == NoticeRole.BANNER
                && roles.get(lead.canonicalEventId()) == NoticeRole.LINE_NOTICE
                && bannerFoldsInto(detail, lead)
                && bannerAddsNoFacts(detail, lead));
        return new Result(consolidated, List.copyOf(merges), nearDuplicates(consolidated));
    }

    /**
     * Metrolinx sometimes publishes the same rider notice under several notice IDs, for example a
     * line notice reposted as station information that lists one stop. Events whose rider-facing
     * content is identical are classified once from their combined evidence. Structured stops may
     * differ only when one notice lists none.
     */
    private static List<RegionalAlertClassification> mergeRepublishedEvents(
        List<RegionalAlertClassification> classifications,
        Function<List<String>, RegionalAlertClassification> reclassify,
        List<Merge> merges
    ) {
        Map<RepublicationKey, List<List<RegionalAlertClassification>>> matches = new LinkedHashMap<>();
        for (RegionalAlertClassification classification : classifications) {
            List<List<RegionalAlertClassification>> clusters =
                matches.computeIfAbsent(RepublicationKey.of(classification), ignored -> new ArrayList<>());
            clusters.stream()
                .filter(cluster -> cluster.stream().allMatch(event -> compatibleStops(event, classification)))
                .findFirst()
                .ifPresentOrElse(cluster -> cluster.add(classification),
                    () -> clusters.add(new ArrayList<>(List.of(classification))));
        }
        return matches.values().stream().flatMap(List::stream).map(events -> {
            if (events.size() == 1) return events.getFirst();
            // The highest-priority source supplies the content, then the lowest notice ID. The event
            // keeps the lowest (earliest published) notice ID, so a later copy from a higher-priority
            // source does not turn it into a new event for push notifications and history.
            List<String> eventIds = events.stream()
                .map(RegionalAlertClassification::canonicalEventId)
                .sorted(Comparator.comparing(MetrolinxNoticeConsolidator::noticeNumber)
                    .thenComparing(Comparator.naturalOrder()))
                .toList();
            RegionalAlertClassification merged = reclassify.apply(eventIds).withCanonicalEventId(eventIds.getFirst());
            eventIds.stream()
                .filter(eventId -> !eventId.equals(merged.canonicalEventId()))
                .forEach(eventId -> merges.add(new Merge(merged.canonicalEventId(), eventId, MergeReason.REPUBLISHED)));
            return merged;
        }).toList();
    }

    /**
     * Folds supplementary notices into the one event they describe. The lead keeps its own content
     * and gains the detail's source references; a detail matching several leads stays separate.
     */
    private static List<RegionalAlertClassification> foldInto(
        List<RegionalAlertClassification> events,
        MergeReason reason,
        List<Merge> merges,
        BiPredicate<RegionalAlertClassification, RegionalAlertClassification> foldsInto
    ) {
        Map<String, String> leadByDetail = new LinkedHashMap<>();
        for (RegionalAlertClassification detail : events) {
            List<RegionalAlertClassification> leads = events.stream()
                .filter(lead -> lead != detail && foldsInto.test(detail, lead))
                .toList();
            if (leads.size() == 1) leadByDetail.put(detail.canonicalEventId(), leads.getFirst().canonicalEventId());
        }
        // A lead that is itself folded elsewhere would chain events together; keep both separate.
        leadByDetail.values().removeIf(leadByDetail::containsKey);
        return absorb(events, leadByDetail, reason, merges);
    }

    /**
     * Metrolinx sometimes restates a line notice under a later notice ID with a sentence added,
     * changed, or dropped ("If you are taking the TTC, please note ...") and leaves the earlier one in
     * the feed. A later line notice with the same lines, trips, effect, place, and active period and a
     * matching title restates the earliest such notice when it states no impact window, station,
     * replacement service, or delay that notice does not. The earliest notice leads with its own
     * content, as for republications, so a restatement never becomes a new event for push and
     * history; the restatements add their source references.
     */
    private static List<RegionalAlertClassification> foldRestatements(
        List<RegionalAlertClassification> events,
        Map<String, NoticeRole> roles,
        List<Merge> merges
    ) {
        List<List<RegionalAlertClassification>> clusters = new ArrayList<>();
        events.stream()
            .filter(event -> roles.get(event.canonicalEventId()) == NoticeRole.LINE_NOTICE)
            .sorted(Comparator.comparing((RegionalAlertClassification event) -> noticeNumber(event.canonicalEventId()))
                .thenComparing(RegionalAlertClassification::canonicalEventId))
            .forEach(event -> clusters.stream()
                .filter(cluster -> restates(event, cluster.getFirst()))
                .findFirst()
                .ifPresentOrElse(cluster -> cluster.add(event),
                    () -> clusters.add(new ArrayList<>(List.of(event)))));
        Map<String, String> leadByDetail = new LinkedHashMap<>();
        for (List<RegionalAlertClassification> cluster : clusters) {
            String lead = cluster.getFirst().canonicalEventId();
            cluster.stream().skip(1).forEach(detail -> leadByDetail.put(detail.canonicalEventId(), lead));
        }
        return absorb(events, leadByDetail, MergeReason.RESTATED, merges);
    }

    private static boolean restates(RegionalAlertClassification later, RegionalAlertClassification lead) {
        return later.lineIds().equals(lead.lineIds())
            && later.tripNumbers().equals(lead.tripNumbers())
            && Objects.equals(later.serviceEffect(), lead.serviceEffect())
            && Objects.equals(later.scope(), lead.scope())
            && later.spanStationIds().equals(lead.spanStationIds())
            && compatibleStops(later.stationIds(), lead.stationIds())
            && later.activePeriodStart() != null
            && Objects.equals(instant(later.activePeriodStart()), instant(lead.activePeriodStart()))
            && Objects.equals(instant(later.activePeriodEnd()), instant(lead.activePeriodEnd()))
            && titlesMatch(later, lead)
            && impactWindows(lead).containsAll(impactWindows(later))
            && (later.replacementService() == null || later.replacementService().equals(lead.replacementService()))
            && (later.maximumDelayMinutes() == null || later.maximumDelayMinutes().equals(lead.maximumDelayMinutes()))
            && mentionedStations(lead).containsAll(mentionedStations(later));
    }

    /** An event's impacts by effect, scope, and window, without their positional IDs or stop lists. */
    private static Set<List<Object>> impactWindows(RegionalAlertClassification event) {
        Set<List<Object>> windows = new LinkedHashSet<>();
        for (RegionalAlertClassification.Impact impact : event.impacts()) {
            windows.add(java.util.Arrays.asList(impact.serviceEffect(), impact.scope(), instant(impact.start()),
                instant(impact.endExclusive()), impact.basis()));
        }
        return windows;
    }

    private static Set<String> mentionedStations(RegionalAlertClassification event) {
        return Set.copyOf(MetrolinxAlertNormalizer.mentionedStations(
            event.title() + " " + event.description(), event.lineIds()));
    }

    /** Removes each detail and gives its lead the detail's source references. */
    private static List<RegionalAlertClassification> absorb(
        List<RegionalAlertClassification> events,
        Map<String, String> leadByDetail,
        MergeReason reason,
        List<Merge> merges
    ) {
        leadByDetail.forEach((detail, lead) -> merges.add(new Merge(lead, detail, reason)));
        Map<String, List<RegionalAlertClassification.SourceReference>> absorbed = new LinkedHashMap<>();
        for (RegionalAlertClassification event : events) {
            String lead = leadByDetail.get(event.canonicalEventId());
            if (lead != null) absorbed.computeIfAbsent(lead, ignored -> new ArrayList<>()).addAll(event.sources());
        }
        return events.stream()
            .filter(event -> !leadByDetail.containsKey(event.canonicalEventId()))
            .map(event -> absorbed.containsKey(event.canonicalEventId())
                ? event.withAdditionalSources(absorbed.get(event.canonicalEventId()))
                : event)
            .toList();
    }

    /**
     * A station-information notice listing the stops a line notice closes ("No GO Transit service at
     * this station") is detail of that line notice, not a separate closure. Its title must match. For
     * a dated closure Metrolinx words the station copy's title differently ("Kitchener Line Service
     * Adjustments Oct. 31-Nov. 1" for "Oct. 31-Nov. 1: Service adjustments"), so there the titles
     * need only match once the line name and dates are left out.
     */
    private static boolean stationListFoldsInto(RegionalAlertClassification detail, RegionalAlertClassification lead) {
        return !detail.stationIds().isEmpty()
            && ("segment-span".equals(lead.scope()) || "corridor".equals(lead.scope()))
            && detail.lineIds().equals(lead.lineIds())
            && Objects.equals(detail.serviceEffect(), lead.serviceEffect())
            && titlesMatch(detail, lead)
            && detail.activePeriodStart() != null
            && detail.activePeriodStart().isEqual(nullSafe(lead.activePeriodStart()))
            && Objects.equals(instant(detail.activePeriodEnd()), instant(lead.activePeriodEnd()))
            && lead.lineIds().stream().allMatch(lineId -> stationsWithin(lineId, detail.stationIds(), lead));
    }

    /** Equal titles, or for dated closures equal once the line name and dates are left out. */
    private static boolean titlesMatch(RegionalAlertClassification left, RegionalAlertClassification right) {
        return RepublicationKey.comparableText(left.title()).equalsIgnoreCase(RepublicationKey.comparableText(right.title()))
            || datedClosure(left) && datedClosure(right)
                && titleTopic(left).equals(titleTopic(right)) && !titleTopic(right).isEmpty();
    }

    /** A no-service notice whose window comes from dates stated in its own text. */
    private static boolean datedClosure(RegionalAlertClassification event) {
        return "no-service".equals(event.serviceEffect())
            && "text-date-range".equals(event.activePeriodBasis())
            && event.activePeriodStart() != null
            && event.activePeriodEnd() != null;
    }

    /** A title's words without its dates or line names: "Kitchener Line ... Oct. 31-Nov. 1" -> "service adjustments". */
    static String titleTopic(RegionalAlertClassification event) {
        String title = event.title() == null ? "" : event.title();
        StringBuilder topic = new StringBuilder(title);
        List<RegionalAlertTextDateParser.DateRange> dates = RegionalAlertTextDateParser.ranges(title, event.publishedAt());
        dates.stream().sorted(Comparator.comparingInt(RegionalAlertTextDateParser.DateRange::from).reversed())
            .forEach(date -> topic.replace(date.from(), Math.min(date.to(), topic.length()), " "));
        String text = withoutLineNames(topic.toString().toLowerCase(Locale.CANADA), event.lineIds());
        return text.replaceAll("[^\\p{L}\\p{N}]+", " ").strip();
    }

    /** Lower-case text without the given lines' names: "kitchener line service adjustments" -> " service adjustments". */
    private static String withoutLineNames(String lowerCaseText, List<String> lineIds) {
        String text = lowerCaseText;
        for (String lineId : lineIds) {
            RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
            if (route == null) continue;
            String name = Pattern.quote(route.name().toLowerCase(Locale.CANADA));
            text = text.replaceAll("\\b" + name + "(?:\\s+(?:line|corridor))?\\b", " ");
        }
        return text;
    }

    /** A "Top Red Banner" restates a current notice in its own words over the same span and dates. */
    private static boolean bannerFoldsInto(RegionalAlertClassification detail, RegionalAlertClassification lead) {
        return detail.lineIds().equals(lead.lineIds())
            && Objects.equals(detail.serviceEffect(), lead.serviceEffect())
            && Objects.equals(detail.scope(), lead.scope())
            && ("corridor".equals(lead.scope())
                || !lead.spanStationIds().isEmpty()
                    && Set.copyOf(detail.spanStationIds()).equals(Set.copyOf(lead.spanStationIds())))
            && windowsOverlap(detail, lead);
    }

    /**
     * A banner may leave out what its notice states, but it must not name other trips, stations, a
     * replacement service, or a delay the notice does not, since that would describe another event.
     */
    private static boolean bannerAddsNoFacts(RegionalAlertClassification banner, RegionalAlertClassification lead) {
        String bannerText = banner.title() + " " + banner.description();
        String leadText = lead.title() + " " + lead.description();
        return banner.tripNumbers().equals(lead.tripNumbers())
            && (banner.replacementService() == null
                || banner.replacementService().equals(lead.replacementService()))
            && (banner.maximumDelayMinutes() == null
                || banner.maximumDelayMinutes().equals(lead.maximumDelayMinutes()))
            && Set.copyOf(MetrolinxAlertNormalizer.mentionedStations(leadText, lead.lineIds()))
                .containsAll(MetrolinxAlertNormalizer.mentionedStations(bannerText, banner.lineIds()));
    }

    /**
     * Surviving closures or delays on a shared line with the same effect, trips, overlapping windows,
     * and overlapping places. Distinct concurrent incidents can match, so these are only reported.
     * Other effects stay off the map and include station amenity and accessibility notices.
     */
    private static List<NearDuplicate> nearDuplicates(List<RegionalAlertClassification> events) {
        List<NearDuplicate> pairs = new ArrayList<>();
        for (int first = 0; first < events.size(); first++) {
            for (int second = first + 1; second < events.size(); second++) {
                RegionalAlertClassification left = events.get(first);
                RegionalAlertClassification right = events.get(second);
                if (AUDITED_EFFECTS.contains(left.serviceEffect())
                    && !Collections.disjoint(left.lineIds(), right.lineIds())
                    && Objects.equals(left.serviceEffect(), right.serviceEffect())
                    && left.tripNumbers().equals(right.tripNumbers())
                    && windowsOverlap(left, right)
                    && placesOverlap(left, right)) {
                    pairs.add(new NearDuplicate(left.canonicalEventId(), right.canonicalEventId()));
                }
            }
        }
        return List.copyOf(pairs);
    }

    private static boolean placesOverlap(RegionalAlertClassification left, RegionalAlertClassification right) {
        for (String lineId : left.lineIds()) {
            if (!right.lineIds().contains(lineId)) continue;
            Set<String> leftPlaces = places(lineId, left);
            Set<String> rightPlaces = places(lineId, right);
            // An event without known places may concern any part of the line.
            if (leftPlaces.isEmpty() || rightPlaces.isEmpty() || !Collections.disjoint(leftPlaces, rightPlaces)) {
                return true;
            }
        }
        return false;
    }

    /** Stations an event concerns on one line; empty for the whole line or unknown places. */
    private static Set<String> places(String lineId, RegionalAlertClassification event) {
        if ("corridor".equals(event.scope())) return Set.of();
        Set<String> places = new LinkedHashSet<>(event.stationIds());
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
        if (route != null && RegionalSpans.valid(event.spanStationIds())) {
            places.addAll(RegionalSpans.stationsWithin(route, event.spanStationIds()));
        } else {
            places.addAll(event.spanStationIds());
        }
        return places;
    }

    private static boolean stationsWithin(String lineId, List<String> stationIds, RegionalAlertClassification lead) {
        RegionalNetworkCatalog.Route route = RegionalNetworkCatalog.route(lineId).orElse(null);
        if (route == null) return false;
        if ("corridor".equals(lead.scope())) return route.stationIds().containsAll(stationIds);
        return RegionalSpans.containsAll(route, lead.spanStationIds(), stationIds);
    }

    private static boolean windowsOverlap(RegionalAlertClassification left, RegionalAlertClassification right) {
        if (left.activePeriodStart() == null || right.activePeriodStart() == null) return false;
        boolean leftStartsBeforeRightEnds = right.activePeriodEnd() == null
            || left.activePeriodStart().isBefore(right.activePeriodEnd());
        boolean rightStartsBeforeLeftEnds = left.activePeriodEnd() == null
            || right.activePeriodStart().isBefore(left.activePeriodEnd());
        return leftStartsBeforeRightEnds && rightStartsBeforeLeftEnds;
    }

    private static OffsetDateTime nullSafe(OffsetDateTime value) {
        return value == null ? OffsetDateTime.MIN : value;
    }

    private static Instant instant(OffsetDateTime value) {
        return value == null ? null : value.toInstant();
    }

    private static boolean compatibleStops(RegionalAlertClassification left, RegionalAlertClassification right) {
        if (!compatibleStops(left.stationIds(), right.stationIds())) return false;
        for (int index = 0; index < left.impacts().size(); index++) {
            if (!compatibleStops(left.impacts().get(index).stationIds(), right.impacts().get(index).stationIds())) {
                return false;
            }
        }
        return true;
    }

    private static boolean compatibleStops(List<String> left, List<String> right) {
        return left.isEmpty() || right.isEmpty() || Set.copyOf(left).equals(Set.copyOf(right));
    }

    private static long noticeNumber(String canonicalEventId) {
        Matcher digits = TRAILING_DIGITS.matcher(canonicalEventId);
        return digits.find() ? Long.parseLong(digits.group(1)) : Long.MAX_VALUE;
    }

    /** Rider-facing event content; structured stop lists are compared separately by compatibleStops. */
    private record RepublicationKey(
        List<String> lineIds, List<String> tripNumbers, String serviceEffect, String scope,
        String title, String description, OffsetDateTime activePeriodStart, OffsetDateTime activePeriodEnd,
        List<String> spanStationIds, List<RegionalAlertClassification.Impact> impacts
    ) {
        static RepublicationKey of(RegionalAlertClassification classification) {
            return new RepublicationKey(
                classification.lineIds(), classification.tripNumbers(), classification.serviceEffect(),
                classification.scope(), comparableText(classification.title()).toLowerCase(Locale.CANADA),
                comparableBody(classification.title(), classification.description(), classification.lineIds())
                    .toLowerCase(Locale.CANADA),
                classification.activePeriodStart(),
                classification.activePeriodEnd(), classification.spanStationIds(),
                classification.impacts().stream().map(impact -> new RegionalAlertClassification.Impact(
                    impact.id(), impact.serviceEffect(), impact.scope(), List.of(), impact.start(),
                    impact.endExclusive(), impact.basis(), impact.evidence(), impact.uncertainty()
                )).toList()
            );
        }

        static String comparableText(String value) {
            if (value == null) return "";
            // Reposts differ in spacing after sentence breaks, in a final full stop, and in letter case.
            return value.replaceAll("([.!?:;,])(?=\\S)", "$1 ")
                .replaceAll("\\s+", " ")
                .strip()
                .replaceAll("[.!?\\s]+$", "");
        }

        /**
         * Some reposts repeat the title as the opening words of the body, sometimes without its line
         * name ("Oct. 31-Nov. 1: Service adjustments" for "Oct. 31-Nov. 1: Kitchener line service
         * adjustments").
         */
        static String comparableBody(String title, String description, List<String> lineIds) {
            String body = comparableText(description);
            String fullTitle = comparableText(title);
            String shortTitle = comparableText(withoutLineNames(fullTitle.toLowerCase(Locale.CANADA), lineIds));
            for (String heading : List.of(fullTitle, shortTitle)) {
                if (!heading.isEmpty() && body.regionMatches(true, 0, heading, 0, heading.length())) {
                    return body.substring(heading.length()).replaceFirst("^[\\s:.\\-–—]+", "");
                }
            }
            return body;
        }
    }
}
