package com.calebhabesh.linewatch.station;

import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StationLiveReadRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public StationLiveReadRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<FacilityOutage> findActiveOutagesByStationId(String stationId) {
        return jdbc.query("""
            select
                outage.id,
                outage.asset_type,
                outage.title,
                outage.description,
                outage.cause,
                coalesce(outage.source_updated_at, outage.updated_at) as updated_at
            from accessibility_outages outage
            join accessibility_outage_stations station_outage
                on station_outage.outage_id = outage.id
            where station_outage.station_id = :stationId
              and outage.active = true
            order by coalesce(outage.source_updated_at, outage.updated_at) desc, outage.id
            """, new MapSqlParameterSource("stationId", stationId),
            (resultSet, rowNumber) -> new FacilityOutage(
                resultSet.getString("id"),
                resultSet.getString("asset_type"),
                resultSet.getString("title"),
                resultSet.getString("description"),
                resultSet.getString("cause"),
                resultSet.getObject("updated_at", OffsetDateTime.class)
            ));
    }

    public List<LinkedAlert> findActiveAlertsByStationId(String stationId) {
        return jdbc.query("""
            select
                alert.id,
                alert.type,
                alert.severity,
                alert.title,
                alert.description,
                coalesce(alert.source_updated_at, alert.updated_at) as updated_at
            from alerts alert
            join alert_stations station_alert
                on station_alert.alert_id = alert.id
            where station_alert.station_id = :stationId
              and alert.active = true
            order by coalesce(alert.source_updated_at, alert.updated_at) desc, alert.id
            """, new MapSqlParameterSource("stationId", stationId),
            (resultSet, rowNumber) -> new LinkedAlert(
                resultSet.getString("id"),
                resultSet.getString("type"),
                resultSet.getString("severity"),
                resultSet.getString("title"),
                resultSet.getString("description"),
                resultSet.getObject("updated_at", OffsetDateTime.class)
            ));
    }

    public Set<String> findStationIdsWithActiveOutages() {
        return stationIds("""
            select distinct station_outage.station_id
            from accessibility_outage_stations station_outage
            join accessibility_outages outage on outage.id = station_outage.outage_id
            where outage.active = true
            order by station_outage.station_id
            """);
    }

    public List<FacilityOutageCount> findActiveOutageCountsByStationId() {
        return jdbc.query("""
            select
                station_outage.station_id,
                outage.asset_type,
                count(*) as outage_count
            from accessibility_outage_stations station_outage
            join accessibility_outages outage on outage.id = station_outage.outage_id
            where outage.active = true
            group by station_outage.station_id, outage.asset_type
            order by station_outage.station_id, outage.asset_type
            """,
            (resultSet, rowNumber) -> new FacilityOutageCount(
                resultSet.getString("station_id"),
                resultSet.getString("asset_type"),
                resultSet.getInt("outage_count")
            ));
    }

    public Set<String> findStationIdsWithActiveAlerts() {
        return stationIds("""
            select distinct station_alert.station_id
            from alert_stations station_alert
            join alerts alert on alert.id = station_alert.alert_id
            where alert.active = true
            order by station_alert.station_id
            """);
    }

    private Set<String> stationIds(String sql) {
        return new LinkedHashSet<>(jdbc.query(
            sql,
            (resultSet, rowNumber) -> resultSet.getString("station_id")
        ));
    }

    public record FacilityOutage(
        String id,
        String assetType,
        String title,
        String description,
        String cause,
        OffsetDateTime updatedAt
    ) {
    }

    public record FacilityOutageCount(
        String stationId,
        String assetType,
        int count
    ) {
    }

    public record LinkedAlert(
        String id,
        String type,
        String severity,
        String title,
        String description,
        OffsetDateTime updatedAt
    ) {
    }
}
