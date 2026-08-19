package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.station.StationResponses;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public final class RegionalNetworkCatalog {
    public static final String NETWORK_ID = "regional";

    public record Route(
        String id,
        String number,
        String name,
        String color,
        int inboundDirectionId,
        List<String> stationIds
    ) {
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
        route("regional-br", "BR", "Barrie", "#155ba0", 1,
            "union", "downsview-park", "rutherford", "maple", "king-city", "aurora", "newmarket",
            "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront"),
        route("regional-ki", "KI", "Kitchener", "#138336", 0,
            "union", "bloor", "mount-dennis", "weston", "etobicoke-north", "malton", "bramalea",
            "brampton-innovation-district", "mount-pleasant", "georgetown", "acton", "guelph-central",
            "kitchener", "stratford"),
        route("regional-le", "LE", "Lakeshore East", "#ee2722", 1,
            "union", "danforth", "scarborough", "eglinton", "guildwood", "rouge-hill", "pickering",
            "ajax", "whitby", "durham-college-oshawa"),
        route("regional-lw", "LW", "Lakeshore West", "#8b0a31", 0,
            "union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson", "oakville",
            "bronte", "appleby", "burlington", "aldershot", "west-harbour", "hamilton",
            "confederation", "st-catharines", "niagara-falls"),
        route("regional-mi", "MI", "Milton", "#f47216", 0,
            "union", "kipling", "dixie", "cooksville", "erindale", "streetsville", "meadowvale",
            "lisgar", "milton"),
        route("regional-rh", "RH", "Richmond Hill", "#27adea", 1,
            "union", "oriole", "old-cummer", "langstaff", "richmond-hill", "gormley", "bloomington"),
        route("regional-st", "ST", "Stouffville", "#774111", 1,
            "union", "kennedy", "agincourt", "milliken", "unionville", "centennial", "markham",
            "mount-joy", "stouffville", "old-elm"),
        route("regional-up", "UP", "Union Pearson Express", "#4084cd", 1,
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

    // Reviewed against the official Metrolinx Stop/All bus-stop and terminal catalog.
    private static final Map<String, List<String>> STATION_BUS_STOP_CODES = Map.ofEntries(
        Map.entry("acton", List.of("00864", "00868")),
        Map.entry("ajax", List.of("00161")),
        Map.entry("aldershot", List.of("00180")),
        Map.entry("allandale-waterfront", List.of("08049")),
        Map.entry("appleby", List.of("00263")),
        Map.entry("aurora", List.of("00081")),
        Map.entry("barrie-south", List.of("00345")),
        Map.entry("bloomington", List.of("02767")),
        Map.entry("bradford", List.of("02160")),
        Map.entry("bramalea", List.of("02728", "08041", "08042", "08044", "00225")),
        Map.entry("brampton-innovation-district", List.of("01305", "02886")),
        Map.entry("bronte", List.of("00264")),
        Map.entry("burlington", List.of("00177")),
        Map.entry("centennial", List.of("00124", "00125")),
        Map.entry("clarkson", List.of("00181")),
        Map.entry("confederation", List.of("02730")),
        Map.entry("cooksville", List.of("02751", "02752")),
        Map.entry("durham-college-oshawa", List.of("00159")),
        Map.entry("east-gwillimbury", List.of("00276")),
        Map.entry("erindale", List.of("00189")),
        Map.entry("georgetown", List.of("02413")),
        Map.entry("gormley", List.of("02629")),
        Map.entry("guelph-central", List.of("02518", "02519")),
        Map.entry("hamilton", List.of("00141")),
        Map.entry("king-city", List.of("00027", "00030")),
        Map.entry("kipling", List.of("02778")),
        Map.entry("kitchener", List.of("02186")),
        Map.entry("langstaff", List.of("02856")),
        Map.entry("lisgar", List.of("00341")),
        Map.entry("malton", List.of("00228")),
        Map.entry("maple", List.of("02157")),
        Map.entry("markham", List.of("00122", "00123")),
        Map.entry("meadowvale", List.of("00129")),
        Map.entry("milton", List.of("00194")),
        Map.entry("mount-joy", List.of("00121")),
        Map.entry("mount-pleasant", List.of("00296")),
        Map.entry("newmarket", List.of("02634", "02637")),
        Map.entry("niagara-falls", List.of("02408")),
        Map.entry("oakville", List.of("00137")),
        Map.entry("old-elm", List.of("02830", "08045")),
        Map.entry("pickering", List.of("00147")),
        Map.entry("port-credit", List.of("02775")),
        Map.entry("richmond-hill", List.of("00062")),
        Map.entry("rutherford", List.of("00028")),
        Map.entry("st-catharines", List.of("02402", "08048")),
        Map.entry("stouffville", List.of("00117", "00118")),
        Map.entry("stratford", List.of("02822")),
        Map.entry("streetsville", List.of("00148", "01436")),
        Map.entry("union", List.of("02300")),
        Map.entry("unionville", List.of("00128", "02896")),
        Map.entry("west-harbour", List.of("02652")),
        Map.entry("whitby", List.of("00031"))
    );

    private static final Set<String> REGIONAL_NOT_WHEELCHAIR = Set.of("long-branch", "mimico", "oriole");
    private static final Set<String> REGIONAL_ELEVATOR = Set.of(
        "ajax", "aldershot", "appleby", "bloomington", "bloor", "bramalea",
        "brampton-innovation-district", "bronte", "burlington", "clarkson",
        "confederation", "cooksville", "danforth", "downsview-park",
        "durham-college-oshawa", "eglinton", "erindale", "exhibition",
        "guildwood", "hamilton", "kennedy", "kipling", "malton", "meadowvale",
        "mount-dennis", "mount-pleasant", "oakville", "pearson-airport", "pickering",
        "port-credit", "rouge-hill", "scarborough", "streetsville", "union",
        "west-harbour", "weston", "whitby"
    );
    private static final Set<String> REGIONAL_WASHROOM = Set.of(
        "agincourt", "ajax", "aldershot", "appleby", "aurora", "barrie-south",
        "bloomington", "bloor", "bramalea", "brampton-innovation-district", "bronte",
        "burlington", "clarkson", "cooksville", "danforth", "dixie",
        "durham-college-oshawa", "east-gwillimbury", "eglinton", "erindale",
        "etobicoke-north", "georgetown", "guildwood", "hamilton", "kennedy",
        "king-city", "kipling", "kitchener", "langstaff", "lisgar",
        "long-branch", "malton", "maple", "markham", "meadowvale", "milliken",
        "milton", "mimico", "mount-dennis", "mount-joy", "mount-pleasant",
        "niagara-falls", "oakville", "old-cummer", "pearson-airport", "pickering",
        "port-credit", "richmond-hill", "rouge-hill", "rutherford", "scarborough",
        "streetsville", "union", "unionville", "west-harbour", "weston", "whitby"
    );
    private static final Set<String> REGIONAL_PARKING = Set.of(
        "acton", "agincourt", "ajax", "aldershot", "allandale-waterfront",
        "appleby", "aurora", "barrie-south", "bloomington", "bradford",
        "bramalea", "brampton-innovation-district", "bronte", "burlington",
        "centennial", "clarkson", "confederation", "cooksville", "dixie",
        "durham-college-oshawa", "east-gwillimbury", "eglinton", "erindale",
        "etobicoke-north", "georgetown", "gormley", "guelph-central",
        "guildwood", "king-city", "langstaff", "lisgar", "long-branch",
        "malton", "maple", "markham", "meadowvale", "milliken", "milton",
        "mimico", "mount-joy", "mount-pleasant", "newmarket", "oakville",
        "old-cummer", "old-elm", "pearson-airport", "pickering", "port-credit",
        "richmond-hill", "rouge-hill", "rutherford", "scarborough", "stouffville",
        "streetsville", "unionville", "west-harbour", "weston", "whitby"
    );
    private static final Set<String> REGIONAL_BICYCLE_LOCKUP = Set.of(
        "acton", "agincourt", "ajax", "aldershot", "allandale-waterfront",
        "appleby", "aurora", "barrie-south", "bloomington", "bloor",
        "bradford", "bramalea", "brampton-innovation-district", "bronte",
        "burlington", "centennial", "clarkson", "confederation", "cooksville",
        "danforth", "dixie", "downsview-park", "durham-college-oshawa",
        "east-gwillimbury", "eglinton", "erindale", "etobicoke-north",
        "exhibition", "georgetown", "gormley", "guelph-central", "guildwood",
        "hamilton", "kennedy", "king-city", "kitchener", "langstaff", "lisgar",
        "long-branch", "malton", "maple", "markham", "meadowvale", "milliken",
        "milton", "mimico", "mount-dennis", "mount-joy", "mount-pleasant",
        "newmarket", "niagara-falls", "oakville", "old-cummer", "old-elm",
        "oriole", "pickering", "port-credit", "richmond-hill", "rouge-hill",
        "rutherford", "scarborough", "st-catharines", "stouffville",
        "streetsville", "union", "unionville", "west-harbour", "weston",
        "whitby"
    );
    private static final Set<String> REGIONAL_PPUDO = Set.of(
        "ajax", "aldershot", "allandale-waterfront", "appleby", "aurora",
        "barrie-south", "bloomington", "bloor", "bradford", "bramalea",
        "brampton-innovation-district", "bronte", "burlington", "centennial",
        "clarkson", "confederation", "cooksville", "dixie", "downsview-park",
        "durham-college-oshawa", "east-gwillimbury", "eglinton", "erindale",
        "etobicoke-north", "georgetown", "gormley", "guelph-central",
        "guildwood", "king-city", "langstaff", "lisgar", "long-branch",
        "malton", "maple", "markham", "meadowvale", "milliken", "milton",
        "mimico", "mount-dennis", "mount-joy", "mount-pleasant", "niagara-falls",
        "oakville", "old-cummer", "old-elm", "pearson-airport", "pickering",
        "port-credit", "richmond-hill", "rouge-hill", "rutherford", "scarborough",
        "stouffville", "streetsville", "union", "unionville", "west-harbour",
        "weston", "whitby"
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

    public static Optional<Boolean> isInboundDirection(String lineId, int directionId) {
        if (directionId != 0 && directionId != 1) return Optional.empty();
        return route(lineId).map(route -> directionId == route.inboundDirectionId());
    }

    public static Optional<String> directionDestination(String lineId, int directionId) {
        Route route = route(lineId).orElse(null);
        if (route == null || !"UP".equals(route.number()) || directionId < 0 || directionId > 1) {
            return Optional.empty();
        }
        String stationId = directionId == route.inboundDirectionId()
            ? "union"
            : route.stationIds().getLast();
        return station(stationId).map(destination -> "union".equals(stationId)
            ? "Union Station"
            : destination.name());
    }

    public static Optional<String> directionLabel(String lineId, int directionId) {
        Route route = route(lineId).orElse(null);
        Boolean inbound = isInboundDirection(lineId, directionId).orElse(null);
        if (route == null || inbound == null) return Optional.empty();
        String outward = switch (route.number()) {
            case "BR", "RH", "ST" -> "Northbound";
            case "LE" -> "Eastbound";
            case "KI", "LW", "MI", "UP" -> "Westbound";
            default -> null;
        };
        if (outward == null || !inbound) return Optional.ofNullable(outward);
        return Optional.of(switch (outward) {
            case "Northbound" -> "Southbound";
            case "Eastbound" -> "Westbound";
            case "Westbound" -> "Eastbound";
            default -> throw new IllegalStateException("Unsupported regional direction " + outward);
        });
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

    public static Optional<String> approachingFromStation(
        String lineId,
        String nextStationId,
        boolean inbound
    ) {
        Route route = route(lineId).orElse(null);
        if (route == null || !route.stationIds().contains(nextStationId)) return Optional.empty();

        Map<String, Integer> unionDistances = topologyDistancesFrom(lineId, "union");
        Integer nextDistance = unionDistances.get(nextStationId);
        if (nextDistance == null) return Optional.empty();

        List<String> candidates = SEGMENTS.stream()
            .filter(segment -> segment.lineId().equals(lineId))
            .map(segment -> segment.stationAId().equals(nextStationId)
                ? segment.stationBId()
                : segment.stationBId().equals(nextStationId) ? segment.stationAId() : null)
            .filter(java.util.Objects::nonNull)
            .filter(stationId -> {
                Integer distance = unionDistances.get(stationId);
                return distance != null && (inbound ? distance > nextDistance : distance < nextDistance);
            })
            .distinct()
            .toList();
        return candidates.size() == 1 ? Optional.of(candidates.getFirst()) : Optional.empty();
    }

    public static Optional<String> stationIdForStopCode(String stopCode) {
        if (stopCode == null) {
            return Optional.empty();
        }
        String normalized = stopCode.trim().toUpperCase(Locale.CANADA);
        String direct = STOP_CODE_TO_STATION_ID.get(normalized);
        if (direct != null) {
            return Optional.of(direct);
        }
        return STATION_BUS_STOP_CODES.entrySet().stream()
            .filter(entry -> entry.getValue().contains(normalized))
            .map(Map.Entry::getKey)
            .findFirst();
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

    public static List<String> busStopCodesForStationId(String stationId) {
        if (stationId == null) {
            return List.of();
        }
        String normalized = stationId.trim().toLowerCase(Locale.CANADA);
        List<String> busCodes = STATION_BUS_STOP_CODES.getOrDefault(normalized, List.of());
        Optional<String> primaryCode = stopCodeForStationId(normalized);
        if (primaryCode.isEmpty()) {
            return busCodes;
        }
        List<String> combined = new ArrayList<>(busCodes);
        if (!combined.contains(primaryCode.get())) {
            combined.add(primaryCode.get());
        }
        return List.copyOf(combined);
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

    private static Map<String, Integer> topologyDistancesFrom(String lineId, String originStationId) {
        Map<String, Integer> distances = new LinkedHashMap<>();
        ArrayDeque<String> pending = new ArrayDeque<>();
        distances.put(originStationId, 0);
        pending.add(originStationId);
        while (!pending.isEmpty()) {
            String stationId = pending.removeFirst();
            int distance = distances.get(stationId);
            for (Segment segment : SEGMENTS) {
                if (!segment.lineId().equals(lineId)) continue;
                String adjacentStationId = segment.stationAId().equals(stationId)
                    ? segment.stationBId()
                    : segment.stationBId().equals(stationId) ? segment.stationAId() : null;
                if (adjacentStationId == null || distances.containsKey(adjacentStationId)) continue;
                distances.put(adjacentStationId, distance + 1);
                pending.addLast(adjacentStationId);
            }
        }
        return distances;
    }

    private static Route route(
        String id,
        String number,
        String name,
        String color,
        int inboundDirectionId,
        String... stationIds
    ) {
        return new Route(id, number, name, color, inboundDirectionId, List.of(stationIds));
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
            String stationId = entry.getKey();
            boolean accessible = !REGIONAL_NOT_WHEELCHAIR.contains(stationId);
            boolean hasElevator = REGIONAL_ELEVATOR.contains(stationId);
            boolean hasWashroom = REGIONAL_WASHROOM.contains(stationId);
            boolean hasParking = REGIONAL_PARKING.contains(stationId);
            boolean hasBicycleLockup = REGIONAL_BICYCLE_LOCKUP.contains(stationId);
            boolean hasPpudo = REGIONAL_PPUDO.contains(stationId);
            stations.put(stationId, new StationResponses.StationSummaryResponse(
                stationId,
                stationName(stationId),
                0,
                0,
                entry.getValue().size() > 1,
                List.copyOf(entry.getValue()),
                false,
                "normal",
                new StationResponses.StationAccessOutageCountsResponse(0, 0),
                accessible,
                hasElevator,
                hasWashroom,
                hasParking,
                hasBicycleLockup,
                false,
                false,
                hasPpudo
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
