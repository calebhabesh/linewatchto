package com.calebhabesh.linewatch.accessibility;

import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AccessibilityOutageReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AccessibilityOutageReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record OutageRow(
        String id,
        String assetType,
        String title,
        String description,
        String cause,
        OffsetDateTime updatedAt,
        String stationId,
        String stationName,
        int stationLineSortOrder,
        String lineId,
        String lineNumber,
        String lineName,
        String lineColor,
        int lineSortOrder
    ) {}

    public List<OutageRow> findActiveOutages(String assetTypeFilter) {
        StringBuilder sql = new StringBuilder("""
            select
                outage.id as outage_id,
                outage.asset_type,
                outage.title,
                outage.description,
                outage.cause,
                coalesce(outage.source_updated_at, outage.updated_at) as updated_at,
                station.id as station_id,
                station.name as station_name,
                sl.sort_order as station_line_sort_order,
                line.id as line_id,
                line.number as line_number,
                line.name as line_name,
                line.color as line_color,
                line.sort_order as line_sort_order
            from accessibility_outages outage
            join accessibility_outage_stations aos on aos.outage_id = outage.id
            join stations station on station.id = aos.station_id
            join station_lines sl on sl.station_id = station.id
            join transit_lines line on line.id = sl.line_id
            where outage.active = true
        """);

        MapSqlParameterSource params = new MapSqlParameterSource();
        if (assetTypeFilter != null) {
            sql.append(" and outage.asset_type = :assetType");
            params.addValue("assetType", assetTypeFilter);
        }

        return jdbc.query(sql.toString(), params, (rs, rowNum) -> new OutageRow(
            rs.getString("outage_id"),
            rs.getString("asset_type"),
            rs.getString("title"),
            rs.getString("description"),
            rs.getString("cause"),
            rs.getObject("updated_at", OffsetDateTime.class),
            rs.getString("station_id"),
            rs.getString("station_name"),
            rs.getInt("station_line_sort_order"),
            rs.getString("line_id"),
            rs.getString("line_number"),
            rs.getString("line_name"),
            rs.getString("line_color"),
            rs.getInt("line_sort_order")
        ));
    }
}
