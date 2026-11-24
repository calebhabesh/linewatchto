package com.calebhabesh.linewatch.reliability;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * A range API request's validated parameters: {@code network}, inclusive Toronto service dates
 * {@code from}..{@code to}, and optional {@code line} and {@code station} ids. Validation here
 * needs no database, so it runs before the cache; whether the line or station belongs to the
 * network is checked when the range is computed.
 */
public record ReliabilityRangeRequest(
    String networkId,
    LocalDate from,
    LocalDate to,
    String lineId,
    String stationId
) {
    static final int MAX_ID_LENGTH = 80;
    private static final Pattern ID_PATTERN = Pattern.compile("[a-z0-9][a-z0-9_-]*");
    private static final DateTimeFormatter STRICT_DATE =
        DateTimeFormatter.ofPattern("uuuu-MM-dd").withResolverStyle(ResolverStyle.STRICT);

    static ReliabilityRangeRequest parse(
        String network,
        String from,
        String to,
        String line,
        String station,
        LocalDate today
    ) {
        String networkId = parseNetwork(network);
        LocalDate fromDate = parseDate("from", from);
        LocalDate toDate = parseDate("to", to);
        if (fromDate.isAfter(toDate)) {
            throw ReliabilityRangeException.badRequest("invalid_range", "from must not be after to.");
        }
        if (toDate.isAfter(today)) {
            throw ReliabilityRangeException.badRequest(
                "invalid_range", "to must not be after today (" + today + ", Toronto).");
        }
        return new ReliabilityRangeRequest(
            networkId, fromDate, toDate, parseId("line", line), parseId("station", station));
    }

    /** {@code ttc} when absent; anything other than {@code ttc} or {@code regional} is refused. */
    static String parseNetwork(String network) {
        if (network == null || network.isBlank()) return "ttc";
        String normalized = network.trim().toLowerCase(Locale.ROOT);
        if (!"ttc".equals(normalized) && !"regional".equals(normalized)) {
            throw ReliabilityRangeException.badRequest("invalid_network", "network must be ttc or regional.");
        }
        return normalized;
    }

    static LocalDate parseDate(String name, String value) {
        if (value == null || value.isBlank()) {
            throw ReliabilityRangeException.badRequest("invalid_date", name + " is required as YYYY-MM-DD.");
        }
        String trimmed = value.trim();
        if (trimmed.length() != 10) {
            throw ReliabilityRangeException.badRequest("invalid_date", name + " must be a date as YYYY-MM-DD.");
        }
        try {
            return LocalDate.parse(trimmed, STRICT_DATE);
        } catch (DateTimeParseException exception) {
            throw ReliabilityRangeException.badRequest("invalid_date", name + " must be a date as YYYY-MM-DD.");
        }
    }

    static String parseId(String name, String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > MAX_ID_LENGTH || !ID_PATTERN.matcher(normalized).matches()) {
            throw ReliabilityRangeException.badRequest("invalid_" + name, "Unknown " + name + ".");
        }
        return normalized;
    }

    static int parseInt(String name, String value, int defaultValue, int min, int max) {
        if (value == null || value.isBlank()) return defaultValue;
        try {
            int parsed = Integer.parseInt(value.trim());
            if (parsed < min || parsed > max) throw new NumberFormatException();
            return parsed;
        } catch (NumberFormatException exception) {
            throw ReliabilityRangeException.badRequest(
                "invalid_" + name, name + " must be a whole number from " + min + " to " + max + ".");
        }
    }

    /** Cache-key form: {@code {network}:{from}:{to}:{line}:{station}}, with "-" for absent ids. */
    String keyPart() {
        return networkId + ":" + from + ":" + to + ":"
            + (lineId == null ? "-" : lineId) + ":" + (stationId == null ? "-" : stationId);
    }
}
