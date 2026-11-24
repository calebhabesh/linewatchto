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
                    ttc_surface_trips, ttc_surface_station_connections, ttc_surface_stops,
                    ttc_surface_stop_routes, ttc_surface_stop_times
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

    /**
     * Prunes ingestion runs older than {@code cutoff}, always keeping the latest run per type and
     * preserving successful alert polls ({@code alerts}, {@code metrolinx-alerts}) until every
     * Toronto calendar date their 10-minute observation window touches has a final row in
     * {@code reliability_observation_windows}.
     */
    public int deleteOldIngestionRuns(OffsetDateTime cutoff) {
        return jdbc.update("""
            with latest_runs as (
                select distinct on (run_type) id
                from ingestion_runs
                order by run_type, started_at desc, id desc
            )
            delete from ingestion_runs run
            where run.started_at < :cutoff
              and run.id not in (select id from latest_runs)
              and (
                  run.run_type not in ('alerts', 'metrolinx-alerts')
                  or run.status <> 'success'
                  or run.completed_at is null
                  or (
                      exists (
                          select 1 from reliability_observation_windows rolled
                          where rolled.network_id = case run.run_type when 'alerts' then 'ttc' else 'regional' end
                            and rolled.observation_date = (run.completed_at at time zone 'America/Toronto')::date
                            and rolled.rolled_up_at >= ((rolled.observation_date + 1)::timestamp at time zone 'America/Toronto') + interval '10 minutes'
                      )
                      and exists (
                          select 1 from reliability_observation_windows rolled
                          where rolled.network_id = case run.run_type when 'alerts' then 'ttc' else 'regional' end
                            and rolled.observation_date = ((run.completed_at + interval '10 minutes' - interval '1 microsecond') at time zone 'America/Toronto')::date
                            and rolled.rolled_up_at >= ((rolled.observation_date + 1)::timestamp at time zone 'America/Toronto') + interval '10 minutes'
                      )
                  )
              )
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

    /** Model readings of notices no longer in the feed, and request counts older than the cutoff. */
    public int deleteOldRegionalAlertExtractions(OffsetDateTime cutoff) {
        MapSqlParameterSource parameters = new MapSqlParameterSource("cutoff", cutoff);
        jdbc.update("""
            delete from regional_alert_extraction_usage
            where usage_date < cast(:cutoff as date)
            """, parameters);
        return jdbc.update("""
            delete from regional_alert_extractions
            where last_seen_at < :cutoff
            """, parameters);
    }

    public int deleteOldInactiveMetrolinxOperationalSourceRecords(OffsetDateTime cutoff) {
        return jdbc.update("""
            delete from metrolinx_operational_source_records
            where active = false
              and last_seen_at < :cutoff
            """, new MapSqlParameterSource("cutoff", cutoff));
    }
}
