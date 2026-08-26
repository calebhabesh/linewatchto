package com.calebhabesh.linewatch.regional;

import com.calebhabesh.linewatch.regional.RegionalTripChangeResponses.TripChange;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;

@Repository
public class RegionalTrainCancellationHistoryStore {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public RegionalTrainCancellationHistoryStore(
        NamedParameterJdbcTemplate jdbc,
        ObjectMapper objectMapper
    ) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public void record(List<TripChange> cancellations, OffsetDateTime observedAt) {
        jdbc.update("""
            insert into regional_train_cancellation_tracking (id, started_at)
            values (1, :observedAt)
            on conflict (id) do nothing
            """, new MapSqlParameterSource("observedAt", observedAt));
        if (cancellations.isEmpty()) return;
        SqlParameterSource[] rows = cancellations.stream()
            .filter(change -> "cancellation".equals(change.kind()))
            .map(change -> new MapSqlParameterSource()
                .addValue("serviceDate", change.serviceDate())
                .addValue("lineId", change.lineId())
                .addValue("tripId", change.tripId())
                .addValue("tripNumber", change.tripNumber())
                .addValue("scheduledStartAt", change.scheduledStartAt())
                .addValue("scheduleMatched", change.scheduleMatched())
                .addValue("stationIds", json(change.affectedStops().stream()
                    .map(RegionalTripChangeResponses.AffectedStop::stationId)
                    .distinct()
                    .toList()))
                .addValue("sourceSystems", json(change.sourceSystems()))
                .addValue("observedAt", observedAt))
            .toArray(SqlParameterSource[]::new);
        if (rows.length == 0) return;
        jdbc.batchUpdate("""
            insert into regional_train_cancellations (
                service_date, line_id, trip_id, trip_number, scheduled_start_at,
                schedule_matched, station_ids, source_systems, first_seen_at, last_seen_at
            ) values (
                :serviceDate, :lineId, :tripId, :tripNumber, :scheduledStartAt,
                :scheduleMatched, cast(:stationIds as jsonb), cast(:sourceSystems as jsonb),
                :observedAt, :observedAt
            )
            on conflict (service_date, line_id, trip_number) do update set
                trip_id = case
                    when excluded.schedule_matched then excluded.trip_id
                    else regional_train_cancellations.trip_id
                end,
                scheduled_start_at = coalesce(
                    excluded.scheduled_start_at,
                    regional_train_cancellations.scheduled_start_at
                ),
                schedule_matched = regional_train_cancellations.schedule_matched
                    or excluded.schedule_matched,
                station_ids = case
                    when excluded.schedule_matched then excluded.station_ids
                    else regional_train_cancellations.station_ids
                end,
                source_systems = excluded.source_systems,
                last_seen_at = excluded.last_seen_at
            """, rows);
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to persist regional cancellation history", exception);
        }
    }
}
