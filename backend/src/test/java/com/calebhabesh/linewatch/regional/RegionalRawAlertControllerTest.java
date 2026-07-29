package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalRawAlertControllerTest {
    @Test
    void returnsStagedMetrolinxSourceRecords() {
        RegionalAlertStore alertStore = mock(RegionalAlertStore.class);
        DashboardCacheService cache = mock(DashboardCacheService.class);
        when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
        List<RawAlertDto> alerts = List.of(new RawAlertDto(
            "go",
            "M1",
            "GO Rail",
            OffsetDateTime.parse("2026-07-29T12:00:00-04:00"),
            "{\"Code\":\"M1\"}",
            true
        ));
        when(alertStore.findRawAlerts()).thenReturn(alerts);

        RegionalRawAlertController controller = new RegionalRawAlertController(
            alertStore,
            cache,
            new DashboardCacheProperties()
        );

        assertThat(controller.getRawAlerts()).isEqualTo(alerts);
    }
}
