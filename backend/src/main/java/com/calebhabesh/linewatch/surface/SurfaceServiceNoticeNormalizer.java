package com.calebhabesh.linewatch.surface;

import com.calebhabesh.linewatch.ingestion.TtcAlertRecord;
import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Component
public class SurfaceServiceNoticeNormalizer {

    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    // Bounded by surface_service_notice_routes.route_id and surface_service_notice_stops.stop_id.
    // A longer token is not a TTC route or stop, so it is left off rather than failing the notice.
    static final int MAX_ROUTE_ID_LENGTH = 32;
    static final int MAX_STOP_ID_LENGTH = 80;

    public Optional<SurfaceServiceNotice> normalize(TtcFetchedRecord fetched) {
        if (fetched == null || fetched.record() == null) {
            return Optional.empty();
        }

        TtcAlertRecord record = fetched.record();
        String routeType = record.routeType();
        if (routeType == null) {
            return Optional.empty();
        }

        String lowerType = routeType.toLowerCase();
        // Exclude rapid transit and accessibility records.
        if (lowerType.contains("subway")
            || lowerType.contains("lrt")
            || lowerType.contains("rapid transit")
            || lowerType.contains("elevator")
            || lowerType.contains("escalator")) {
            return Optional.empty();
        }

        // Ignore NO_EFFECT marketing notices unless they have a URL and route IDs
        String effect = record.effect();
        if (effect != null && effect.equalsIgnoreCase("NO_EFFECT")) {
            boolean hasUrl = record.url() != null && !record.url().isBlank();
            boolean hasRoute = record.route() != null && !record.route().isBlank();
            if (!(hasUrl && hasRoute)) {
                return Optional.empty();
            }
        }

        // Category rules
        String category = "notice";
        String effectDesc = record.effectDesc() != null ? record.effectDesc() : "";
        String title = record.title() != null ? record.title() : "";
        String headerText = record.headerText() != null ? record.headerText() : "";
        String description = record.description() != null ? record.description() : "";
        String effectStr = record.effect() != null ? record.effect() : "";

        boolean isBypass = effectDesc.equalsIgnoreCase("Bypass")
            || headerText.toLowerCase().contains("not stopping")
            || title.toLowerCase().contains("not stopping");

        if (isBypass) {
            category = "bypass";
        } else if (effectStr.equalsIgnoreCase("MODIFIED_SERVICE")
            || effectDesc.toLowerCase().contains("modified")) {
            category = "service-change";
        } else if (effectStr.toLowerCase().contains("detour")
            || effectStr.toLowerCase().contains("divert")
            || effectStr.toLowerCase().contains("diverting")
            || title.toLowerCase().contains("detour")
            || title.toLowerCase().contains("divert")
            || title.toLowerCase().contains("diverting")
            || description.toLowerCase().contains("detour")
            || description.toLowerCase().contains("divert")
            || description.toLowerCase().contains("diverting")
            || headerText.toLowerCase().contains("detour")
            || headerText.toLowerCase().contains("divert")
            || headerText.toLowerCase().contains("diverting")) {
            category = "detour";
        } else if (effectStr.equalsIgnoreCase("NO_SERVICE")) {
            category = "no-service";
        }

        // Route IDs
        List<String> routeIds = routeIdsFor(record).stream()
            .filter(routeId -> routeId != null && !routeId.isBlank() && routeId.length() <= MAX_ROUTE_ID_LENGTH)
            .distinct()
            .toList();

        // Stop details
        List<SurfaceServiceNotice.StopDetail> stops = new ArrayList<>();
        List<String> stopIdList = record.stopIDList();
        if (stopIdList != null) {
            for (int i = 0; i < stopIdList.size(); i++) {
                String s = stopIdList.get(i);
                String trimmed = s == null ? "" : s.trim();
                if (!trimmed.isEmpty() && trimmed.length() <= MAX_STOP_ID_LENGTH) {
                    if (trimmed.matches("\\d+")) {
                        stops.add(new SurfaceServiceNotice.StopDetail(trimmed, stopNameForIndex(record, i, trimmed)));
                    } else {
                        stops.add(new SurfaceServiceNotice.StopDetail(trimmed, trimmed));
                    }
                }
            }
        }
        if (stops.isEmpty()) {
            if (record.stopStart() != null && !record.stopStart().isBlank()
                && record.stopStart().length() <= MAX_STOP_ID_LENGTH) {
                stops.add(new SurfaceServiceNotice.StopDetail(record.stopStart(), record.stopStart()));
            }
            if (record.stopEnd() != null && !record.stopEnd().isBlank()
                && record.stopEnd().length() <= MAX_STOP_ID_LENGTH) {
                stops.add(new SurfaceServiceNotice.StopDetail(record.stopEnd(), record.stopEnd()));
            }
        }

        OffsetDateTime start = sourceTimeToInstant(record, record.activePeriod() != null ? record.activePeriod().start() : null);
        OffsetDateTime end = sourceTimeToInstant(record, record.activePeriod() != null ? record.activePeriod().end() : null);
        OffsetDateTime sourceUpdated = sourceTimeToInstant(record, record.lastUpdated());

        String noticeTitle = firstNonBlank(record.title(), record.headerText(), record.description());
        if (noticeTitle == null) {
            // surface_service_notices.title is NOT NULL; one untitled record must not fail the whole TTC refresh.
            return Optional.empty();
        }

        String id = "ttc-surface-" + record.id();

        return Optional.of(new SurfaceServiceNotice(
            id,
            record.id(),
            category,
            record.routeType(),
            noticeTitle,
            record.description() != null ? record.description() : "",
            record.headerText() != null ? record.headerText() : "",
            record.url() != null ? record.url() : "",
            record.effect(),
            record.effectDesc(),
            record.direction(),
            record.cause(),
            record.causeDescription(),
            start,
            end,
            sourceUpdated,
            true,
            fetched.rawPayload(),
            routeIds,
            stops,
            isServiceAlert(record.alertType())
                ? SurfaceServiceNotice.SERVICE_ALERT
                : SurfaceServiceNotice.SERVICE_ADVISORY
        ));
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private boolean isServiceAlert(String alertType) {
        return "Live".equalsIgnoreCase(alertType) || "GTFS-RT".equalsIgnoreCase(alertType);
    }

    private OffsetDateTime sourceTimeToInstant(TtcAlertRecord record, OffsetDateTime value) {
        if (value == null || value.getYear() <= 1) {
            return null;
        }
        if ("GTFS-RT".equalsIgnoreCase(record.alertType())) {
            return value.withOffsetSameInstant(ZoneOffset.UTC);
        }
        return value.toLocalDateTime()
            .atZone(TORONTO_ZONE)
            .toOffsetDateTime()
            .withOffsetSameInstant(ZoneOffset.UTC);
    }

    private List<String> routeIdsFor(TtcAlertRecord record) {
        return SurfaceRouteLabeler.routeIdsFor(
            record.route(),
            record.routeBranch(),
            record.title(),
            record.headerText(),
            record.description(),
            record.url()
        );
    }

    private String stopNameForIndex(TtcAlertRecord record, int index, String fallback) {
        if (index == 0 && record.stopStart() != null && !record.stopStart().isBlank()) {
            return record.stopStart();
        }
        if (index == 1 && record.stopEnd() != null && !record.stopEnd().isBlank()) {
            return record.stopEnd();
        }
        return fallback;
    }
}
