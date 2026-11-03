package com.calebhabesh.linewatch.streetcarposition;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TtcStreetcarPositionControllerTest {
    private final TtcStreetcarPositionService service = mock(TtcStreetcarPositionService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new TtcStreetcarPositionController(service)).build();

    @Test
    void servesPositionsUncached() throws Exception {
        OffsetDateTime now = OffsetDateTime.parse("2026-11-02T22:00:00Z");
        when(service.positions()).thenReturn(new StreetcarPositionResponses.PositionsResponse(
            "ttc", "live", "TTC GTFS-RT vehicle positions", now, now.minusSeconds(20), 120, 120, 300, 15,
            List.of(new StreetcarPositionResponses.Vehicle("4508", "504", "King",
                "East - 504 King towards Broadview Station", 43.6445, -79.399, 90.0, now.minusSeconds(44), 44, false))));

        mvc.perform(get("/api/surface/streetcars/positions"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.state").value("live"))
            .andExpect(jsonPath("$.vehicles[0].vehicleId").value("4508"))
            .andExpect(jsonPath("$.vehicles[0].ageSeconds").value(44))
            .andExpect(jsonPath("$.vehicles[0].nextStop").doesNotExist());
    }
}
