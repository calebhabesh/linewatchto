package com.calebhabesh.linewatch.ingestion;

import java.net.URI;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

@Component
public class TtcSubwayClosureParser {
    public static final String SOURCE_ALERT_TYPE = "TTC.ca Subway Service Advisories";
    private static final int MAX_DISPLAY_PARAGRAPHS = 3;
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern(
        "MMMM d, uuuu",
        Locale.ENGLISH
    );
    private static final Pattern LINE = Pattern.compile("(?i)\\bLine\\s+([12456])\\b");
    private static final Pattern BOUNDS = Pattern.compile(
        "(?i)^\\s*(.+?)\\s+to\\s+(.+?)\\s+stations?\\b"
    );
    private static final Pattern BETWEEN_BOUNDS = Pattern.compile(
        "(?i)\\bbetween\\s+(.+?)\\s+and\\s+(.+?)\\s+stations?\\b"
    );
    private static final Pattern SINGLE_STATION = Pattern.compile(
        "(?i)\\bat\\s+(.+?)\\s+stations?\\b"
    );
    private static final Pattern EDITORIAL_UPDATE_PREFIX = Pattern.compile(
        "(?i)^\\s*updated?\\s*[-–—:]\\s*"
    );
    private static final Pattern CLOCK_TIME = Pattern.compile(
        "(?i)\\b(1[0-2]|0?[1-9])(?::([0-5][0-9]))?\\s*([ap])\\.?m\\.?\\b"
    );

    public TtcFetchedRecord parse(String sourceId, URI sourceUri, String html) {
        Document document = Jsoup.parse(html == null ? "" : html, sourceUri.toString());
        String routeName = text(document.selectFirst("h1 .field-routename"));
        String advisoryTitle = text(document.selectFirst("h1 .field-satitle"));
        if (advisoryTitle == null) {
            throw new TtcSubwayClosureParseException("TTC advisory page is missing its title");
        }

        Matcher lineMatcher = LINE.matcher(String.join(
            " ",
            routeName == null ? "" : routeName,
            advisoryTitle
        ));
        if (!lineMatcher.find()) {
            throw new TtcSubwayClosureParseException("TTC advisory page has an unsupported line");
        }
        RouteBounds bounds = routeBounds(advisoryTitle);

        LocalDate startDate = parseDate(text(document.selectFirst(
            ".sa-effective-date .field-starteffectivedate"
        )));
        LocalDate endDate = parseDate(text(document.selectFirst(
            ".sa-effective-date .field-endeffectivedate"
        )));
        if (endDate == null && startDate != null) {
            endDate = startDate;
        }
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new TtcSubwayClosureParseException("TTC advisory page has invalid effective dates");
        }

        ServiceDetails serviceDetails = serviceDetails(document);
        String description = serviceDetails.summary();
        String combinedText = advisoryTitle + " " + serviceDetails.fullText();
        AdvisoryClassification classification = classify(combinedText);
        List<TtcAlertChildPeriod> periods = startDate == null
            ? List.of()
            : periods(sourceId, startDate, endDate, combinedText);
        OffsetDateTime startsAt = periods.isEmpty() ? null : periods.getFirst().startTime();
        OffsetDateTime endsAt = periods.isEmpty() ? null : periods.getLast().endTime();
        // Keep the original prefix so already-ingested advisories retain their lifecycle identity.
        String stableId = "ttc-ca-closure-" + sourceId.toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
        String startStation = bounds.startStation();
        String endStation = bounds.endStation();
        boolean shuttle = combinedText.toLowerCase(Locale.ROOT).contains("shuttle buses");
        String displayRouteName = routeName == null ? "Line " + lineMatcher.group(1) : routeName;
        List<String> stationNames = java.util.stream.Stream.of(startStation, endStation)
            .filter(java.util.Objects::nonNull)
            .distinct()
            .toList();

        TtcAlertRecord record = new TtcAlertRecord(
            stableId,
            SOURCE_ALERT_TYPE,
            null,
            new TtcAlertActivePeriod(startsAt, endsAt),
            List.of(classification.planned() ? "Upcoming" : "Current"),
            lineMatcher.group(1),
            "",
            "Subway",
            startStation,
            endStation,
            stationNames,
            displayRouteName + " – " + advisoryTitle,
            description,
            displayRouteName + ": " + advisoryTitle,
            sourceUri.toString(),
            classification.effect(),
            classification.effectDescription(),
            "Both ways",
            classification.cause(),
            classification.causeDescription(),
            null,
            null,
            null,
            null,
            null,
            null,
            shuttle ? "Will Operate" : null,
            shuttle ? startStation : null,
            shuttle ? endStation : null,
            null,
            null,
            periods,
            null
        );
        return new TtcFetchedRecord(record, html == null ? "" : html);
    }

    private AdvisoryClassification classify(String text) {
        String normalized = text.toLowerCase(Locale.ROOT);
        boolean restoration = normalized.contains("service has resumed")
            || normalized.contains("service is restored")
            || normalized.contains("delays have cleared")
            || normalized.contains("service is operating normally");
        boolean reducedSpeed = normalized.contains("reduced speed zone")
            || normalized.contains("reduced speeds");
        boolean delay = normalized.contains("delay")
            || normalized.contains("slower than normal");
        boolean lateOpening = normalized.contains("late opening")
            || normalized.matches(
                "(?s).*\\b(?:subway|lrt|train)\\s+service\\b.{0,240}"
                    + "\\b(?:will\\s+)?start\\s+(?:at|by)\\b.*"
            );
        boolean closure = normalized.contains("no service")
            || normalized.contains("service is suspended")
            || normalized.contains("service will be suspended")
            || normalized.contains("closure")
            || lateOpening
            || normalized.contains("end early");
        boolean planned = closure && (normalized.contains("planned")
            || normalized.contains("nightly")
            || normalized.contains("scheduled")
            || lateOpening
            || normalized.contains("end early"));

        if (restoration) {
            return new AdvisoryClassification(false, "NO_EFFECT", "Service restored", null, null);
        }
        if (reducedSpeed) {
            return new AdvisoryClassification(false, "SIGNIFICANT_DELAYS", "Reduced Speed Zone", null, null);
        }
        if (TtcLimitedService.hasWording(text)) {
            return TtcLimitedService.isAffirmative(text)
                ? new AdvisoryClassification(true, "LIMITED_SERVICE", "Limited service", "MAINTENANCE", "Planned Track Work")
                : new AdvisoryClassification(false, null, null, null, null);
        }
        if (closure) {
            return new AdvisoryClassification(
                planned,
                "NO_SERVICE",
                "Subway closure",
                planned ? "MAINTENANCE" : null,
                planned ? "Closure - Planned Track Work" : null
            );
        }
        if (delay) {
            return new AdvisoryClassification(false, "SIGNIFICANT_DELAYS", "Delays", null, null);
        }
        return new AdvisoryClassification(false, null, null, null, null);
    }

    private RouteBounds routeBounds(String advisoryTitle) {
        String boundsTitle = EDITORIAL_UPDATE_PREFIX.matcher(advisoryTitle).replaceFirst("");
        Matcher toMatcher = BOUNDS.matcher(boundsTitle);
        if (toMatcher.find()) {
            return new RouteBounds(clean(toMatcher.group(1)), clean(toMatcher.group(2)));
        }
        Matcher betweenMatcher = BETWEEN_BOUNDS.matcher(boundsTitle);
        if (betweenMatcher.find()) {
            return new RouteBounds(
                clean(betweenMatcher.group(1)),
                clean(betweenMatcher.group(2))
            );
        }
        Matcher stationMatcher = SINGLE_STATION.matcher(boundsTitle);
        if (stationMatcher.find()) {
            String station = clean(stationMatcher.group(1));
            return new RouteBounds(station, station);
        }
        return new RouteBounds(null, null);
    }

    private List<TtcAlertChildPeriod> periods(
        String sourceId,
        LocalDate startDate,
        LocalDate endDate,
        String text
    ) {
        String normalized = text.toLowerCase(Locale.ROOT);
        LocalTime closureTime = timeAfter(text, "(?:starting|starts?|end(?:s|ed)? early)\\s+at");
        LocalTime resumeTime = timeAfter(text, "resume(?:s)?(?: each morning)?\\s+at");
        boolean nightly = normalized.contains("nightly") || normalized.contains("each morning");
        if (nightly && closureTime != null && resumeTime != null) {
            List<TtcAlertChildPeriod> periods = new ArrayList<>();
            int index = 0;
            for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
                OffsetDateTime start = at(date, closureTime);
                LocalDate endDay = resumeTime.isAfter(closureTime) ? date : date.plusDays(1);
                periods.add(new TtcAlertChildPeriod(
                    sourceId + "-window-" + index++,
                    start,
                    at(endDay, resumeTime)
                ));
            }
            return List.copyOf(periods);
        }

        LocalTime lateOpening = timeAfter(
            text,
            "late openings?(?:\\s+at)?|(?:service|trains?)\\s+"
                + "(?:(?:will\\s+)?start|starts?)\\s+(?:at|by)"
        );
        if (lateOpening != null) {
            List<TtcAlertChildPeriod> periods = new ArrayList<>();
            int index = 0;
            for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
                periods.add(new TtcAlertChildPeriod(
                    sourceId + "-window-" + index++,
                    at(date, defaultServiceStart(date)),
                    at(date, lateOpening)
                ));
            }
            return List.copyOf(periods);
        }

        return List.of(new TtcAlertChildPeriod(
            sourceId + "-window-0",
            at(startDate, LocalTime.MIDNIGHT),
            at(endDate.plusDays(1), LocalTime.MIDNIGHT)
        ));
    }

    private LocalTime defaultServiceStart(LocalDate serviceDate) {
        // Normalization replaces this conservative system-wide value with the
        // affected stations' first GTFS departure whenever schedule data exists.
        boolean sunday = serviceDate.getDayOfWeek() == java.time.DayOfWeek.SUNDAY;
        return sunday ? LocalTime.of(8, 0) : LocalTime.of(6, 0);
    }

    private LocalTime timeAfter(String text, String prefixPattern) {
        Matcher matcher = Pattern.compile(
            "(?i)(?:" + prefixPattern + ")\\s+(?:approximately\\s+)?"
                + CLOCK_TIME.pattern()
        ).matcher(text);
        if (!matcher.find()) {
            return null;
        }
        int hour = Integer.parseInt(matcher.group(1));
        int minute = matcher.group(2) == null ? 0 : Integer.parseInt(matcher.group(2));
        boolean afternoon = matcher.group(3).equalsIgnoreCase("p");
        hour = hour % 12 + (afternoon ? 12 : 0);
        return LocalTime.of(hour, minute);
    }

    private OffsetDateTime at(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(TORONTO).toOffsetDateTime();
    }

    private LocalDate parseDate(String value) {
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value, DATE_FORMAT);
        } catch (DateTimeParseException exception) {
            throw new TtcSubwayClosureParseException("Unable to parse TTC closure effective date", exception);
        }
    }

    private ServiceDetails serviceDetails(Document document) {
        for (Element body : document.select(".component.content .u-type--body")) {
            List<String> paragraphs = body.select("p").stream()
                .map(Element::text)
                .map(this::clean)
                .filter(java.util.Objects::nonNull)
                .toList();
            String fullText = paragraphs.isEmpty()
                ? clean(body.text())
                : String.join(" ", paragraphs);
            if (fullText != null && (fullText.toLowerCase(Locale.ROOT).contains("subway service")
                || fullText.toLowerCase(Locale.ROOT).contains("lrt service"))) {
                String summary = paragraphs.isEmpty()
                    ? fullText
                    : String.join(
                        " ",
                        paragraphs.subList(0, Math.min(MAX_DISPLAY_PARAGRAPHS, paragraphs.size()))
                    );
                return new ServiceDetails(summary, fullText);
            }
        }
        for (Element body : document.select(".component.content .u-type--body")) {
            String fullText = clean(body.text());
            if (fullText != null) {
                return new ServiceDetails(fullText, fullText);
            }
        }
        throw new TtcSubwayClosureParseException("TTC advisory page is missing service details");
    }

    private String text(Element element) {
        return element == null ? null : clean(element.text());
    }

    private String clean(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.replace('\u00a0', ' ').replaceAll("\\s+", " ").trim();
    }

    private record ServiceDetails(String summary, String fullText) {}

    private record RouteBounds(String startStation, String endStation) {}

    private record AdvisoryClassification(
        boolean planned,
        String effect,
        String effectDescription,
        String cause,
        String causeDescription
    ) {}

    public static class TtcSubwayClosureParseException extends RuntimeException {
        public TtcSubwayClosureParseException(String message) {
            super(message);
        }

        public TtcSubwayClosureParseException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
