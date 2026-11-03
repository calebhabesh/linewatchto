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

class GoBusStopDepartureControllerTest {
    private final GoBusStopDepartureService service = mock(GoBusStopDepartureService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new GoBusStopDepartureController(service)).build();

    @Test
    void unknownStopIsNotFound() throws Exception {
        when(service.departures("1")).thenReturn(Optional.empty());
        mvc.perform(get("/api/regional/bus-stops/1/departures")).andExpect(status().isNotFound());
    }

    @Test
    void departuresCarryTheirStatus() throws Exception {
        OffsetDateTime now = OffsetDateTime.parse("2026-11-03T14:00:00Z");
        when(service.departures("00008")).thenReturn(Optional.of(new GoBusStopResponses.StopDeparturesResponse(
            "regional", "00008", "Yonge St. @ Sheppard Ave.", List.of("19"), "available", null, now, now,
            GoBusStopDepartureService.SOURCE, 120,
            List.of(new GoBusStopResponses.DepartureResponse("19", "Mississauga / North York", "Square One", 10,
                now.plusMinutes(10), null, now.plusMinutes(10), "", "19001", "scheduled")))));
        mvc.perform(get("/api/regional/bus-stops/00008/departures"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.networkId").value("regional"))
            .andExpect(jsonPath("$.departures[0].status").value("scheduled"))
            .andExpect(jsonPath("$.departures[0].predictedAt").doesNotExist());
    }
}
