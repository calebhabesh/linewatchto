package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class TtcSurfaceScheduledArrivalRepository {
    static final String SOURCE = "TTC published GTFS schedule";
    private static final ZoneId TORONTO = ZoneId.of("America/Toronto");
    private final NamedParameterJdbcTemplate jdbc;
    private final GtfsScheduleReadRepository schedules;

    public TtcSurfaceScheduledArrivalRepository(NamedParameterJdbcTemplate jdbc, GtfsScheduleReadRepository schedules) {
        this.jdbc = jdbc;
        this.schedules = schedules;
    }

    public List<SurfaceArrivalRecord> arrivals(String stationId, OffsetDateTime now, Duration horizon) {
        var active = schedules.findActiveImportId();
        if (active.isEmpty()) return List.of();
        long importId = active.get();
        List<SurfaceArrivalRecord> result = new ArrayList<>();
        LocalDate today = now.atZoneSameInstant(TORONTO).toLocalDate();
        LocalDate end = now.plus(horizon).atZoneSameInstant(TORONTO).toLocalDate();
        // Include previous service days for GTFS times after 24:00.
        for (LocalDate date = today.minusDays(2); !date.isAfter(end); date = date.plusDays(1)) {
            List<String> services = schedules.findActiveServiceIds(importId, date);
            if (services.isEmpty()) continue;
            // GTFS service-day origin is noon minus twelve hours, including DST transitions.
            OffsetDateTime origin = date.atTime(12, 0).atZone(TORONTO).minusHours(12).toOffsetDateTime();
            long from = Duration.between(origin, now).toSeconds();
            long until = Duration.between(origin, now.plus(horizon)).toSeconds();
            result.addAll(jdbc.query("""
                select r.mode, r.route_short_name, r.route_long_name, t.trip_headsign,
                       t.trip_id, s.stop_name, s.bay_platform, st.departure_seconds
                from ttc_surface_station_stops s
                join ttc_surface_stop_times st on st.import_id = s.import_id and st.stop_id = s.stop_id
                join ttc_surface_trips t on t.import_id = st.import_id and t.trip_id = st.trip_id
                join ttc_surface_routes r on r.import_id = t.import_id and r.route_id = t.route_id
                where s.import_id = :importId and s.station_id = :stationId
                  and t.service_id in (:services)
                  and st.departure_seconds >= :from and st.departure_seconds <= :until
                order by st.departure_seconds, t.trip_id
                """, Map.of("importId", importId, "stationId", stationId, "services", services,
                    "from", from, "until", until), (rs, row) -> new SurfaceArrivalRecord(
                        stationId, "TTC", rs.getString("mode"), rs.getString("route_short_name"),
                        rs.getString("route_long_name"), rs.getString("trip_headsign"),
                        origin.plusSeconds(rs.getInt("departure_seconds")), null,
                        rs.getString("bay_platform"), rs.getString("stop_name"), rs.getString("trip_id"),
                        SOURCE, "scheduled")));
        }
        result.sort(Comparator.comparing(SurfaceArrivalRecord::scheduledAt));
        return List.copyOf(result);
    }
}
