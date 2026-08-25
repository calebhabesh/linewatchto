package com.calebhabesh.linewatch.alert;

import com.calebhabesh.linewatch.alert.AlertHistoryResponses.AlertHistoryEventDto;
import com.calebhabesh.linewatch.alert.AlertHistoryResponses.AlertHistoryIncidentDto;
import com.calebhabesh.linewatch.alert.AlertHistoryResponses.AlertHistoryResponse;
import com.calebhabesh.linewatch.station.StationDisplayNameFormatter;
import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.ingestion.TtcSubwayClosureParser;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class AlertHistoryService {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final int MAX_LIMIT = 5_000;

    private final AlertHistoryRepository repository;
    private final Clock clock;

    public AlertHistoryService(AlertHistoryRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public AlertHistoryResponse history(String requestedPeriod, Integer requestedLimit) {
        return history("ttc", requestedPeriod, requestedLimit);
    }

    public AlertHistoryResponse history(String requestedNetwork, String requestedPeriod, Integer requestedLimit) {
        String network = normalizeNetwork(requestedNetwork);
        String period = normalizePeriod(requestedPeriod);
        OffsetDateTime until = OffsetDateTime.now(clock).atZoneSameInstant(TORONTO_ZONE).toOffsetDateTime();
        OffsetDateTime since = switch (period) {
            case "7d" -> until.minusDays(7);
            case "30d" -> until.minusDays(30);
            default -> until.toLocalDate().atStartOfDay(TORONTO_ZONE).toOffsetDateTime();
        };
        int limit = normalizeLimit(requestedLimit);
        List<AlertHistoryRepository.AlertHistoryRow> rows = "regional".equals(network)
            ? repository.findRegionalLifecycleRows(since, until, limit)
            : repository.findLifecycleRows(since, until, limit);
        return new AlertHistoryResponse(until, period, since, until, group(rows, network));
    }

    static String normalizeNetwork(String network) {
        return "regional".equalsIgnoreCase(network) ? "regional" : "ttc";
    }

    static String normalizePeriod(String period) {
        if ("7d".equalsIgnoreCase(period) || "week".equalsIgnoreCase(period)) {
            return "7d";
        }
        if ("30d".equalsIgnoreCase(period) || "month".equalsIgnoreCase(period)) {
            return "30d";
        }
        return "today";
    }

    static int normalizeLimit(Integer requestedLimit) {
        return Math.max(1, Math.min(requestedLimit == null ? MAX_LIMIT : requestedLimit, MAX_LIMIT));
    }

    private List<AlertHistoryIncidentDto> group(
        List<AlertHistoryRepository.AlertHistoryRow> rows,
        String network
    ) {
        Map<OccurrenceKey, List<AlertHistoryRepository.AlertHistoryRow>> byOccurrence = new LinkedHashMap<>();
        for (AlertHistoryRepository.AlertHistoryRow row : rows) {
            OccurrenceKey key = new OccurrenceKey(row.alertId(), row.occurrenceNumber());
            byOccurrence.computeIfAbsent(key, ignored -> new ArrayList<>()).add(row);
        }
        return byOccurrence.values().stream()
            .map(incidentRows -> incident(incidentRows, network))
            .toList();
    }

    private AlertHistoryIncidentDto incident(
        List<AlertHistoryRepository.AlertHistoryRow> rows,
        String network
    ) {
        AlertHistoryRepository.AlertHistoryRow latest = rows.getFirst();
        RegionalNetworkCatalog.Route regionalRoute = "regional".equals(network)
            ? RegionalNetworkCatalog.route(latest.lineId()).orElse(null)
            : null;
        OffsetDateTime firstSeenAt = rows.stream()
            .filter(row -> "opened".equals(row.lifecycleState()))
            .map(AlertHistoryRepository.AlertHistoryRow::snapshotTime)
            .min(OffsetDateTime::compareTo)
            .orElse(null);
        OffsetDateTime lastUpdatedAt = rows.stream()
            .filter(row -> "updated".equals(row.lifecycleState()))
            .map(AlertHistoryRepository.AlertHistoryRow::snapshotTime)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
        OffsetDateTime clearedAt = rows.stream()
            .filter(row -> "cleared".equals(row.lifecycleState()))
            .map(AlertHistoryRepository.AlertHistoryRow::snapshotTime)
            .max(OffsetDateTime::compareTo)
            .orElse(null);
        boolean cleared = "cleared".equals(latest.lifecycleState());
        Long durationMinutes = firstSeenAt != null && cleared && clearedAt != null
            ? Math.max(0, Duration.between(firstSeenAt, clearedAt).toMinutes())
            : null;

        List<AlertHistoryEventDto> events = rows.stream()
            .map(this::event)
            .toList();

        return new AlertHistoryIncidentDto(
            incidentId(latest.alertId(), rows),
            latest.alertId(),
            latest.sourceId(),
            latest.lineId(),
            regionalRoute == null ? latest.lineNumber() : regionalRoute.number(),
            regionalRoute == null ? latest.lineName() : regionalRoute.name(),
            eventType(latest),
            firstNonBlank(latest.title(), eventLabel(latest)),
            location(latest),
            displayDirection(latest.direction()),
            sourceLabel(latest.sourceAlertType()),
            cause(latest),
            cleared ? "cleared" : "active",
            latest.lifecycleState(),
            latest.snapshotTime(),
            firstSeenAt,
            lastUpdatedAt,
            clearedAt,
            durationMinutes,
            events
        );
    }

    private String incidentId(
        String alertId,
        List<AlertHistoryRepository.AlertHistoryRow> rows
    ) {
        long firstSnapshotId = rows.stream()
            .map(AlertHistoryRepository.AlertHistoryRow::id)
            .filter(java.util.Objects::nonNull)
            .min(Long::compareTo)
            .orElse(0L);
        return alertId + ":occurrence:" + firstSnapshotId;
    }

    private AlertHistoryEventDto event(AlertHistoryRepository.AlertHistoryRow row) {
        return new AlertHistoryEventDto(
            row.id(),
            row.lifecycleState(),
            eventStateLabel(row.lifecycleState()),
            row.snapshotTime(),
            firstNonBlank(row.title(), eventLabel(row)),
            row.description(),
            location(row),
            displayDirection(row.direction()),
            cause(row),
            sourceLabel(row.sourceAlertType())
        );
    }

    private String eventType(AlertHistoryRepository.AlertHistoryRow row) {
        return firstNonBlank(row.eventType(), row.impactKind(), "service-alert");
    }

    private String eventLabel(AlertHistoryRepository.AlertHistoryRow row) {
        String line = row.lineNumber() == null || row.lineNumber().isBlank()
            ? "TTC"
            : "Line " + row.lineNumber();
        return line + " " + canonicalEventTypeName(eventType(row));
    }

    private String canonicalEventTypeName(String eventType) {
        if (eventType == null) return "Alert";
        return switch (eventType.trim().toLowerCase(java.util.Locale.ROOT)) {
            case "suspension", "active-alert", "active_alert" -> "Active Alert";
            case "delay" -> "Delay";
            case "reduced-speed-zone", "reduced_speed_zone" -> "Reduced Speed Zone";
            case "planned-closure", "planned_closure" -> "Planned Closure";
            default -> titleCase(eventType.replace("-", " "));
        };
    }

    private String eventStateLabel(String state) {
        return switch (state == null ? "" : state) {
            case "opened" -> "Alert opened";
            case "updated" -> "Alert updated";
            case "cleared" -> "Service restored";
            default -> "Alert event";
        };
    }

    private String location(AlertHistoryRepository.AlertHistoryRow row) {
        String start = stationLabel(row.startStationId());
        String end = stationLabel(row.endStationId());
        if (start == null && end == null) {
            return "";
        }
        if (start == null) {
            return end;
        }
        if (end == null || start.equals(end)) {
            return start;
        }
        return start + " to " + end;
    }

    private String displayDirection(String direction) {
        return switch (normalize(direction)) {
            case "northbound" -> "Northbound";
            case "southbound" -> "Southbound";
            case "eastbound" -> "Eastbound";
            case "westbound" -> "Westbound";
            case "bidirectional" -> "Both Ways";
            default -> null;
        };
    }

    private String cause(AlertHistoryRepository.AlertHistoryRow row) {
        return firstNonBlank(titleCase(row.causeDescription()), titleCase(row.cause()));
    }

    private String sourceLabel(String sourceAlertType) {
        if (sourceAlertType != null && sourceAlertType.startsWith("metrolinx-")) {
            return "Metrolinx Open API";
        }
        if ("GTFS-RT".equalsIgnoreCase(sourceAlertType)) {
            return "TTC GTFS-RT";
        }
        if (TtcSubwayClosureParser.SOURCE_ALERT_TYPE.equalsIgnoreCase(sourceAlertType)) {
            return TtcSubwayClosureParser.SOURCE_ALERT_TYPE;
        }
        if ("Planned".equalsIgnoreCase(sourceAlertType)) {
            return "TTC Service Advisory";
        }
        return "TTC Live Alerts";
    }

    private String stationLabel(String stationId) {
        return StationDisplayNameFormatter.nullableFromStationId(stationId);
    }

    private String titleCase(String value) {
        String normalized = firstNonBlank(value);
        if (normalized == null) {
            return null;
        }
        StringBuilder result = new StringBuilder();
        for (String word : normalized.toLowerCase(Locale.ROOT).split("\\s+")) {
            if (word.isBlank()) {
                continue;
            }
            if (!result.isEmpty()) {
                result.append(' ');
            }
            result.append(word.substring(0, 1).toUpperCase(Locale.ROOT));
            if (word.length() > 1) {
                result.append(word.substring(1));
            }
        }
        return result.toString();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private record OccurrenceKey(String alertId, Long occurrenceNumber) {}
}
