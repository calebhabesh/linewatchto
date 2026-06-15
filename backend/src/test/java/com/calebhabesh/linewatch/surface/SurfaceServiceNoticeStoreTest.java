package com.calebhabesh.linewatch.surface;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@ExtendWith(MockitoExtension.class)
class SurfaceServiceNoticeStoreTest {

    @Mock
    private NamedParameterJdbcTemplate jdbc;

    @InjectMocks
    private SurfaceServiceNoticeStore store;

    @Test
    void upsertNoticeReplacesRoutesAndStops() {
        SurfaceServiceNotice notice = new SurfaceServiceNotice(
            "ttc-surface-1", "1", "bypass", "Streetcar", "Title", "Desc", "Header", "http://url",
            "BYPASS", "Bypass", "Both ways", null, null, null, null, null, true, "{}",
            List.of("509"), List.of(new SurfaceServiceNotice.StopDetail("13366", "Stop Name"))
        );

        OffsetDateTime now = OffsetDateTime.now();
        store.upsertNotice(notice, now);

        // Verify update in surface_service_notices
        verify(jdbc).update(contains("insert into surface_service_notices"), any(MapSqlParameterSource.class));

        // Verify route children replacement
        verify(jdbc).update(eq("delete from surface_service_notice_routes where notice_id = :noticeId"), any(MapSqlParameterSource.class));
        verify(jdbc).update(contains("insert into surface_service_notice_routes"), any(MapSqlParameterSource.class));

        // Verify stop children replacement
        verify(jdbc).update(eq("delete from surface_service_notice_stops where notice_id = :noticeId"), any(MapSqlParameterSource.class));
        verify(jdbc).update(contains("insert into surface_service_notice_stops"), any(MapSqlParameterSource.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void deactivateMissingNoticesDeactivatesUnseenNotices() {
        OffsetDateTime now = OffsetDateTime.now();
        
        // Mock query returning active notices
        when(jdbc.query(anyString(), any(RowMapper.class)))
            .thenReturn(List.of(new SurfaceServiceNoticeStore.ActiveNoticeInfo("ttc-surface-1", "1")));

        store.deactivateMissingNotices(Set.of("2"), now);

        verify(jdbc).update(contains("update surface_service_notices"), any(MapSqlParameterSource.class));
    }
}
