package com.calebhabesh.linewatch.regional;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class RegionalAlertTextDateParser {
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final String MONTH =
        "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
            + "sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
    private static final Pattern DATE_RANGE = Pattern.compile(
        "(?i)\\b" + MONTH + "\\.?\\s+(\\d{1,2})"
            + "(?:\\s*(?:-|–|—|to|and)\\s*(?:" + MONTH + "\\.?\\s+)?(\\d{1,2}))?"
            + "(?:,?\\s+(20\\d{2}))?\\b"
    );
    private static final Map<String, Integer> MONTHS = Map.ofEntries(
        Map.entry("jan", 1), Map.entry("january", 1),
        Map.entry("feb", 2), Map.entry("february", 2),
        Map.entry("mar", 3), Map.entry("march", 3),
        Map.entry("apr", 4), Map.entry("april", 4),
        Map.entry("may", 5), Map.entry("jun", 6), Map.entry("june", 6),
        Map.entry("jul", 7), Map.entry("july", 7),
        Map.entry("aug", 8), Map.entry("august", 8),
        Map.entry("sep", 9), Map.entry("sept", 9), Map.entry("september", 9),
        Map.entry("oct", 10), Map.entry("october", 10),
        Map.entry("nov", 11), Map.entry("november", 11),
        Map.entry("dec", 12), Map.entry("december", 12)
    );

    private RegionalAlertTextDateParser() {}

    static DateRange parse(String text, OffsetDateTime publishedAt, java.time.Clock clock) {
        List<DateRange> ranges = ranges(text, publishedAt);
        if (ranges.isEmpty()) return null;
        DateRange first = ranges.getFirst();
        return ranges.stream().allMatch(range -> !range.start().isBefore(first.start())
            && !range.endExclusive().isAfter(first.endExclusive())) ? first : null;
    }

    static List<DateRange> ranges(String text, OffsetDateTime publishedAt) {
        if (text == null || text.isBlank()) return List.of();
        LocalDate anchor = publishedAt == null ? null : publishedAt.atZoneSameInstant(TORONTO).toLocalDate();
        Matcher matcher = DATE_RANGE.matcher(text);
        List<DateRange> ranges = new ArrayList<>();
        while (matcher.find()) {
            LocalDateRange range = localRange(matcher, anchor);
            if (range != null) ranges.add(new DateRange(
                range.start().atStartOfDay(TORONTO).toOffsetDateTime(),
                range.endInclusive().plusDays(1).atStartOfDay(TORONTO).toOffsetDateTime(),
                matcher.start(), matcher.end()
            ));
        }
        return List.copyOf(ranges);
    }

    private static LocalDateRange localRange(Matcher matcher, LocalDate anchor) {
        try {
            int startMonth = month(matcher.group(1));
            int startDay = Integer.parseInt(matcher.group(2));
            int endMonth = matcher.group(3) == null ? startMonth : month(matcher.group(3));
            int endDay = matcher.group(4) == null ? startDay : Integer.parseInt(matcher.group(4));
            int explicitYear = matcher.group(5) == null ? 0 : Integer.parseInt(matcher.group(5));
            if (explicitYear == 0 && anchor == null) return null;
            int startYear = explicitYear == 0 ? anchor.getYear() : explicitYear;
            LocalDate start = LocalDate.of(startYear, startMonth, startDay);
            if (explicitYear == 0 && start.isBefore(anchor.minusDays(31))) {
                start = start.plusYears(1);
            }
            int endYear = endMonth < startMonth ? start.getYear() + 1 : start.getYear();
            LocalDate end = LocalDate.of(endYear, endMonth, endDay);
            if (end.isBefore(start)) return null;
            return new LocalDateRange(start, end);
        } catch (DateTimeException | NumberFormatException ignored) {
            return null;
        }
    }

    private static int month(String value) {
        Integer month = MONTHS.get(value.toLowerCase(Locale.CANADA));
        if (month == null) throw new DateTimeException("Unsupported month");
        return month;
    }

    record DateRange(OffsetDateTime start, OffsetDateTime endExclusive, int from, int to) {}

    private record LocalDateRange(LocalDate start, LocalDate endInclusive) {
    }
}
