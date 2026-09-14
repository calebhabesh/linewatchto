package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import java.sql.ResultSet;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class TtcSurfaceScheduledArrivalRepositoryTest {
    @Test
    void readsAfterMidnightDeparturesUsingThePreviousServiceCalendar() throws Exception {
        var jdbc = mock(NamedParameterJdbcTemplate.class);
        var schedules = mock(GtfsScheduleReadRepository.class);
        when(schedules.findActiveImportId()).thenReturn(Optional.of(42L));
        // Only Monday's service is eligible; Tuesday and exceptions are resolved by the shared calendar read.
        when(schedules.findActiveServiceIds(42L, LocalDate.parse("2026-09-14"))).thenReturn(List.of("weekday"));
        when(jdbc.query(anyString(), anyMap(), org.mockito.ArgumentMatchers.<RowMapper<SurfaceArrivalRecord>>any()))
            .thenAnswer(call -> {
                Map<String, Object> params = call.getArgument(1);
                assertThat(params.get("services")).isEqualTo(List.of("weekday"));
                assertThat(params.get("from")).isEqualTo(24 * 3600L + 30 * 60);
                ResultSet rs = mock(ResultSet.class);
                when(rs.getInt("departure_seconds")).thenReturn(25 * 3600);
                when(rs.getString("route_short_name")).thenReturn("995");
                RowMapper<SurfaceArrivalRecord> mapper = call.getArgument(2);
                return List.of(mapper.mapRow(rs, 0));
            });
        var repository = new TtcSurfaceScheduledArrivalRepository(jdbc, schedules);
        var rows = repository.arrivals("york-mills", OffsetDateTime.parse("2026-09-15T00:30:00-04:00"), Duration.ofHours(2));
        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.scheduledAt()).isEqualTo(OffsetDateTime.parse("2026-09-15T01:00:00-04:00"));
            assertThat(row.predictedAt()).isNull();
            assertThat(row.status()).isEqualTo("scheduled");
        });
        verify(jdbc, times(1)).query(anyString(), anyMap(), org.mockito.ArgumentMatchers.<RowMapper<SurfaceArrivalRecord>>any());
    }

    @Test
    void doesNotInventDeparturesWithoutAnActiveImportOrEligibleService() {
        var jdbc = mock(NamedParameterJdbcTemplate.class);
        var schedules = mock(GtfsScheduleReadRepository.class);
        var repository = new TtcSurfaceScheduledArrivalRepository(jdbc, schedules);
        var now = OffsetDateTime.parse("2026-09-13T11:00:00-04:00");
        assertThat(repository.arrivals("york-mills", now, Duration.ofHours(2))).isEmpty();
        when(schedules.findActiveImportId()).thenReturn(Optional.of(42L));
        assertThat(repository.arrivals("york-mills", now, Duration.ofHours(2))).isEmpty();
        verifyNoInteractions(jdbc);
    }
}
