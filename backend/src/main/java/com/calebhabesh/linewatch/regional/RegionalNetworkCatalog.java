package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.station.StationResponses;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public final class RegionalNetworkCatalog {
    public static final String NETWORK_ID = "regional";

    public record Route(String id, String number, String name, String color, List<String> stationIds) {
    }

    public record Segment(
        String id,
        String lineId,
        String label,
        String stationAId,
        String stationBId,
        String stationAAnchorId,
        String stationBAnchorId,
        String guidePathId
    ) {}

    private static final List<Route> ROUTES = List.of(
        route("regional-br", "BR", "Barrie", "#155ba0",
            "union", "downsview-park", "rutherford", "maple", "king-city", "aurora", "newmarket",
            "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront"),
        route("regional-ki", "KI", "Kitchener", "#138336",
            "union", "bloor", "mount-dennis", "weston", "etobicoke-north", "malton", "bramalea",
            "brampton-innovation-district", "mount-pleasant", "georgetown", "acton", "guelph-central",
            "kitchener", "stratford"),
        route("regional-le", "LE", "Lakeshore East", "#ee2722",
            "union", "danforth", "scarborough", "eglinton", "guildwood", "rouge-hill", "pickering",
            "ajax", "whitby", "durham-college-oshawa"),
        route("regional-lw", "LW", "Lakeshore West", "#8b0a31",
            "union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson", "oakville",
            "bronte", "appleby", "burlington", "aldershot", "west-harbour", "hamilton",
            "confederation", "st-catharines", "niagara-falls"),
        route("regional-mi", "MI", "Milton", "#f47216",
            "union", "kipling", "dixie", "cooksville", "erindale", "streetsville", "meadowvale",
            "lisgar", "milton"),
        route("regional-rh", "RH", "Richmond Hill", "#27adea",
            "union", "oriole", "old-cummer", "langstaff", "richmond-hill", "gormley", "bloomington"),
        route("regional-st", "ST", "Stouffville", "#774111",
            "union", "kennedy", "agincourt", "milliken", "unionville", "centennial", "markham",
            "mount-joy", "stouffville", "old-elm"),
        route("regional-up", "UP", "Union Pearson Express", "#4084cd",
            "union", "bloor", "mount-dennis", "weston", "pearson-airport")
    );

    private static final Map<String, String> NAME_OVERRIDES = Map.ofEntries(
        Map.entry("allandale-waterfront", "Allandale Waterfront"),
        Map.entry("brampton-innovation-district", "Brampton Innovation District"),
        Map.entry("durham-college-oshawa", "Durham College Oshawa"),
        Map.entry("east-gwillimbury", "East Gwillimbury"),
        Map.entry("guelph-central", "Guelph Central"),
        Map.entry("mount-dennis", "Mount Dennis"),
        Map.entry("mount-joy", "Mount Joy"),
        Map.entry("mount-pleasant", "Mount Pleasant"),
        Map.entry("niagara-falls", "Niagara Falls"),
        Map.entry("old-cummer", "Old Cummer"),
        Map.entry("old-elm", "Old Elm"),
        Map.entry("pearson-airport", "Pearson Airport"),
        Map.entry("port-credit", "Port Credit"),
        Map.entry("rouge-hill", "Rouge Hill"),
        Map.entry("st-catharines", "St. Catharines"),
        Map.entry("west-harbour", "West Harbour")
    );

    // Reviewed against the official Metrolinx Stop/All train-station catalog.
    private static final Map<String, String> STOP_CODE_TO_STATION_ID = Map.ofEntries(
        Map.entry("AC", "acton"), Map.entry("AD", "allandale-waterfront"),
        Map.entry("AG", "agincourt"), Map.entry("AJ", "ajax"),
        Map.entry("AL", "aldershot"), Map.entry("AP", "appleby"),
        Map.entry("AU", "aurora"), Map.entry("BA", "barrie-south"),
        Map.entry("BD", "bradford"), Map.entry("BE", "bramalea"),
        Map.entry("BL", "bloor"), Map.entry("BM", "bloomington"),
        Map.entry("BO", "bronte"), Map.entry("BR", "brampton-innovation-district"),
        Map.entry("BU", "burlington"), Map.entry("CE", "centennial"),
        Map.entry("CF", "confederation"), Map.entry("CL", "clarkson"),
        Map.entry("CO", "cooksville"), Map.entry("DA", "danforth"),
        Map.entry("DI", "dixie"), Map.entry("DW", "downsview-park"),
        Map.entry("EA", "east-gwillimbury"), Map.entry("EG", "eglinton"),
        Map.entry("ER", "erindale"), Map.entry("ET", "etobicoke-north"),
        Map.entry("EX", "exhibition"), Map.entry("GE", "georgetown"),
        Map.entry("GL", "guelph-central"), Map.entry("GO", "gormley"),
        Map.entry("GU", "guildwood"), Map.entry("HA", "hamilton"),
        Map.entry("KC", "king-city"), Map.entry("KE", "kennedy"),
        Map.entry("KI", "kitchener"), Map.entry("KP", "kipling"),
        Map.entry("LA", "langstaff"), Map.entry("LI", "old-elm"),
        Map.entry("LO", "long-branch"), Map.entry("LS", "lisgar"),
        Map.entry("MA", "malton"), Map.entry("MD", "mount-dennis"),
        Map.entry("ME", "meadowvale"), Map.entry("MI", "mimico"),
        Map.entry("MJ", "mount-joy"), Map.entry("MK", "milliken"),
        Map.entry("ML", "milton"), Map.entry("MO", "mount-pleasant"),
        Map.entry("MP", "maple"), Map.entry("MR", "markham"),
        Map.entry("NE", "newmarket"), Map.entry("NI", "niagara-falls"),
        Map.entry("OA", "oakville"), Map.entry("OL", "old-cummer"),
        Map.entry("OR", "oriole"), Map.entry("OS", "durham-college-oshawa"),
        Map.entry("PA", "pearson-airport"), Map.entry("PIN", "pickering"),
        Map.entry("PO", "port-credit"), Map.entry("RI", "richmond-hill"),
        Map.entry("RO", "rouge-hill"), Map.entry("RU", "rutherford"),
        Map.entry("SC", "scarborough"), Map.entry("SCTH", "st-catharines"),
        Map.entry("SF", "stratford"), Map.entry("SR", "streetsville"),
        Map.entry("ST", "stouffville"), Map.entry("UI", "unionville"),
        Map.entry("UN", "union"), Map.entry("WE", "weston"),
        Map.entry("WH", "whitby"), Map.entry("WR", "west-harbour")
    );

    private static final Map<String, StationResponses.StationSummaryResponse> STATIONS = buildStations();
    private static final List<Segment> SEGMENTS = buildSegments();

    private RegionalNetworkCatalog() {
    }

    public static List<Route> routes() {
        return ROUTES;
    }

    public static List<StationResponses.StationSummaryResponse> stations() {
        return List.copyOf(STATIONS.values());
    }

    public static Optional<StationResponses.StationSummaryResponse> station(String stationId) {
        return Optional.ofNullable(STATIONS.get(stationId));
    }

    public static Optional<Route> route(String lineId) {
        return ROUTES.stream().filter(route -> route.id().equals(lineId)).findFirst();
    }

    public static Optional<String> lineIdForSourceCode(String sourceCode) {
        if (sourceCode == null) return Optional.empty();
        String normalized = sourceCode.trim().toUpperCase(Locale.CANADA);
        if ("GT".equals(normalized)) normalized = "KI";
        String code = normalized;
        return ROUTES.stream().filter(route -> route.number().equals(code)).map(Route::id).findFirst();
    }

    public static Optional<Segment> segmentBetween(String lineId, String stationAId, String stationBId) {
        return SEGMENTS.stream().filter(segment -> segment.lineId().equals(lineId))
            .filter(segment -> (segment.stationAId().equals(stationAId) && segment.stationBId().equals(stationBId))
                || (segment.stationAId().equals(stationBId) && segment.stationBId().equals(stationAId)))
            .findFirst();
    }

    public static Optional<String> stationIdForStopCode(String stopCode) {
        if (stopCode == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(STOP_CODE_TO_STATION_ID.get(stopCode.trim().toUpperCase(Locale.CANADA)));
    }

    public static Optional<String> stopCodeForStationId(String stationId) {
        if (stationId == null) {
            return Optional.empty();
        }
        String normalized = stationId.trim().toLowerCase(Locale.CANADA);
        return STOP_CODE_TO_STATION_ID.entrySet().stream()
            .filter(entry -> entry.getValue().equals(normalized))
            .map(Map.Entry::getKey)
            .findFirst();
    }

    public static List<Segment> segments() {
        return SEGMENTS;
    }

    public static List<String> segmentIds(String lineId, List<String> affectedStationIds) {
        Route route = route(lineId).orElse(null);
        if (route == null) {
            return List.of();
        }
        Set<String> affected = affectedStationIds == null ? Set.of() : Set.copyOf(affectedStationIds);
        if (affected.isEmpty()) {
            return SEGMENTS.stream().filter(segment -> segment.lineId().equals(lineId)).map(Segment::id).toList();
        }
        List<Integer> indexes = affected.stream()
            .map(route.stationIds()::indexOf)
            .filter(index -> index >= 0)
            .sorted()
            .toList();
        if (indexes.size() < 2) {
            return List.of();
        }
        List<String> ids = new ArrayList<>();
        for (int index = 0; index < indexes.size() - 1; index++) {
            String fromStationId = route.stationIds().get(indexes.get(index));
            String toStationId = route.stationIds().get(indexes.get(index + 1));
            for (Segment segment : shortestSegmentPath(lineId, fromStationId, toStationId)) {
                if (!ids.contains(segment.id())) {
                    ids.add(segment.id());
                }
            }
        }
        return List.copyOf(ids);
    }

    private static List<Segment> shortestSegmentPath(String lineId, String fromStationId, String toStationId) {
        if (fromStationId.equals(toStationId)) {
            return List.of();
        }
        List<String> pending = new ArrayList<>();
        Map<String, Segment> previousSegment = new LinkedHashMap<>();
        pending.add(fromStationId);
        previousSegment.put(fromStationId, null);
        for (int cursor = 0; cursor < pending.size(); cursor++) {
            String stationId = pending.get(cursor);
            for (Segment segment : SEGMENTS) {
                if (!segment.lineId().equals(lineId)) continue;
                String adjacentStationId = segment.stationAId().equals(stationId)
                    ? segment.stationBId()
                    : segment.stationBId().equals(stationId) ? segment.stationAId() : null;
                if (adjacentStationId == null || previousSegment.containsKey(adjacentStationId)) continue;
                previousSegment.put(adjacentStationId, segment);
                pending.add(adjacentStationId);
                if (adjacentStationId.equals(toStationId)) {
                    cursor = pending.size();
                    break;
                }
            }
        }
        if (!previousSegment.containsKey(toStationId)) {
            return List.of();
        }
        List<Segment> reversed = new ArrayList<>();
        String stationId = toStationId;
        while (!stationId.equals(fromStationId)) {
            Segment segment = previousSegment.get(stationId);
            reversed.add(segment);
            stationId = segment.stationAId().equals(stationId)
                ? segment.stationBId()
                : segment.stationAId();
        }
        return reversed.reversed();
    }

    private static Route route(String id, String number, String name, String color, String... stationIds) {
        return new Route(id, number, name, color, List.of(stationIds));
    }

    private static Map<String, StationResponses.StationSummaryResponse> buildStations() {
        Map<String, List<String>> lineIds = new LinkedHashMap<>();
        for (Route route : ROUTES) {
            for (String stationId : route.stationIds()) {
                lineIds.computeIfAbsent(stationId, ignored -> new ArrayList<>()).add(route.id());
            }
        }

        Map<String, StationResponses.StationSummaryResponse> stations = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> entry : lineIds.entrySet()) {
            stations.put(entry.getKey(), new StationResponses.StationSummaryResponse(
                entry.getKey(),
                stationName(entry.getKey()),
                0,
                0,
                entry.getValue().size() > 1,
                List.copyOf(entry.getValue()),
                false,
                "normal",
                new StationResponses.StationAccessOutageCountsResponse(0, 0)
            ));
        }
        return stations;
    }

    private static List<Segment> buildSegments() {
        List<Segment> segments = new ArrayList<>();
        for (Route route : ROUTES) {
            for (List<String> link : routeLinks(route)) {
                String stationAId = link.get(0);
                String stationBId = link.get(1);
                String code = route.number().toLowerCase(Locale.CANADA);
                segments.add(new Segment(
                    segmentId(route.number(), stationAId, stationBId),
                    route.id(),
                    stationName(stationAId) + " to " + stationName(stationBId),
                    stationAId,
                    stationBId,
                    stationAnchorId(stationAId, route.number()),
                    stationAnchorId(stationBId, route.number()),
                    "segment-guide-" + code + "-" + stationAId + "-" + stationBId
                ));
            }
        }
        return List.copyOf(segments);
    }

    private static List<List<String>> routeLinks(Route route) {
        List<List<String>> links = new ArrayList<>();
        int linearLinkCount = "LW".equals(route.number())
            ? route.stationIds().indexOf("aldershot")
            : route.stationIds().size() - 1;
        for (int index = 0; index < linearLinkCount; index++) {
            links.add(List.of(route.stationIds().get(index), route.stationIds().get(index + 1)));
        }
        if ("LW".equals(route.number())) {
            links.add(List.of("aldershot", "west-harbour"));
            links.add(List.of("aldershot", "hamilton"));
            links.add(List.of("west-harbour", "hamilton"));
            links.add(List.of("west-harbour", "confederation"));
            links.add(List.of("confederation", "st-catharines"));
            links.add(List.of("st-catharines", "niagara-falls"));
        }
        return links;
    }

    private static String stationAnchorId(String stationId, String routeNumber) {
        if (("KI".equals(routeNumber) || "UP".equals(routeNumber))
            && ("bloor".equals(stationId) || "weston".equals(stationId) || "mount-dennis".equals(stationId))) {
            return "station-" + stationId + "-" + routeNumber.toLowerCase(Locale.CANADA);
        }
        return "station-" + stationId;
    }

    private static String segmentId(String routeNumber, String stationAId, String stationBId) {
        return "segment-" + routeNumber.toLowerCase(Locale.CANADA) + "-" + stationAId + "-" + stationBId;
    }

    private static String stationName(String stationId) {
        String override = NAME_OVERRIDES.get(stationId);
        if (override != null) {
            return override;
        }
        String[] words = stationId.split("-");
        StringBuilder result = new StringBuilder();
        for (String word : words) {
            if (!result.isEmpty()) {
                result.append(' ');
            }
            result.append(word.substring(0, 1).toUpperCase(Locale.CANADA))
                .append(word.substring(1));
        }
        return result.toString();
    }
}
