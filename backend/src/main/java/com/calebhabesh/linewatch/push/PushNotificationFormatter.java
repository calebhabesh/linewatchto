package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.regional.EnglishClockTextFormatter;
import com.calebhabesh.linewatch.station.StationDisplayNameFormatter;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class PushNotificationFormatter {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter EVENT_TIME_FORMATTER =
        DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.ENGLISH).withZone(TORONTO_ZONE);
    private static final Pattern BETWEEN_PATTERN =
        Pattern.compile("(?i)^between\\s+(.+?)\\s+and\\s+(.+)$");
    private static final Pattern TO_PATTERN =
        Pattern.compile("(?i)^(.+?)\\s+to\\s+(.+)$");
    private static final Pattern BIDIRECTIONAL_RANGE_PATTERN =
        Pattern.compile("^(.+?)\\s*(?:<->|↔)\\s*(.+)$");
    private static final Pattern LINE_PREFIX_PATTERN =
        Pattern.compile("(?i)^line\\s+\\d+\\s+[^:]+:\\s+(.+)$");
    private static final Pattern WORD_PATTERN =
        Pattern.compile("[A-Za-z0-9]+");
    private static final Pattern CLOCK_LINE_PATTERN =
        Pattern.compile("(?m)^🕗\\s+[^\\r\\n]+$");

    public FormattedPushNotification formatActive(PushNotificationFacts facts) {
        String subject = notificationSubject(facts.lineId(), facts.lineNumber(), facts.eventType());
        if (com.calebhabesh.linewatch.ingestion.TtcLimitedService.isAffirmative(facts.sourceTitle(), facts.sourceDescription())) {
            subject = PushLineCatalog.identity(facts.lineId(), facts.lineNumber())
                + ("planned-closure".equals(facts.eventType()) ? " Planned limited service" : " Limited service");
        }
        String location = normalizeDisplayText(facts.location());
        String displayDirection = normalizeText(facts.displayDirection());
        String scopeLabel = scopeLabel(facts.commuteLabel(), facts.legId());
        List<String> bodyParts = new ArrayList<>();
        String sourceDescription = normalizeDisplayText(firstSourceDescription(facts.sourceTitle(), facts.sourceDescription()));

        if (shouldPreferStructuredLocation(facts.eventType(), location)) {
            bodyParts.add(activeFallbackSentence(facts.eventType(), location, facts.displayDirection(), facts.cause()));
        } else if (!sourceDescription.isEmpty()) {
            bodyParts.add(sentence(sourceDescription));
        } else {
            bodyParts.add(activeFallbackSentence(facts.eventType(), location, facts.displayDirection(), facts.cause()));
        }
        if ("planned-closure".equals(facts.eventType())) {
            String closureDates = normalizeText(facts.closureDates());
            if (!closureDates.isEmpty()) {
                bodyParts.add("Advisory dates: " + stripTerminalPunctuation(closureDates) + ".");
            }
            String closureHours = normalizeText(facts.closureHours());
            if (!closureHours.isEmpty()) {
                bodyParts.add("Advisory hours: " + stripTerminalPunctuation(closureHours) + ".");
            }
        }
        if (facts.shuttle()) {
            bodyParts.add("Shuttle buses are running.");
        }
        if ("closure-24h".equals(facts.reminderBucket())) {
            bodyParts.add("Starts within 24 hours.");
        } else if ("closure-morning".equals(facts.reminderBucket())) {
            bodyParts.add("Starts today.");
        }
        if (scopeLabel != null) {
            bodyParts.add("Affects " + scopeLabel + ".");
        }
        if (facts.sourceEventAt() != null) {
            bodyParts.add("planned-closure".equals(facts.eventType())
                ? closureStartLine(facts.sourceEventAt())
                : clockLine(facts.sourceEventAt()));
        }

        return new FormattedPushNotification(
            "⚠️ " + subject,
            String.join("\n", bodyParts),
            subject,
            location.isEmpty() ? null : location,
            displayDirection.isEmpty() ? null : displayDirection,
            scopeLabel,
            facts.sourceEventAt()
        );
    }

    public FormattedPushNotification formatCleared(
        String notificationSubject,
        String eventLocation,
        String scopeLabel,
        Instant clearedAt
    ) {
        return formatCleared(notificationSubject, eventLocation, null, scopeLabel, clearedAt);
    }

    public FormattedPushNotification formatCleared(
        String notificationSubject,
        String eventLocation,
        String displayDirection,
        String scopeLabel,
        Instant clearedAt
    ) {
        String subject = normalizeText(notificationSubject);
        if (subject.isEmpty()) {
            subject = "TTC Service Alert";
        }
        String location = normalizeDisplayText(eventLocation);
        String direction = normalizeText(displayDirection);
        String normalizedScope = emptyToNull(normalizeText(scopeLabel));
        List<String> bodyParts = new ArrayList<>();
        bodyParts.add(clearanceSentence(location, direction));
        if (normalizedScope != null) {
            bodyParts.add("No longer affects " + normalizedScope + ".");
        }
        bodyParts.add(clockLine(clearedAt));

        return new FormattedPushNotification(
            "✅ " + subject + " Cleared",
            String.join("\n", bodyParts),
            subject,
            location.isEmpty() ? null : location,
            direction.isEmpty() ? null : direction,
            normalizedScope,
            clearedAt
        );
    }

    public FormattedPushNotification formatScheduledWindowEnded(
        String notificationSubject,
        String eventLocation,
        String displayDirection,
        String scopeLabel,
        Instant endedAt
    ) {
        String subject = normalizeText(notificationSubject);
        if (subject.isEmpty()) subject = "TTC Planned Advisory";
        String location = normalizeDisplayText(eventLocation);
        String direction = normalizeText(displayDirection);
        String normalizedScope = emptyToNull(normalizeText(scopeLabel));
        String window = subject.toLowerCase(Locale.ROOT).contains("limited service")
            ? "Scheduled limited-service window" : "Scheduled advisory window";
        List<String> bodyParts = new ArrayList<>();
        bodyParts.add(window + " ended" + (location.isEmpty() ? "." : " at " + location + "."));
        if (normalizedScope != null) bodyParts.add("No longer affects " + normalizedScope + ".");
        bodyParts.add(clockLine(endedAt));
        return new FormattedPushNotification(
            "🕗 " + subject + " Window Ended", String.join("\n", bodyParts), subject,
            location.isEmpty() ? null : location, direction.isEmpty() ? null : direction, normalizedScope, endedAt);
    }

    public FormattedPushNotification withSourceEventAt(
        FormattedPushNotification notification,
        Instant sourceEventAt
    ) {
        if (notification == null || sourceEventAt == null) {
            return notification;
        }

        String body = notification.body() == null ? "" : notification.body();
        String clockLine = clockLine(sourceEventAt);
        Matcher matcher = CLOCK_LINE_PATTERN.matcher(body);
        String updatedBody = matcher.find()
            ? matcher.replaceAll(Matcher.quoteReplacement(clockLine))
            : body.isBlank() ? clockLine : body + "\n" + clockLine;

        return new FormattedPushNotification(
            notification.title(),
            updatedBody,
            notification.notificationSubject(),
            notification.eventLocation(),
            notification.displayDirection(),
            notification.scopeLabel(),
            sourceEventAt
        );
    }

    private String notificationSubject(String lineId, String lineNumber, String eventType) {
        String identity = PushLineCatalog.identity(lineId, lineNumber);
        if ("TTC".equals(identity)) {
            return "TTC Service Alert";
        }
        return identity + " " + eventLabel(eventType);
    }

    private String closureStartLine(Instant sourceEventAt) {
        return "🕗 Advisory starts " + EVENT_TIME_FORMATTER.format(sourceEventAt);
    }

    private String eventLabel(String eventType) {
        return com.calebhabesh.linewatch.alert.AlertCategoryLabels.singular(eventType);
    }

    private String scopeLabel(String commuteLabel, String legId) {
        String label = normalizeText(commuteLabel);
        if (label.isEmpty()) {
            return null;
        }
        String leg = "return".equalsIgnoreCase(normalizeText(legId)) ? "Return" : "Outbound";
        return label + " (" + leg + ")";
    }

    private String clearanceSentence(String location, String displayDirection) {
        String direction = directionPhrase(displayDirection, location);
        if (direction.isEmpty()) {
            return clearanceSentence(location);
        }
        if (location.isEmpty()) {
            return "Service has resumed " + direction + " on this line.";
        }
        return "Service has resumed " + direction + " " + clearanceLocationPhrase(location) + ".";
    }

    private String clearanceSentence(String location) {
        if (location.isEmpty()) {
            return "Service on this line has resumed.";
        }

        String withoutPunctuation = stripTerminalPunctuation(location);
        List<String> sections = multipleSections(withoutPunctuation);
        if (sections.size() > 1) {
            return "Service across " + naturalJoin(sections) + " has resumed.";
        }
        Matcher bidirectionalRangeMatcher = BIDIRECTIONAL_RANGE_PATTERN.matcher(withoutPunctuation);
        if (bidirectionalRangeMatcher.matches()) {
            return "Service between "
                + bidirectionalRangeMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(
                    bidirectionalRangeMatcher.group(1),
                    bidirectionalRangeMatcher.group(2)
                )
                + " has resumed.";
        }

        Matcher betweenMatcher = BETWEEN_PATTERN.matcher(withoutPunctuation);
        if (betweenMatcher.matches()) {
            return "Service between "
                + betweenMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(betweenMatcher.group(1), betweenMatcher.group(2))
                + " has resumed.";
        }

        Matcher toMatcher = TO_PATTERN.matcher(withoutPunctuation);
        if (toMatcher.matches()) {
            return "Service between "
                + toMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(toMatcher.group(1), toMatcher.group(2))
                + " has resumed.";
        }

        return "Service affecting " + withoutPunctuation + " has resumed.";
    }

    private String clearanceLocationPhrase(String location) {
        String withoutPunctuation = stripTerminalPunctuation(location);
        Matcher bidirectionalRangeMatcher = BIDIRECTIONAL_RANGE_PATTERN.matcher(withoutPunctuation);
        if (bidirectionalRangeMatcher.matches()) {
            return "between "
                + bidirectionalRangeMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(
                    bidirectionalRangeMatcher.group(1),
                    bidirectionalRangeMatcher.group(2)
                );
        }

        Matcher betweenMatcher = BETWEEN_PATTERN.matcher(withoutPunctuation);
        if (betweenMatcher.matches()) {
            return "between "
                + betweenMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(betweenMatcher.group(1), betweenMatcher.group(2));
        }

        Matcher toMatcher = TO_PATTERN.matcher(withoutPunctuation);
        if (toMatcher.matches()) {
            return "between "
                + toMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(toMatcher.group(1), toMatcher.group(2));
        }

        if (withoutPunctuation.toLowerCase(Locale.ROOT).startsWith("at ")) {
            return withoutPunctuation;
        }
        return "at " + withoutPunctuation;
    }

    private String sentence(String value) {
        return stripTerminalPunctuation(value) + ".";
    }

    private String stripTerminalPunctuation(String value) {
        return value.replaceFirst("[.!?:;]+$", "").trim();
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    private String normalizeDisplayText(String value) {
        return StationDisplayNameFormatter.canonicalizeKnownStationAcronyms(normalizeText(value));
    }

    private String formatReason(String value) {
        if (value.isEmpty()) {
            return value;
        }
        String normalized = value.equals(value.toUpperCase(Locale.ROOT))
            ? value.toLowerCase(Locale.ROOT)
            : value;
        return normalized.substring(0, 1).toUpperCase(Locale.ROOT) + normalized.substring(1);
    }

    private String emptyToNull(String value) {
        return value.isEmpty() ? null : value;
    }

    private boolean containsIgnoreCase(String text, String expectedPart) {
        return text.toLowerCase(Locale.ROOT).contains(expectedPart.toLowerCase(Locale.ROOT));
    }

    private String clockLine(Instant instant) {
        return "🕗 " + EVENT_TIME_FORMATTER.format(instant);
    }

    private String activeFallbackSentence(
        String eventType,
        String location,
        String displayDirection,
        String cause
    ) {
        String normalizedLocation = normalizeText(location);
        if (normalizedLocation.isEmpty()) {
            return "Service is affected on this line.";
        }
        if (looksLikeSourceSentence(normalizedLocation)) {
            return sentence(normalizedLocation);
        }

        StringBuilder builder = new StringBuilder(activeEventPhrase(eventType));
        String direction = directionPhrase(displayDirection, normalizedLocation);
        if (!direction.isEmpty()) {
            builder.append(" ").append(direction);
        }
        builder.append(" ").append(activeLocationPhrase(normalizedLocation));

        String reason = reasonPhrase(cause);
        if (!reason.isEmpty()) {
            builder.append(" ").append(reason);
        }
        return sentence(builder.toString());
    }

    private String activeEventPhrase(String eventType) {
        return switch (normalizeText(eventType).toLowerCase(Locale.ROOT)) {
            case "suspension" -> "No service";
            case "delay" -> "Delays";
            case "trip-cancellation" -> "Train cancelled";
            case "reduced-speed-zone" -> "Reduced speeds";
            case "planned-closure" -> "Planned advisory";
            default -> "Service alert";
        };
    }

    private boolean looksLikeSourceSentence(String location) {
        String normalized = location.toLowerCase(Locale.ROOT);
        return normalized.startsWith("delay")
            || normalized.startsWith("delays")
            || normalized.startsWith("no service")
            || normalized.startsWith("service ")
            || normalized.startsWith("reduced speed")
            || normalized.startsWith("reduced speeds")
            || normalized.startsWith("planned closure")
            || normalized.startsWith("closure");
    }

    private String directionPhrase(String displayDirection, String location) {
        String direction = normalizeText(displayDirection);
        if (direction.isEmpty()
            || containsIgnoreCase(location, direction)
            || multipleSections(location).size() > 1) {
            return "";
        }
        String lowered = direction.toLowerCase(Locale.ROOT);
        if (lowered.contains("&")
            || lowered.contains("both")
            || (lowered.contains("eastbound") && lowered.contains("westbound"))
            || (lowered.contains("northbound") && lowered.contains("southbound"))) {
            return "in both directions";
        }
        return lowerFirst(direction);
    }

    private String activeLocationPhrase(String location) {
        String withoutPunctuation = stripTerminalPunctuation(location);
        List<String> sections = multipleSections(withoutPunctuation);
        if (sections.size() > 1) {
            return "across " + naturalJoin(sections);
        }
        Matcher bidirectionalRangeMatcher = BIDIRECTIONAL_RANGE_PATTERN.matcher(withoutPunctuation);
        if (bidirectionalRangeMatcher.matches()) {
            return "between "
                + bidirectionalRangeMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(
                    bidirectionalRangeMatcher.group(1),
                    bidirectionalRangeMatcher.group(2)
                );
        }

        Matcher betweenMatcher = BETWEEN_PATTERN.matcher(withoutPunctuation);
        if (betweenMatcher.matches()) {
            return "between "
                + betweenMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(betweenMatcher.group(1), betweenMatcher.group(2));
        }

        Matcher toMatcher = TO_PATTERN.matcher(withoutPunctuation);
        if (toMatcher.matches()) {
            return "between "
                + toMatcher.group(1).trim()
                + " and "
                + rangeEndWithStationLabel(toMatcher.group(1), toMatcher.group(2));
        }

        if (withoutPunctuation.toLowerCase(Locale.ROOT).startsWith("at ")) {
            return withoutPunctuation;
        }
        return "at " + withoutPunctuation;
    }

    private List<String> multipleSections(String location) {
        if (location == null || !location.contains(";")) {
            return List.of();
        }
        return java.util.Arrays.stream(location.split(";"))
            .map(this::normalizeDisplayText)
            .filter(section -> !section.isBlank())
            .distinct()
            .toList();
    }

    private String naturalJoin(List<String> values) {
        if (values.size() == 1) {
            return values.getFirst();
        }
        if (values.size() == 2) {
            return values.getFirst() + " and " + values.getLast();
        }
        return String.join(", ", values.subList(0, values.size() - 1))
            + ", and "
            + values.getLast();
    }

    private String reasonPhrase(String cause) {
        String reason = stripRouteModePrefix(stripTerminalPunctuation(normalizeText(cause)));
        if (reason.isEmpty()) {
            return "";
        }
        String lowered = reason.toLowerCase(Locale.ROOT);
        if (lowered.startsWith("due to ") || lowered.startsWith("because ") || lowered.startsWith("because of ")) {
            return lowerFirst(reason);
        }
        return "due to " + lowerFirst(reason);
    }

    private String stripRouteModePrefix(String value) {
        return value.replaceFirst("(?i)^(subway|lrt|bus|streetcar)\\s*[-:]\\s*", "").trim();
    }

    private String lowerFirst(String value) {
        if (value.isEmpty()) {
            return value;
        }
        return value.substring(0, 1).toLowerCase(Locale.ROOT) + value.substring(1);
    }

    private String sourceDescription(String value) {
        String description = EnglishClockTextFormatter.toTwelveHourClock(
            stripLinePrefix(normalizeText(value))
        );
        if (description.isEmpty() || wordCount(description) < 4) {
            return "";
        }
        return description;
    }

    private boolean shouldPreferStructuredLocation(String eventType, String location) {
        return "reduced-speed-zone".equalsIgnoreCase(normalizeText(eventType))
            && !location.isEmpty()
            && !"multiple affected sections".equalsIgnoreCase(location);
    }

    private String firstSourceDescription(String... values) {
        for (String value : values) {
            String description = sourceDescription(value);
            if (!description.isEmpty()) {
                return description;
            }
        }
        return "";
    }

    private String stripLinePrefix(String value) {
        Matcher matcher = LINE_PREFIX_PATTERN.matcher(value);
        return matcher.matches() ? matcher.group(1).trim() : value;
    }

    private int wordCount(String value) {
        Matcher matcher = WORD_PATTERN.matcher(value);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }

    private String rangeEndWithStationLabel(String start, String end) {
        String first = normalizeText(start);
        String second = normalizeText(end);
        if (containsIgnoreCase(first, "station") || containsIgnoreCase(second, "station")) {
            return second;
        }
        return second + " stations";
    }
}
