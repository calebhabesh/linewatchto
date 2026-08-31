package com.calebhabesh.linewatch.stationnotice;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcStationNoticeReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public TtcStationNoticeReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<TtcStationNotice> findReviewedByStationId(String stationId) {
        return jdbc.query("""
            select id, station_id, category, title, summary, source_url,
                   effective_start, effective_end, source_updated_at,
                   last_verified_at, source
            from ttc_station_notices
            where station_id = :stationId and active = true
            order by sort_order, effective_start nulls first, id
            """, new MapSqlParameterSource("stationId", stationId), (rs, rowNumber) -> new TtcStationNotice(
                rs.getString("id"),
                rs.getString("station_id"),
                rs.getString("category"),
                rs.getString("title"),
                rs.getString("summary"),
                rs.getString("source_url"),
                rs.getObject("effective_start", LocalDate.class),
                rs.getObject("effective_end", LocalDate.class),
                rs.getObject("source_updated_at", OffsetDateTime.class),
                rs.getObject("last_verified_at", OffsetDateTime.class),
                rs.getString("source")
            ));
    }
}
