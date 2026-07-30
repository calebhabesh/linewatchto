package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class AlertHistoryControllerTest {
    private final AlertHistoryService alertHistoryService = mock(AlertHistoryService.class);
    private final AlertHistoryController controller = new AlertHistoryController(alertHistoryService);

    @Test
    void returnsAlertHistory() {
        AlertHistoryResponses.AlertHistoryResponse history =
            new AlertHistoryResponses.AlertHistoryResponse(
                OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
                "today",
                OffsetDateTime.parse("2026-06-23T00:00:00-04:00"),
                OffsetDateTime.parse("2026-06-23T12:30:00-04:00"),
                List.of()
            );
        when(alertHistoryService.history("regional", "today", 5_000)).thenReturn(history);

        Object response = controller.getAlertHistory("regional", "today", 5_000);

        assertThat(response).isEqualTo(history);
    }
}
