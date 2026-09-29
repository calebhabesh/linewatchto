package com.calebhabesh.linewatch.reliability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.reliability.ReliabilityIntervalCalculator.TimeRange;
import java.sql.ResultSet;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.test.util.ReflectionTestUtils;

class LimitedServiceReliabilityTest {
    @Test
    @SuppressWarnings("unchecked")
    void scheduledLimitedServiceCountsOnlyNightlyPeriodsAndDoesNotCountLinkedChildAgain() throws Exception {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        OffsetDateTime start = OffsetDateTime.parse("2026-09-29T03:00:00Z");
        ResultSet parent = episode("parent", "parent-source", start.minusMinutes(15));
        ResultSet child = episode("child", "child-source", start);
        when(jdbc.query(contains("with lifecycle"), any(SqlParameterSource.class), any(RowMapper.class)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(2);
                return List.of(mapper.mapRow(parent, 0), mapper.mapRow(child, 1));
            });
        ResultSet first = period("child-source", start, start.plusHours(3));
        ResultSet second = period("later-child", start.plusDays(1), start.plusDays(1).plusHours(3));
        when(jdbc.query(contains("with closure_child_counts"), any(RowMapper.class)))
            .thenAnswer(invocation -> {
                RowMapper<?> mapper = invocation.getArgument(1);
                return List.of(mapper.mapRow(first, 0), mapper.mapRow(second, 1));
            });
        List<?> episodes = ReflectionTestUtils.invokeMethod(new ReliabilityRepository(jdbc), "ttcEpisodes",
            null, start.minusDays(1), start.plusDays(2));
        assertThat(episodes).hasSize(2);
        long minutes = 0;
        for (Object episode : episodes) {
            assertThat(ReflectionTestUtils.getField(episode, "impactKind")).isEqualTo("limited-service");
            List<TimeRange> ranges = (List<TimeRange>) ReflectionTestUtils.getField(episode, "ranges");
            assertThat(ranges).hasSize(1);
            minutes += Duration.between(ranges.getFirst().start(), ranges.getFirst().end()).toMinutes();
        }
        assertThat(minutes).isEqualTo(360);
        when(child.getString("impact_kind")).thenReturn("suspension");
        List<?> overridden = ReflectionTestUtils.invokeMethod(new ReliabilityRepository(jdbc), "ttcEpisodes",
            null, start.minusDays(1), start.plusDays(2));
        assertThat(overridden).hasSize(2);
        assertThat(overridden.stream().map(episode -> ReflectionTestUtils.getField(episode, "impactKind")))
            .containsExactlyInAnyOrder("suspension", "limited-service");
    }

    private ResultSet episode(String alertId, String sourceId, OffsetDateTime openedAt) throws Exception {
        ResultSet row = mock(ResultSet.class);
        when(row.getString("alert_id")).thenReturn(alertId);
        when(row.getString("source_id")).thenReturn(sourceId);
        when(row.getString("line_id")).thenReturn("line-1");
        when(row.getString("impact_kind")).thenReturn("limited-service");
        when(row.getObject("opened_at", OffsetDateTime.class)).thenReturn(openedAt);
        when(row.getBoolean("source_active")).thenReturn(true);
        return row;
    }

    private ResultSet period(String sourceId, OffsetDateTime startsAt, OffsetDateTime endsAt) throws Exception {
        ResultSet row = mock(ResultSet.class);
        when(row.getString("alert_id")).thenReturn("parent");
        when(row.getString("source_period_id")).thenReturn(sourceId);
        when(row.getObject("starts_at", OffsetDateTime.class)).thenReturn(startsAt);
        when(row.getObject("ends_at", OffsetDateTime.class)).thenReturn(endsAt);
        return row;
    }
}
