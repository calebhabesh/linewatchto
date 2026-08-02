package com.calebhabesh.linewatch.announcement;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcAnnouncementStore {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcAnnouncementStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsert(TtcAnnouncement announcement, OffsetDateTime now) {
        jdbc.update("""
            insert into ttc_announcements (
                id, source_id, scope, title, description, url,
                active_period_start, active_period_end, source_updated_at,
                active, raw_payload, created_at, updated_at
            ) values (
                :id, :sourceId, :scope, :title, :description, :url,
                :activePeriodStart, :activePeriodEnd, :sourceUpdatedAt,
                true, :rawPayload, :now, :now
            )
            on conflict (source_id) do update set
                scope = excluded.scope,
                title = excluded.title,
                description = excluded.description,
                url = excluded.url,
                active_period_start = excluded.active_period_start,
                active_period_end = excluded.active_period_end,
                source_updated_at = excluded.source_updated_at,
                active = true,
                raw_payload = excluded.raw_payload,
                updated_at = excluded.updated_at
            """, params(announcement, now));
    }

    public void deactivateMissing(Set<String> sourceIds, OffsetDateTime now) {
        List<String> activeSourceIds = jdbc.queryForList(
            "select source_id from ttc_announcements where active = true",
            new MapSqlParameterSource(),
            String.class
        );
        for (String sourceId : activeSourceIds) {
            if (!sourceIds.contains(sourceId)) {
                jdbc.update("""
                    update ttc_announcements
                    set active = false, updated_at = :now
                    where source_id = :sourceId
                    """, new MapSqlParameterSource()
                        .addValue("sourceId", sourceId)
                        .addValue("now", now));
            }
        }
    }

    private MapSqlParameterSource params(TtcAnnouncement announcement, OffsetDateTime now) {
        return new MapSqlParameterSource()
            .addValue("id", announcement.id())
            .addValue("sourceId", announcement.sourceId())
            .addValue("scope", announcement.scope())
            .addValue("title", announcement.title())
            .addValue("description", announcement.description())
            .addValue("url", announcement.url())
            .addValue("activePeriodStart", announcement.activePeriodStart())
            .addValue("activePeriodEnd", announcement.activePeriodEnd())
            .addValue("sourceUpdatedAt", announcement.sourceUpdatedAt())
            .addValue("rawPayload", announcement.rawPayload())
            .addValue("now", now);
    }
}
