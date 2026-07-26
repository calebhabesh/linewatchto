package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.station.StationResponses;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

public final class RegionalNetworkCatalog {
    public static final String NETWORK_ID = "regional";

    public record Route(String id, String number, String name, String color, List<String> stationIds) {
    }

    private static final List<Route> ROUTES = List.of(
        route("regional-br", "BR", "Barrie", "#155ba0",
            "union", "downsview-park", "rutherford", "maple", "king-city", "aurora", "newmarket",
            "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront"),
        route("regional-ki", "KI", "Kitchener", "#138336",
            "union", "bloor", "weston", "mount-dennis", "etobicoke-north", "malton", "bramalea",
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
            "union", "bloor", "weston", "mount-dennis", "pearson-airport")
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

    private static final Map<String, StationResponses.StationSummaryResponse> STATIONS = buildStations();

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
