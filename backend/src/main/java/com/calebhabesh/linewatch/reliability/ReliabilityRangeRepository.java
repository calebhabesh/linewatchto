package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.regional.RegionalNetworkCatalog;
import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import com.calebhabesh.linewatch.station.StationDisplayNameFormatter;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Bounded reads of the derived read model and its catalogs for the range API. Every read is
 * keyed by methodology version, network and a date or time range; none reads raw GTFS stop
 * times or ingestion runs.
 */
@Repository
public class ReliabilityRangeRepository {
    private static final List<String> TTC_LINES = List.of("line-1", "line-2", "line-4", "line-5", "line-6");

    private final NamedParameterJdbcTemplate jdbc;

    public ReliabilityRangeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record LineInfo(String id, String number, String label) {}

    public record StationInfo(String id, String name, List<String> lineIds) {}

    /** A derived (or, with {@code live}, computed) line or station day row for one group. */
    public record DayFact(
        String lineId,
        String stationId,
        LocalDate serviceDate,
        String impactGroup,
        int scheduledMinutes,
        int observedMinutes,
        int impactedMinutes,
        double weightedMinutes,
        int incidentMinutes,
        boolean live
    ) {}

    public record StoredEpisode(
        String episodeKey,
        String alertId,
        String lineId,
        String impactKind,
        String disruptionClass,
        boolean planned,
        String cause,
        List<String> stationIds,
        OffsetDateTime openedAt,
        OffsetDateTime closedAt,
        boolean completed,
        List<TimeRange> pieces
    ) {}

    /** A rolled-up polling day; {@code finalRow} once rolled up after its date ended. */
    public record PollingDay(LocalDate date, long polledMinutes, boolean finalRow) {}

    /** A title an alert carried, first seen at {@code firstSeen}. */
    public record TitleSighting(String alertId, String title, OffsetDateTime firstSeen) {}

    public List<LineInfo> lines(String networkId) {
        if ("regional".equals(networkId)) {
            return RegionalNetworkCatalog.routes().stream()
                .map(route -> new LineInfo(route.id(), route.number(), route.name()))
                .toList();
        }
        return jdbc.query("""
            select id, number, name from transit_lines
            where id in (:lineIds)
            order by number
            """, new MapSqlParameterSource("lineIds", TTC_LINES),
            (rs, row) -> new LineInfo(rs.getString("id"), rs.getString("number"), rs.getString("name")));
    }

    /** The network's stations in catalog order, each with the lines it serves. */
    public Map<String, StationInfo> stations(String networkId) {
        Map<String, StationInfo> stations = new LinkedHashMap<>();
        if ("regional".equals(networkId)) {
            for (var station : RegionalNetworkCatalog.stations()) {
                stations.put(station.id(), new StationInfo(station.id(), station.name(), List.copyOf(station.lineIds())));
            }
            return stations;
        }
        Map<String, List<String>> lineIds = new LinkedHashMap<>();
        Map<String, String> names = new HashMap<>();
        jdbc.query("""
            select station.id, station.name, station_line.line_id
            from station_lines station_line
            join stations station on station.id = station_line.station_id
            where station_line.line_id in (:lineIds)
            order by station_line.line_id, station_line.sort_order, station.id
            """, new MapSqlParameterSource("lineIds", TTC_LINES), rs -> {
                String id = rs.getString("id");
                names.putIfAbsent(id, rs.getString("name"));
                lineIds.computeIfAbsent(id, ignored -> new ArrayList<>()).add(rs.getString("line_id"));
            });
        for (Map.Entry<String, List<String>> entry : lineIds.entrySet()) {
            String name = names.get(entry.getKey());
            stations.put(entry.getKey(), new StationInfo(
                entry.getKey(),
                name == null || name.isBlank() ? StationDisplayNameFormatter.fromStationId(entry.getKey()) : name,
                List.copyOf(entry.getValue())));
        }
        return stations;
    }

    public Map<LocalDate, PollingDay> pollingDays(String networkId, LocalDate fromDate, LocalDate toDate) {
        Map<LocalDate, PollingDay> days = new HashMap<>();
        jdbc.query("""
            select observation_date, observed_minutes,
                   rolled_up_at >= ((observation_date + 1)::timestamp at time zone 'America/Toronto')
                       + interval '10 minutes' final_row
            from reliability_observation_windows
            where network_id = :networkId
              and observation_date between :fromDate and :toDate
            """, new MapSqlParameterSource()
                .addValue("networkId", networkId)
                .addValue("fromDate", fromDate)
                .addValue("toDate", toDate),
            rs -> {
                LocalDate date = rs.getObject("observation_date", LocalDate.class);
                days.put(date, new PollingDay(date, rs.getLong("observed_minutes"), rs.getBoolean("final_row")));
            });
        return days;
    }

    public List<DayFact> lineDays(int version, String networkId, LocalDate fromDate, LocalDate toDate, String lineId) {
        if (fromDate.isAfter(toDate)) return List.of();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("fromDate", fromDate)
            .addValue("toDate", toDate);
        String lineFilter = "";
        if (lineId != null) {
            params.addValue("lineId", lineId);
            lineFilter = " and line_id = :lineId ";
        }
        return jdbc.query("""
            select line_id, '' station_id, service_date, impact_group, scheduled_minutes, observed_minutes,
                   impacted_minutes, weighted_impacted_minutes, incident_minutes
            from reliability_line_days
            where methodology_version = :version
              and network_id = :networkId
              and service_date between :fromDate and :toDate
            """ + lineFilter + """
            order by service_date, line_id, impact_group
            """, params, (rs, row) -> dayFact(rs));
    }

    public List<DayFact> stationDays(
        int version,
        String networkId,
        LocalDate fromDate,
        LocalDate toDate,
        String lineId,
        String stationId
    ) {
        if (fromDate.isAfter(toDate)) return List.of();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("fromDate", fromDate)
            .addValue("toDate", toDate);
        StringBuilder filters = new StringBuilder();
        if (lineId != null) {
            params.addValue("lineId", lineId);
            filters.append(" and line_id = :lineId ");
        }
        if (stationId != null) {
            params.addValue("stationId", stationId);
            filters.append(" and station_id = :stationId ");
        }
        return jdbc.query("""
            select line_id, station_id, service_date, impact_group, scheduled_minutes, observed_minutes,
                   impacted_minutes, weighted_impacted_minutes, incident_minutes
            from reliability_station_days
            where methodology_version = :version
              and network_id = :networkId
              and service_date between :fromDate and :toDate
            """ + filters + """
            order by service_date, line_id, station_id, impact_group
            """, params, (rs, row) -> dayFact(rs));
    }

    /** Episodes counted within {@code [rangeStart, rangeEnd)}, each with its counted pieces there. */
    public List<StoredEpisode> episodes(
        int version,
        String networkId,
        OffsetDateTime rangeStart,
        OffsetDateTime rangeEnd,
        String lineId,
        String stationId
    ) {
        if (!rangeStart.isBefore(rangeEnd)) return List.of();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("version", version)
            .addValue("networkId", networkId)
            .addValue("rangeStart", rangeStart)
            .addValue("rangeEnd", rangeEnd);
        StringBuilder filters = new StringBuilder();
        if (lineId != null) {
            params.addValue("lineId", lineId);
            filters.append(" and ep.line_id = :lineId ");
        }
        if (stationId != null) {
            params.addValue("stationId", stationId);
            filters.append(" and jsonb_exists(ep.station_ids, :stationId) ");
        }
        Map<String, StoredEpisode> episodes = new LinkedHashMap<>();
        Map<String, List<TimeRange>> pieces = new HashMap<>();
        jdbc.query("""
            select ep.episode_key, ep.alert_id, ep.line_id, ep.impact_kind, ep.disruption_class, ep.planned,
                   ep.cause, ep.station_ids::text station_ids, ep.opened_at, ep.closed_at, ep.completed,
                   lower(piece) starts_at, upper(piece) ends_at
            from reliability_episodes ep
            join lateral unnest(ep.counted * tstzmultirange(
                tstzrange(cast(:rangeStart as timestamptz), cast(:rangeEnd as timestamptz)))) piece on true
            where ep.methodology_version = :version
              and ep.network_id = :networkId
              and ep.counted && tstzrange(cast(:rangeStart as timestamptz), cast(:rangeEnd as timestamptz))
            """ + filters + """
            order by ep.id, lower(piece)
            """, params, rs -> {
                String key = rs.getString("episode_key");
                if (!episodes.containsKey(key)) {
                    String impactKind = rs.getString("impact_kind");
                    String storedClass = rs.getString("disruption_class");
                    episodes.put(key, new StoredEpisode(
                        key,
                        rs.getString("alert_id"),
                        rs.getString("line_id"),
                        impactKind,
                        storedClass == null || storedClass.isBlank()
                            ? ReliabilityEpisodeSource.disruptionClass(impactKind)
                            : storedClass,
                        rs.getBoolean("planned"),
                        rs.getString("cause"),
                        ReliabilityEpisodeSource.parseJsonArray(rs.getString("station_ids")),
                        rs.getObject("opened_at", OffsetDateTime.class),
                        rs.getObject("closed_at", OffsetDateTime.class),
                        rs.getBoolean("completed"),
                        List.of()
                    ));
                }
                OffsetDateTime start = rs.getObject("starts_at", OffsetDateTime.class);
                OffsetDateTime end = rs.getObject("ends_at", OffsetDateTime.class);
                if (start != null && end != null && end.isAfter(start)) {
                    pieces.computeIfAbsent(key, ignored -> new ArrayList<>()).add(new TimeRange(start, end));
                }
            });
        return episodes.values().stream()
            .map(ep -> new StoredEpisode(
                ep.episodeKey(), ep.alertId(), ep.lineId(), ep.impactKind(), ep.disruptionClass(), ep.planned(),
                ep.cause(), ep.stationIds(), ep.openedAt(), ep.closedAt(), ep.completed(),
                List.copyOf(pieces.getOrDefault(ep.episodeKey(), List.of()))))
            .toList();
    }

    /** Each distinct title the alerts carried, with when it was first seen. */
    public Map<String, List<TitleSighting>> titleSightings(String networkId, Collection<String> alertIds) {
        if (alertIds.isEmpty()) return Map.of();
        String table = "regional".equals(networkId) ? "regional_alert_snapshots" : "snapshots";
        Map<String, List<TitleSighting>> sightings = new HashMap<>();
        jdbc.query("""
            select alert_id, btrim(title) title, min(snapshot_time) first_seen
            from {table}
            where alert_id in (:alertIds)
              and title is not null and btrim(title) <> ''
            group by alert_id, btrim(title)
            order by alert_id, first_seen
            """.replace("{table}", table), new MapSqlParameterSource("alertIds", List.copyOf(alertIds)), rs -> {
                String alertId = rs.getString("alert_id");
                sightings.computeIfAbsent(alertId, ignored -> new ArrayList<>()).add(new TitleSighting(
                    alertId, rs.getString("title"), rs.getObject("first_seen", OffsetDateTime.class)));
            });
        return sightings;
    }

    private static DayFact dayFact(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new DayFact(
            rs.getString("line_id"),
            rs.getString("station_id"),
            rs.getObject("service_date", LocalDate.class),
            rs.getString("impact_group"),
            rs.getInt("scheduled_minutes"),
            rs.getInt("observed_minutes"),
            rs.getInt("impacted_minutes"),
            rs.getDouble("weighted_impacted_minutes"),
            rs.getInt("incident_minutes"),
            false
        );
    }
}
