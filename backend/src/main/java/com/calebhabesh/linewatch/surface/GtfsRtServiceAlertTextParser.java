package com.calebhabesh.linewatch.surface;

import com.calebhabesh.linewatch.ingestion.TtcAlertActivePeriod;
import com.calebhabesh.linewatch.ingestion.TtcAlertRecord;
import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class GtfsRtServiceAlertTextParser {
    private static final Pattern HEADER_TIMESTAMP = Pattern.compile("\\btimestamp:\\s*(\\d+)");
    private static final Pattern QUOTED_ID = Pattern.compile("\\bid:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern ACTIVE_PERIOD = Pattern.compile("active_period\\s*\\{([^{}]*)}");
    private static final Pattern START = Pattern.compile("\\bstart:\\s*(\\d+)");
    private static final Pattern END = Pattern.compile("\\bend:\\s*(\\d+)");
    private static final Pattern ROUTE_ID = Pattern.compile("\\broute_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern STOP_ID = Pattern.compile("\\bstop_id:\\s*\"((?:\\\\.|[^\"])*)\"");
    private static final Pattern EFFECT = Pattern.compile("\\beffect:\\s*([A-Z_]+)");
    private static final Pattern CAUSE = Pattern.compile("\\bcause:\\s*([A-Z_]+)");

    public List<TtcFetchedRecord> parse(String body) {
        if (body == null || body.isBlank()) {
            return List.of();
        }

        OffsetDateTime feedUpdatedAt = epoch(findLong(HEADER_TIMESTAMP, body));
        List<TtcFetchedRecord> records = new ArrayList<>();
        for (String entity : blocks(body, "entity")) {
            String alert = firstBlock(entity, "alert");
            if (alert == null) {
                continue;
            }

            String sourceId = firstQuoted(QUOTED_ID, entity);
            if (sourceId == null || sourceId.isBlank()) {
                continue;
            }

            Set<String> routeIds = quotedSet(ROUTE_ID, alert);
            if (routeIds.isEmpty()) {
                continue;
            }

            OffsetDateTime start = null;
            OffsetDateTime end = null;
            String period = firstRegex(ACTIVE_PERIOD, alert);
            if (period != null) {
                start = epoch(findLong(START, period));
                end = epoch(findLong(END, period));
            }

            String effect = firstToken(EFFECT, alert);
            String cause = firstToken(CAUSE, alert);
            String headerText = translatedText(alert, "header_text");
            String descriptionText = translatedText(alert, "description_text");
            String url = translatedText(alert, "url");
            List<String> stopIds = new ArrayList<>(quotedSet(STOP_ID, alert));
            String joinedRouteIds = String.join(",", routeIds);
            OffsetDateTime updatedAt = feedUpdatedAt != null ? feedUpdatedAt : start;

            TtcAlertRecord record = new TtcAlertRecord(
                "gtfsrt-" + sourceId,
                "GTFS-RT",
                updatedAt,
                start == null && end == null ? null : new TtcAlertActivePeriod(start, end),
                List.of("Current"),
                joinedRouteIds,
                inferredRouteType(routeIds),
                null,
                null,
                stopIds,
                blankToNull(headerText),
                nullToEmpty(descriptionText),
                blankToNull(headerText),
                blankToNull(url),
                blankToNull(effect),
                effectLabel(effect),
                null,
                blankToNull(cause),
                causeLabel(cause),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                List.of()
            );
            records.add(new TtcFetchedRecord(record, entity.trim()));
        }

        return List.copyOf(records);
    }

    private List<String> blocks(String text, String name) {
        List<String> result = new ArrayList<>();
        String marker = name + " {";
        int searchAt = 0;
        while (searchAt < text.length()) {
            int start = text.indexOf(marker, searchAt);
            if (start < 0) {
                break;
            }
            int openBrace = start + name.length() + 1;
            int end = matchingBrace(text, openBrace);
            if (end < 0) {
                break;
            }
            result.add(text.substring(start, end + 1));
            searchAt = end + 1;
        }
        return result;
    }

    private String firstBlock(String text, String name) {
        List<String> found = blocks(text, name);
        return found.isEmpty() ? null : found.getFirst();
    }

    private int matchingBrace(String text, int openBrace) {
        int depth = 0;
        for (int i = openBrace; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '{') {
                depth++;
            } else if (ch == '}') {
                depth--;
                if (depth == 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    private Set<String> quotedSet(Pattern pattern, String text) {
        Set<String> values = new LinkedHashSet<>();
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String value = unescape(matcher.group(1)).trim();
            if (!value.isBlank()) {
                values.add(value);
            }
        }
        return values;
    }

    private String firstQuoted(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? unescape(matcher.group(1)) : null;
    }

    private String firstToken(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String firstRegex(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private Long findLong(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        if (!matcher.find()) {
            return null;
        }
        return Long.parseLong(matcher.group(1));
    }

    private OffsetDateTime epoch(Long epochSeconds) {
        return epochSeconds == null
            ? null
            : OffsetDateTime.ofInstant(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC);
    }

    private String translatedText(String text, String fieldName) {
        String block = firstBlock(text, fieldName);
        if (block == null) {
            return null;
        }
        Matcher matcher = Pattern.compile("\\btext:\\s*\"((?:\\\\.|[^\"])*)\"").matcher(block);
        return matcher.find() ? unescape(matcher.group(1)) : null;
    }

    private String inferredRouteType(Set<String> routeIds) {
        boolean hasStreetcar = false;
        boolean hasBus = false;
        for (String routeId : routeIds) {
            if (isStreetcarRoute(routeId)) {
                hasStreetcar = true;
            } else {
                hasBus = true;
            }
        }
        if (hasStreetcar && !hasBus) {
            return "Streetcar";
        }
        if (hasBus && !hasStreetcar) {
            return "Bus";
        }
        return "Surface";
    }

    private boolean isStreetcarRoute(String routeId) {
        int routeNumber = routeNumber(routeId);
        return (routeNumber >= 501 && routeNumber <= 512)
            || routeNumber == 301
            || routeNumber == 304
            || routeNumber == 306
            || routeNumber == 310;
    }

    private int routeNumber(String routeId) {
        if (routeId == null) {
            return -1;
        }
        String digits = routeId.replaceFirst("^(\\d+).*$", "$1");
        if (!digits.matches("\\d+")) {
            return -1;
        }
        return Integer.parseInt(digits);
    }

    private String effectLabel(String effect) {
        if (effect == null) {
            return null;
        }
        return switch (effect) {
            case "MODIFIED_SERVICE" -> "Modified Service";
            case "NO_SERVICE" -> "No Service";
            case "SIGNIFICANT_DELAYS" -> "Significant Delays";
            case "REDUCED_SERVICE" -> "Reduced Service";
            default -> titleCase(effect);
        };
    }

    private String causeLabel(String cause) {
        return cause == null ? null : titleCase(cause);
    }

    private String titleCase(String value) {
        String[] words = value.toLowerCase().replace('_', ' ').split("\\s+");
        StringBuilder label = new StringBuilder();
        for (String word : words) {
            if (word.isBlank()) {
                continue;
            }
            if (!label.isEmpty()) {
                label.append(' ');
            }
            label.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return label.toString();
    }

    private String unescape(String value) {
        return value
            .replace("\\n", "\n")
            .replace("\\\"", "\"")
            .replace("\\\\", "\\");
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
