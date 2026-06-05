package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.StringReader;
import java.util.List;
import org.junit.jupiter.api.Test;

class GtfsCsvReaderTest {

    @Test
    void readsRowsByHeaderNameAndHandlesQuotedCommas() throws Exception {
        String csv = """
            route_id,route_short_name,route_long_name
            1,1,"Yonge-University, Subway"
            """;

        List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(new StringReader(csv));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().value("route_id")).isEqualTo("1");
        assertThat(rows.getFirst().value("route_short_name")).isEqualTo("1");
        assertThat(rows.getFirst().value("route_long_name")).isEqualTo("Yonge-University, Subway");
    }

    @Test
    void parsesGtfsTimesBeyondMidnight() {
        assertThat(GtfsCsvReader.seconds("00:05:00")).isEqualTo(300);
        assertThat(GtfsCsvReader.seconds("24:10:00")).isEqualTo(87000);
        assertThat(GtfsCsvReader.seconds("25:30:15")).isEqualTo(91815);
    }

    @Test
    void normalizesStationNamesForAliasMatching() {
        assertThat(GtfsCsvReader.normalizeStationName("St. George Station")).isEqualTo("st george");
        assertThat(GtfsCsvReader.normalizeStationName("Bloor-Yonge")).isEqualTo("bloor yonge");
        assertThat(GtfsCsvReader.normalizeStationName("  Vaughan Metropolitan Centre Station  ")).isEqualTo("vaughan metropolitan centre");
        assertThat(GtfsCsvReader.normalizeStationName("Keele Station - Eastbound Platform")).isEqualTo("keele");
        assertThat(GtfsCsvReader.normalizeStationName("Vaughan Metropolitan Centre Station - Subway Platform")).isEqualTo("vaughan metropolitan centre");
    }
}
