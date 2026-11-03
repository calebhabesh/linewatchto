package com.calebhabesh.linewatch.surfacearrival;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TtcSurfaceStopArrivalControllerTest {
    private final TtcSurfaceStopArrivalService service = mock(TtcSurfaceStopArrivalService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new TtcSurfaceStopArrivalController(service)).build();

    @Test
    void unknownStopCodeIsNotFound() throws Exception {
        when(service.arrivals("1")).thenReturn(Optional.empty());
        mvc.perform(get("/api/surface/stops/1/arrivals")).andExpect(status().isNotFound());
    }

    @Test
    void stopMissingFromTheCurrentScheduleIsAnExplicitResponse() throws Exception {
        when(service.arrivals("15100")).thenReturn(Optional.of(new TtcSurfaceStopResponses.StopArrivalsResponse(
            "ttc", "15100", "15100", "Queen St East at Broadview Ave", null, null, null, "not-in-schedule",
            "This stop is not in the current TTC schedule.", OffsetDateTime.parse("2026-11-02T18:00:00Z"), 120,
            new TtcSurfaceStopResponses.LiveSource("live", null, 120, "TTC"),
            new TtcSurfaceStopResponses.ScheduleSource("unavailable", null, null, "TTC"), List.of())));
        mvc.perform(get("/api/surface/stops/15100/arrivals"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.availability").value("not-in-schedule"))
            .andExpect(jsonPath("$.routes").isEmpty());
    }
}
