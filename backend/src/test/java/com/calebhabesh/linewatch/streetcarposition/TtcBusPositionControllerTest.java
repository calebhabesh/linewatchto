package com.calebhabesh.linewatch.streetcarposition;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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

class TtcBusPositionControllerTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-11-03T13:00:00Z");
    private final TtcBusPositionService service = mock(TtcBusPositionService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new TtcBusPositionController(service)).build();

    private static BusPositionResponses.PositionsResponse live() {
        return new BusPositionResponses.PositionsResponse("ttc", "live", "TTC GTFS-RT vehicle positions", NOW,
            NOW.minusSeconds(20), 120, 120, 300, 15,
            List.of(new BusPositionResponses.Vehicle("6725", "503", "Kingston Rd",
                "East - 503 Kingston Rd Replacement Bus towards Victoria Park", 43.66, -79.33, 90.0,
                NOW.minusSeconds(25), 25, false, true)));
    }

    @Test
    void servesBusesInTheRequestedAreaUncached() throws Exception {
        when(service.positions(any())).thenReturn(live());

        mvc.perform(get("/api/surface/buses/positions").param("bbox", "-79.42,43.63,-79.30,43.70"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.state").value("live"))
            .andExpect(jsonPath("$.vehicles[0].vehicleId").value("6725"))
            .andExpect(jsonPath("$.vehicles[0].replacement").value(true));
        verify(service).positions(new BusPositionResponses.Bounds(-79.42, 43.63, -79.30, 43.70));
    }

    @Test
    void withoutAnAreaServesEveryBus() throws Exception {
        when(service.positions(isNull())).thenReturn(live());

        mvc.perform(get("/api/surface/buses/positions")).andExpect(status().isOk());
        verify(service).positions(null);
    }

    @Test
    void aMalformedAreaIsRejectedWithoutReadingPositions() throws Exception {
        mvc.perform(get("/api/surface/buses/positions").param("bbox", "-79.3,43.7,-79.4,43.6"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/surface/buses/positions").param("bbox", "west,south,east,north"))
            .andExpect(status().isBadRequest());
        verify(service, never()).positions(any());
    }
}
