package com.calebhabesh.linewatch.alert;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class PlannedClosureDtoJsonTest {
    @Test
    void keepsInternalNotificationTitleOutOfPlannedClosureJson() throws Exception {
        AlertDashboardService.PlannedClosureDto closure = new AlertDashboardService.PlannedClosureDto(
            "ttc-route-200",
            "line-1",
            "1",
            "Expanded display title",
            "Weekend",
            "Finch to Eglinton",
            null,
            "No subway service this weekend.",
            null,
            null,
            List.of(),
            false,
            "TTC Service Advisory",
            null,
            null,
            false,
            "upcoming",
            true,
            null,
            null,
            null,
            null,
            null,
            null,
            "11:00 PM – 5:00 AM",
            "Sat, Jun 6 – Sun, Jun 7",
            "Concise notification title"
        );

        String json = JsonMapper.builder().findAndAddModules().build().writeValueAsString(closure);

        assertThat(json).contains("Expanded display title");
        assertThat(json).doesNotContain("notificationTitle", "Concise notification title");
    }

}
