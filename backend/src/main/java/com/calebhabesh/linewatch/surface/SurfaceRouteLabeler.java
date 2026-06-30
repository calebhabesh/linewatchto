package com.calebhabesh.linewatch.surface;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class SurfaceRouteLabeler {
    private SurfaceRouteLabeler() {}

    static List<String> routeIdsFor(String route, String routeBranch, String... textValues) {
        List<String> routeIds = new ArrayList<>();
        if (route == null || route.isBlank()) {
            return routeIds;
        }

        List<String> routes = splitCsv(route);
        List<String> branches = splitCsv(routeBranch);
        if (routes.size() == 1) {
            if (branches.isEmpty()) {
                branches = inferredRouteBranches(routes.getFirst(), textValues);
            }
            for (String branch : branches) {
                addUnique(routeIds, combineRouteAndBranch(routes.getFirst(), branch));
            }
            if (routeIds.isEmpty()) {
                addUnique(routeIds, routes.getFirst());
            }
            return routeIds;
        }

        for (int i = 0; i < routes.size(); i++) {
            if (i < branches.size()) {
                addUnique(routeIds, combineRouteAndBranch(routes.get(i), branches.get(i)));
                continue;
            }

            List<String> inferredBranches = inferredRouteBranches(routes.get(i), textValues);
            if (inferredBranches.isEmpty()) {
                addUnique(routeIds, routes.get(i));
            } else {
                for (String branch : inferredBranches) {
                    addUnique(routeIds, combineRouteAndBranch(routes.get(i), branch));
                }
            }
        }
        return routeIds;
    }

    static List<String> preciseRouteIds(List<String> routeIds, String... textValues) {
        if (routeIds == null || routeIds.isEmpty()) {
            return routeIds == null ? List.of() : routeIds;
        }

        List<String> precise = new ArrayList<>();
        for (String routeId : routeIds) {
            List<String> inferredBranches = inferredRouteBranches(routeId, textValues);
            if (inferredBranches.isEmpty()) {
                addUnique(precise, routeId);
            } else {
                for (String branch : inferredBranches) {
                    addUnique(precise, combineRouteAndBranch(routeId, branch));
                }
            }
        }
        return precise;
    }

    private static List<String> inferredRouteBranches(String route, String... textValues) {
        String trimmedRoute = route == null ? "" : route.trim();
        if (trimmedRoute.isEmpty()) {
            return List.of();
        }

        Set<String> branches = new LinkedHashSet<>();
        String text = normalizedText(textValues);
        Matcher matcher = Pattern.compile(
            "(?<![a-z0-9])" + Pattern.quote(trimmedRoute.toLowerCase()) + "([a-z]{1,3})(?![a-z0-9])"
        ).matcher(text);
        while (matcher.find()) {
            branches.add(matcher.group(1).toUpperCase());
        }

        if (branches.isEmpty()
            && "51".equals(trimmedRoute)
            && text.contains("to leslie station via laird station")) {
            branches.add("A");
        }
        return List.copyOf(branches);
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
