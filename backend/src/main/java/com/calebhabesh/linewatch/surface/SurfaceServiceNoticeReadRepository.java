package com.calebhabesh.linewatch.surface;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SurfaceServiceNoticeReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public SurfaceServiceNoticeReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SurfaceServiceNotice> findActiveNotices() {
        String noticeSql = """
            select id, source_id, category, route_type, title, description, header_text, url,
                   effect, effect_description, direction, cause, cause_description,
                   active_period_start, active_period_end, source_updated_at, active, raw_payload,
                   alert_class
            from surface_service_notices
            where active = true
            """;

        List<NoticeRow> noticeRows = jdbc.query(noticeSql, (rs, rowNum) -> new NoticeRow(
            rs.getString("id"),
            rs.getString("source_id"),
            rs.getString("category"),
            rs.getString("route_type"),
            rs.getString("title"),
            rs.getString("description"),
            rs.getString("header_text"),
            rs.getString("url"),
            rs.getString("effect"),
            rs.getString("effect_description"),
            rs.getString("direction"),
            rs.getString("cause"),
            rs.getString("cause_description"),
            rs.getObject("active_period_start", OffsetDateTime.class),
            rs.getObject("active_period_end", OffsetDateTime.class),
            rs.getObject("source_updated_at", OffsetDateTime.class),
            rs.getBoolean("active"),
            rs.getString("raw_payload"),
            rs.getString("alert_class")
        ));

        if (noticeRows.isEmpty()) {
            return List.of();
        }

        // Fetch routes
        String routeSql = """
            select notice_id, route_id
            from surface_service_notice_routes
            order by sort_order
            """;
        Map<String, List<String>> routesMap = new HashMap<>();
        jdbc.query(routeSql, (rs, rowNum) -> {
            String noticeId = rs.getString("notice_id");
            String routeId = rs.getString("route_id");
            routesMap.computeIfAbsent(noticeId, k -> new ArrayList<>()).add(routeId);
            return null;
        });

        // Fetch stops
        String stopSql = """
            select notice_id, stop_id, stop_name
            from surface_service_notice_stops
            order by sort_order
            """;
        Map<String, List<SurfaceServiceNotice.StopDetail>> stopsMap = new HashMap<>();
        jdbc.query(stopSql, (rs, rowNum) -> {
            String noticeId = rs.getString("notice_id");
            String stopId = rs.getString("stop_id");
            String stopName = rs.getString("stop_name");
            stopsMap.computeIfAbsent(noticeId, k -> new ArrayList<>()).add(new SurfaceServiceNotice.StopDetail(stopId, stopName));
            return null;
        });

        // Assemble
        List<SurfaceServiceNotice> notices = new ArrayList<>();
        for (NoticeRow r : noticeRows) {
            notices.add(new SurfaceServiceNotice(
                r.id(),
                r.sourceId(),
                r.category(),
                r.routeType(),
                r.title(),
                r.description(),
                r.headerText(),
                r.url(),
                r.effect(),
                r.effectDescription(),
                r.direction(),
                r.cause(),
                r.causeDescription(),
                r.activePeriodStart(),
                r.activePeriodEnd(),
                r.sourceUpdatedAt(),
                r.active(),
                r.rawPayload(),
                routesMap.getOrDefault(r.id(), List.of()),
                stopsMap.getOrDefault(r.id(), List.of()),
                r.alertClass()
            ));
        }

        return notices;
    }

    private record NoticeRow(
        String id,
        String sourceId,
        String category,
        String routeType,
        String title,
        String description,
        String headerText,
        String url,
        String effect,
        String effectDescription,
        String direction,
        String cause,
        String causeDescription,
        OffsetDateTime activePeriodStart,
        OffsetDateTime activePeriodEnd,
        OffsetDateTime sourceUpdatedAt,
        boolean active,
        String rawPayload,
        String alertClass
    ) {}
}
