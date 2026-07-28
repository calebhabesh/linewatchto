package com.calebhabesh.linewatch.accessibility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.*;
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
import com.calebhabesh.linewatch.regional.RegionalAccessibilityOutageService;

@ExtendWith(MockitoExtension.class)
class AccessibilityOutageControllerTest {

    @Mock
    private AccessibilityOutageService service;

    @Mock
    private DashboardCacheService cache;

    @Mock
    private DashboardCacheProperties cacheProperties;

    @Mock
    private RegionalAccessibilityOutageService regionalService;

    @InjectMocks
    private AccessibilityOutageController controller;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
            java.util.function.Supplier<?> supplier = invocation.getArgument(3);
            return supplier.get();
        });
    }

    @Test
    void outagesReturnsResponse() {
        OffsetDateTime now = OffsetDateTime.now();
        AccessibilityOutagesResponse dummyResponse = new AccessibilityOutagesResponse(
            now, true, "TTC Live Alerts", List.of(), List.of()
        );
        when(service.getAccessibilityOutages(null)).thenReturn(dummyResponse);

        AccessibilityOutagesResponse response = controller.outages(null, "ttc");

        assertThat(response.fresh()).isTrue();
        assertThat(response.generatedAt()).isEqualTo(now);
        verify(service).getAccessibilityOutages(null);
    }

    @Test
    void outagesWithAssetCallsServiceWithFilter() {
        OffsetDateTime now = OffsetDateTime.now();
        AccessibilityOutagesResponse dummyResponse = new AccessibilityOutagesResponse(
            now, true, "TTC Live Alerts", List.of(), List.of()
        );
        when(service.getAccessibilityOutages("escalator")).thenReturn(dummyResponse);

        AccessibilityOutagesResponse response = controller.outages("escalator", "ttc");

        assertThat(response.fresh()).isTrue();
        verify(service).getAccessibilityOutages("escalator");
    }

    @Test
    void regionalNetworkUsesTheRegionalReadService() {
        OffsetDateTime now = OffsetDateTime.now();
        AccessibilityOutagesResponse dummyResponse = new AccessibilityOutagesResponse(
            now, true, "Metrolinx Open API", List.of(), List.of()
        );
        when(regionalService.getAccessibilityOutages(null)).thenReturn(dummyResponse);

        AccessibilityOutagesResponse response = controller.outages(null, "regional");

        assertThat(response.source()).isEqualTo("Metrolinx Open API");
        verify(regionalService).getAccessibilityOutages(null);
    }
}
