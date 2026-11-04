package com.calebhabesh.linewatch.gobusposition;

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

import com.calebhabesh.linewatch.streetcarposition.BusPositionResponses.Bounds;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class GoBusPositionControllerTest {
    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-11-03T20:00:00Z");
    private final GoBusPositionService service = mock(GoBusPositionService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new GoBusPositionController(service)).build();

    private static GoBusPositionResponses.PositionsResponse live() {
        return new GoBusPositionResponses.PositionsResponse("regional", "live", "Metrolinx GO GTFS-RT VehiclePosition",
            NOW, NOW.minusSeconds(5), 120, 300, 900, 15,
            List.of(new GoBusPositionResponses.Vehicle("2551", "20261103-41-41481", "41", "Hamilton GO", 43.26, -79.87,
                NOW.minusSeconds(25), 25, false, "01007")));
    }

    @Test
    void servesBusesInTheRequestedAreaUncached() throws Exception {
        when(service.positions(any())).thenReturn(live());

        mvc.perform(get("/api/regional/buses/positions").param("bbox", "-80.0,43.2,-79.7,43.4"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.state").value("live"))
            .andExpect(jsonPath("$.vehicles[0].route").value("41"))
            .andExpect(jsonPath("$.vehicles[0].nextStopCode").value("01007"));
        verify(service).positions(new Bounds(-80.0, 43.2, -79.7, 43.4));
    }

    @Test
    void withoutAnAreaServesEveryBus() throws Exception {
        when(service.positions(isNull())).thenReturn(live());

        mvc.perform(get("/api/regional/buses/positions")).andExpect(status().isOk());
        verify(service).positions(null);
    }

    @Test
    void aMalformedAreaIsRejectedWithoutReadingPositions() throws Exception {
        mvc.perform(get("/api/regional/buses/positions").param("bbox", "-79.3,43.7,-79.4,43.6"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/regional/buses/positions").param("bbox", "-90,43.7,-79.4,43.8"))
            .andExpect(status().isBadRequest());
        verify(service, never()).positions(any());
    }
}
