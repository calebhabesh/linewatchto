package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AlertActivePeriodRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AlertActivePeriodRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, List<AlertPeriod>> findByAlertIds(Collection<String> alertIds) {
        if (alertIds == null || alertIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.query("""
            select alert_id, source_period_id, starts_at, ends_at, sort_order,
                   source_current_continuous
            from alert_active_periods
            where alert_id in (:alertIds)
            order by alert_id asc, sort_order asc
            """, new MapSqlParameterSource("alertIds", alertIds), (rs, rowNum) ->
            new AlertPeriod(
                rs.getString("alert_id"),
                rs.getString("source_period_id"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class),
                rs.getInt("sort_order"),
                rs.getBoolean("source_current_continuous")
            )
        ).stream().collect(Collectors.groupingBy(AlertPeriod::alertId));
    }

    public record AlertPeriod(
        String alertId,
        String sourcePeriodId,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        int sortOrder,
        boolean sourceCurrentContinuous
    ) {
        public AlertPeriod(
            String alertId,
            String sourcePeriodId,
            OffsetDateTime startsAt,
            OffsetDateTime endsAt,
            int sortOrder
        ) {
            this(alertId, sourcePeriodId, startsAt, endsAt, sortOrder, false);
        }
    }
}
