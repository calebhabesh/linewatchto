package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class RapidTransitStationAliasCoverageTest {

    @Test
    void aliasesCoverEveryMappedStationLinePair() throws IOException {
        Set<String> keys = new HashSet<>();
        try (var input = getClass().getResourceAsStream("/arrival/rapid-transit-station-aliases.csv")) {
            assertThat(input).isNotNull();
            try (var reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                String header = reader.readLine();
                assertThat(header).isEqualTo("station_id,line_id,aliases");
                String line;
                while ((line = reader.readLine()) != null) {
                    String[] parts = line.split(",", 3);
                    assertThat(parts).hasSize(3);
                    assertThat(parts[2]).isNotBlank();
                    keys.add(parts[0] + "|" + parts[1]);
                }
            }
        }

        assertThat(keys).hasSize(117);
        assertThat(keys).contains(
            "vaughan-metropolitan-centre|line-1",
            "spadina|line-1",
            "spadina|line-2",
            "st-george|line-1",
            "st-george|line-2",
            "union|line-1",
            "bloor-yonge|line-1",
            "bloor-yonge|line-2",
            "sheppard-yonge|line-1",
            "sheppard-yonge|line-4",
            "kennedy|line-2",
            "kennedy|line-5",
            "mount-dennis|line-5",
            "humber-college|line-6",
            "finch-west|line-6"
        );
    }
}
