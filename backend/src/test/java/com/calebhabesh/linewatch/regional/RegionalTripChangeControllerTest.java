package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalTripChangeControllerTest {
    private final RegionalTripChangeService service = mock(RegionalTripChangeService.class);
    private final RegionalTripChangeController controller = new RegionalTripChangeController(service);

    @Test
    void forwardsOptionalStationSearchAndLimitFilters() {
        RegionalTripChangeResponses.Response response = new RegionalTripChangeResponses.Response(
            OffsetDateTime.parse("2026-07-31T16:00:00Z"), true,
            "Metrolinx GO trip-change feeds", OffsetDateTime.parse("2026-07-31T15:58:00Z"), 0, List.of()
        );
        when(service.get("union", "681", 20)).thenReturn(response);

        assertThat(controller.tripChanges("union", "681", 20)).isSameAs(response);
    }
}
