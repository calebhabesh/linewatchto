package com.calebhabesh.linewatch.surface;

import java.util.ArrayList;
import java.util.List;

final class SurfaceRouteLabeler {
    private SurfaceRouteLabeler() {}

    static List<String> routeIdsFor(String route, String routeBranch, String... textValues) {
        List<String> routeIds = new ArrayList<>();
        if (route == null || route.isBlank()) {
            return routeIds;
        }

        List<String> routes = splitCsv(route);
        List<String> branches = splitCsv(routeBranch);
        if (branches.isEmpty() && routes.size() == 1) {
            String inferredBranch = inferredRouteBranch(routes.getFirst(), textValues);
            if (inferredBranch != null) {
                branches = List.of(inferredBranch);
            }
        }
        if (routes.size() == 1 && branches.size() > 1) {
            for (String branch : branches) {
                addUnique(routeIds, combineRouteAndBranch(routes.getFirst(), branch));
            }
            return routeIds;
        }

        for (int i = 0; i < routes.size(); i++) {
            String branch = i < branches.size() ? branches.get(i) : inferredRouteBranch(routes.get(i), textValues);
            addUnique(routeIds, combineRouteAndBranch(routes.get(i), branch));
        }
        return routeIds;
    }

    static List<String> preciseRouteIds(List<String> routeIds, String... textValues) {
        if (routeIds == null || routeIds.isEmpty()) {
            return routeIds == null ? List.of() : routeIds;
        }

        List<String> precise = new ArrayList<>();
        for (String routeId : routeIds) {
            addUnique(precise, combineRouteAndBranch(routeId, inferredRouteBranch(routeId, textValues)));
        }
        return precise;
    }

    private static String inferredRouteBranch(String route, String... textValues) {
        if (!"51".equals(route == null ? "" : route.trim())) {
            return null;
        }

        String text = normalizedText(textValues);
        if (text.contains("to leslie station via laird station") || text.contains("51a leslie")) {
            return "A";
        }
        return null;
    }

    private static List<String> splitCsv(String value) {
        List<String> values = new ArrayList<>();
        if (value == null || value.isBlank()) {
            return values;
        }
        for (String part : value.split("[,;/]")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                values.add(trimmed);
            }
        }
        return values;
    }

    private static String combineRouteAndBranch(String route, String branch) {
        String trimmedRoute = route == null ? "" : route.trim();
        String trimmedBranch = branch == null ? "" : branch.trim();
        if (trimmedBranch.isEmpty()) {
            return trimmedRoute;
        }
        if (trimmedBranch.equalsIgnoreCase(trimmedRoute)) {
            return trimmedRoute;
        }
        if (trimmedBranch.toLowerCase().startsWith(trimmedRoute.toLowerCase())) {
            return trimmedBranch;
        }
        if (trimmedBranch.matches("[A-Za-z]{1,3}")) {
            return trimmedRoute + trimmedBranch.toUpperCase();
        }
        return trimmedBranch;
    }

    private static void addUnique(List<String> values, String value) {
        if (value != null && !value.isBlank() && !values.contains(value)) {
            values.add(value);
        }
    }

    private static String normalizedText(String... values) {
        StringBuilder text = new StringBuilder();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                if (!text.isEmpty()) {
                    text.append(' ');
                }
                text.append(value);
            }
        }
        return text.toString()
            .toLowerCase()
            .replace('\u2013', '-')
            .replace('\u2014', '-')
            .replaceAll("\\s+", " ")
            .trim();
    }
}
