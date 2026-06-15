package com.calebhabesh.linewatch.surface;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

@Repository
public class SurfaceServiceNoticeStore {
    private final NamedParameterJdbcTemplate jdbc;

    public SurfaceServiceNoticeStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public void upsertNotice(SurfaceServiceNotice notice, OffsetDateTime now) {
        jdbc.update("""
            insert into surface_service_notices (
                id, source_id, category, route_type, title, description, header_text, url,
                effect, effect_description, direction, cause, cause_description,
                active_period_start, active_period_end, source_updated_at, active,
                raw_payload, created_at, updated_at
            ) values (
                :id, :sourceId, :category, :routeType, :title, :description, :headerText, :url,
                :effect, :effectDescription, :direction, :cause, :causeDescription,
                :activePeriodStart, :activePeriodEnd, :sourceUpdatedAt, :active,
                :rawPayload, :now, :now
            )
            on conflict (source_id) do update set
                category = excluded.category,
                route_type = excluded.route_type,
                title = excluded.title,
                description = excluded.description,
                header_text = excluded.header_text,
                url = excluded.url,
                effect = excluded.effect,
                effect_description = excluded.effect_description,
                direction = excluded.direction,
                cause = excluded.cause,
                cause_description = excluded.cause_description,
                active_period_start = excluded.active_period_start,
                active_period_end = excluded.active_period_end,
                source_updated_at = excluded.source_updated_at,
                active = excluded.active,
                raw_payload = excluded.raw_payload,
                updated_at = excluded.updated_at
            """, new MapSqlParameterSource()
                .addValue("id", notice.id())
                .addValue("sourceId", notice.sourceId())
                .addValue("category", notice.category())
                .addValue("routeType", notice.routeType())
                .addValue("title", notice.title())
                .addValue("description", notice.description())
                .addValue("headerText", notice.headerText())
                .addValue("url", notice.url())
                .addValue("effect", notice.effect())
                .addValue("effectDescription", notice.effectDescription())
                .addValue("direction", notice.direction())
                .addValue("cause", notice.cause())
                .addValue("causeDescription", notice.causeDescription())
                .addValue("activePeriodStart", notice.activePeriodStart())
                .addValue("activePeriodEnd", notice.activePeriodEnd())
                .addValue("sourceUpdatedAt", notice.sourceUpdatedAt())
                .addValue("active", notice.active())
                .addValue("rawPayload", notice.rawPayload())
                .addValue("now", now)
        );

        // Replace route children
        jdbc.update(
            "delete from surface_service_notice_routes where notice_id = :noticeId",
            new MapSqlParameterSource("noticeId", notice.id())
        );

        List<String> routeIds = notice.routeIds();
        for (int i = 0; i < routeIds.size(); i++) {
            jdbc.update("""
                insert into surface_service_notice_routes (notice_id, route_id, sort_order)
                values (:noticeId, :routeId, :sortOrder)
                """, new MapSqlParameterSource()
                    .addValue("noticeId", notice.id())
                    .addValue("routeId", routeIds.get(i))
                    .addValue("sortOrder", i + 1)
            );
        }

        // Replace stop children
        jdbc.update(
            "delete from surface_service_notice_stops where notice_id = :noticeId",
            new MapSqlParameterSource("noticeId", notice.id())
        );

        List<SurfaceServiceNotice.StopDetail> stops = notice.stops();
        for (int i = 0; i < stops.size(); i++) {
            jdbc.update("""
                insert into surface_service_notice_stops (notice_id, stop_id, stop_name, sort_order)
                values (:noticeId, :stopId, :stopName, :sortOrder)
                """, new MapSqlParameterSource()
                    .addValue("noticeId", notice.id())
                    .addValue("stopId", stops.get(i).stopId())
                    .addValue("stopName", stops.get(i).stopName())
                    .addValue("sortOrder", i + 1)
            );
        }
    }

    @Transactional
    public void deactivateMissingNotices(Set<String> activeSourceIds, OffsetDateTime now) {
        List<ActiveNoticeInfo> activeNotices = jdbc.query("""
            select id, source_id
            from surface_service_notices
            where active = true
            """, (rs, rowNum) -> new ActiveNoticeInfo(
                rs.getString("id"),
                rs.getString("source_id")
            ));

        for (ActiveNoticeInfo notice : activeNotices) {
            if (!activeSourceIds.contains(notice.sourceId())) {
                jdbc.update("""
                    update surface_service_notices
                    set active = false, updated_at = :now
                    where id = :id
                    """, new MapSqlParameterSource()
                        .addValue("id", notice.id())
                        .addValue("now", now)
                );
            }
        }
    }

    record ActiveNoticeInfo(String id, String sourceId) {}
}
