package com.calebhabesh.linewatch.maintenance;

import java.time.OffsetDateTime;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MaintenanceCleanupStore {
    private final NamedParameterJdbcTemplate jdbc;

    public MaintenanceCleanupStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public int deleteOldInactiveGtfsImports(int retainInactiveImports) {
        return jdbc.update("""
            delete from gtfs_schedule_imports
            where active = false
              and id not in (
                  select id
                  from (
                      select id
                      from gtfs_schedule_imports
                      where active = false
                      order by service_end desc nulls last,
                               service_start desc nulls last,
                               imported_at desc,
                               id desc
                      limit :retainInactiveImports
                  ) retained_imports
              )
            """, new MapSqlParameterSource(
                "retainInactiveImports",
                Math.max(0, retainInactiveImports)
            ));
    }

    public void refreshGtfsPlannerStatistics() {
        jdbc.getJdbcTemplate().execute("""
            analyze gtfs_schedule_imports, gtfs_routes, gtfs_stops, gtfs_services,
                    gtfs_service_exceptions, gtfs_trips, gtfs_stop_times,
                    gtfs_station_stops, ttc_surface_routes, ttc_surface_station_stops,
                    ttc_surface_trips, ttc_surface_station_connections
            """);
    }

    public int deleteExpiredDemoAccounts(OffsetDateTime now) {
        return jdbc.update("""
            delete from accounts account
            where account.demo = true
              and not exists (
                  select 1
                  from user_sessions session
                  where session.account_id = account.id
                    and session.expires_at >= :now
              )
            """, new MapSqlParameterSource("now", now));
    }

    public int deleteOldIngestionRuns(OffsetDateTime cutoff) {
        return jdbc.update("""
            with latest_runs as (
                select distinct on (run_type) id
                from ingestion_runs
                order by run_type, started_at desc, id desc
            )
            delete from ingestion_runs
            where started_at < :cutoff
              and id not in (select id from latest_runs)
            """, new MapSqlParameterSource("cutoff", cutoff));
    }

    public int deleteOldInactiveAlertSourceRecords(OffsetDateTime cutoff) {
        return jdbc.update("""
            delete from ttc_alert_source_records
            where active = false
              and last_seen_at < :cutoff
            """, new MapSqlParameterSource("cutoff", cutoff));
    }

    public int deleteOldInactiveMetrolinxAlertSourceRecords(OffsetDateTime cutoff) {
        return jdbc.update("""
            delete from metrolinx_alert_source_records
            where active = false
              and last_seen_at < :cutoff
            """, new MapSqlParameterSource("cutoff", cutoff));
    }

    public int deleteOldInactiveMetrolinxOperationalSourceRecords(OffsetDateTime cutoff) {
        return jdbc.update("""
            delete from metrolinx_operational_source_records
            where active = false
              and last_seen_at < :cutoff
            """, new MapSqlParameterSource("cutoff", cutoff));
    }
}
