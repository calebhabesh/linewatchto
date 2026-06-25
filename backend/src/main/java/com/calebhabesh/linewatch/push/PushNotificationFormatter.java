package com.calebhabesh.linewatch.push;

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
    private static final Pattern LINE_PREFIX_PATTERN =
        Pattern.compile("(?i)^line\\s+\\d+\\s+[^:]+:\\s+(.+)$");
    private static final Pattern WORD_PATTERN =
        Pattern.compile("[A-Za-z0-9]+");

    public FormattedPushNotification formatActive(PushNotificationFacts facts) {
        String subject = notificationSubject(facts.lineId(), facts.lineNumber(), facts.eventType());
        String location = normalizeText(facts.location());
        String scopeLabel = scopeLabel(facts.commuteLabel(), facts.legId());
        List<String> bodyParts = new ArrayList<>();
        String sourceDescription = sourceDescription(facts.sourceDescription());

        if (!sourceDescription.isEmpty()) {
            bodyParts.add(sentence(sourceDescription));
        } else {
            bodyParts.add(location.isEmpty() ? "Service is affected on this line." : sentence(location));

            String direction = normalizeText(facts.displayDirection());
            if (!direction.isEmpty() && !containsIgnoreCase(location, direction)) {
                bodyParts.add(sentence(direction));
            }
            if (facts.shuttle()) {
                bodyParts.add("Shuttle buses are running.");
            }
            String cause = normalizeText(facts.cause());
            if (!cause.isEmpty()) {
                bodyParts.add("Cause: " + sentence(formatReason(cause)));
            }
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
            bodyParts.add(clockLine(facts.sourceEventAt()));
        }

        return new FormattedPushNotification(
            "⚠️ " + subject,
            String.join("\n", bodyParts),
            subject,
            location.isEmpty() ? null : location,
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
        String subject = normalizeText(notificationSubject);
        if (subject.isEmpty()) {
            subject = "TTC Service Alert";
        }
        String location = normalizeText(eventLocation);
        String normalizedScope = emptyToNull(normalizeText(scopeLabel));
        List<String> bodyParts = new ArrayList<>();
        bodyParts.add(clearanceSentence(location));
        if (normalizedScope != null) {
            bodyParts.add("No longer affects " + normalizedScope + ".");
        }
        bodyParts.add(clockLine(clearedAt));

        return new FormattedPushNotification(
            "✅ " + subject + " Cleared",
            String.join("\n", bodyParts),
            subject,
            location.isEmpty() ? null : location,
            normalizedScope,
            clearedAt
        );
    }

    private String notificationSubject(String lineId, String lineNumber, String eventType) {
        String identity = PushLineCatalog.identity(lineId, lineNumber);
        if ("TTC".equals(identity)) {
            return "TTC Service Alert";
        }
        return identity + " " + eventLabel(eventType);
    }

    private String eventLabel(String eventType) {
        return switch (normalizeText(eventType).toLowerCase(Locale.ROOT)) {
            case "suspension" -> "Suspension";
            case "delay" -> "Delay";
            case "reduced-speed-zone" -> "Reduced Speed Zone";
            case "planned-closure" -> "Planned Closure";
            default -> "Service Alert";
        };
    }

    private String scopeLabel(String commuteLabel, String legId) {
        String label = normalizeText(commuteLabel);
        if (label.isEmpty()) {
            return null;
        }
        String leg = "return".equalsIgnoreCase(normalizeText(legId)) ? "Return" : "Outbound";
        return label + " (" + leg + ")";
    }

    private String clearanceSentence(String location) {
        if (location.isEmpty()) {
            return "Service on this line has resumed.";
        }

        String withoutPunctuation = stripTerminalPunctuation(location);
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

    private String sentence(String value) {
        return stripTerminalPunctuation(value) + ".";
    }

    private String stripTerminalPunctuation(String value) {
        return value.replaceFirst("[.!?:;]+$", "").trim();
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
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

    private String sourceDescription(String value) {
        String description = stripLinePrefix(normalizeText(value));
        if (description.isEmpty() || wordCount(description) < 4) {
            return "";
        }
        return description;
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
