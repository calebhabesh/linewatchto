package com.calebhabesh.linewatch.announcement;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcAnnouncementReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcAnnouncementReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<TtcAnnouncement> findActive() {
        return jdbc.query("""
            select id, source_id, scope, title, description, url,
                   active_period_start, active_period_end, source_updated_at, raw_payload
            from ttc_announcements
            where active = true
            order by source_updated_at desc nulls last, updated_at desc
            """, new MapSqlParameterSource(), (rs, rowNumber) -> new TtcAnnouncement(
                rs.getString("id"),
                rs.getString("source_id"),
                rs.getString("scope"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("url"),
                rs.getObject("active_period_start", OffsetDateTime.class),
                rs.getObject("active_period_end", OffsetDateTime.class),
                rs.getObject("source_updated_at", OffsetDateTime.class),
                rs.getString("raw_payload")
            ));
    }
}
