package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.surface.SurfaceServiceNoticeResponses.*;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.mockito.ArgumentMatchers.any;
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.calebhabesh.linewatch.regional.RegionalSurfaceServiceNoticeService;

@ExtendWith(MockitoExtension.class)
class SurfaceServiceNoticeControllerTest {

    @Mock
    private SurfaceServiceNoticeService service;

    @Mock
    private RegionalSurfaceServiceNoticeService regionalService;

    @Mock
    private DashboardCacheService cache;

    @Mock
    private DashboardCacheProperties cacheProperties;

    @InjectMocks
    private SurfaceServiceNoticeController controller;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void noticesReturnsResponse() {
        OffsetDateTime now = OffsetDateTime.now();
        SurfaceServiceNoticesResponse dummyResponse = new SurfaceServiceNoticesResponse(
            now, true, "TTC Live Alerts", List.of(), List.of()
        );
        when(service.getSurfaceNotices(null, null, null)).thenReturn(dummyResponse);

        SurfaceServiceNoticesResponse response = controller.surfaceNotices("ttc", null, null, null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.generatedAt()).isEqualTo(now);
        verify(service).getSurfaceNotices(null, null, null);
    }

    @Test
    void noticesWithParametersCallsService() {
        OffsetDateTime now = OffsetDateTime.now();
        SurfaceServiceNoticesResponse dummyResponse = new SurfaceServiceNoticesResponse(
            now, true, "TTC Live Alerts", List.of(), List.of()
        );
        when(service.getSurfaceNotices("bypass", "509", 50)).thenReturn(dummyResponse);

        SurfaceServiceNoticesResponse response = controller.surfaceNotices("ttc", "bypass", "509", 50);

        assertThat(response.fresh()).isTrue();
        verify(service).getSurfaceNotices("bypass", "509", 50);
    }

    @Test
    void regionalNetworkUsesRegionalNoticeService() {
        OffsetDateTime now = OffsetDateTime.now();
        SurfaceServiceNoticesResponse dummyResponse = new SurfaceServiceNoticesResponse(
            now, true, "Metrolinx GO information + marketing alerts", List.of(), List.of()
        );
        when(regionalService.getSurfaceNotices(null, null, null)).thenReturn(dummyResponse);

        SurfaceServiceNoticesResponse response = controller.surfaceNotices("regional", null, null, null);

        assertThat(response.source()).startsWith("Metrolinx");
        verify(regionalService).getSurfaceNotices(null, null, null);
    }
}
