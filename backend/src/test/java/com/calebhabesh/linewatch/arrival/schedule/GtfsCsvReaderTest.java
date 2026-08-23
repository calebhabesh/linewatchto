package com.calebhabesh.linewatch.arrival.schedule;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.StringReader;
import java.util.ArrayList;
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
    void stripsByteOrderMarkFromFirstHeader() throws Exception {
        String csv = "\uFEFFtrip_id,route_id,service_id\n50494471,1,1\n";

        List<GtfsCsvReader.Row> rows = GtfsCsvReader.read(new StringReader(csv));

        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().value("trip_id")).isEqualTo("50494471");
        assertThat(rows.getFirst().value("route_id")).isEqualTo("1");
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
        assertThat(GtfsCsvReader.normalizeStationName("Aga Khan Park & Museum Station"))
            .isEqualTo(GtfsCsvReader.normalizeStationName("Aga Khan Park and Museum"));
    }

    @Test
    void streamsRowsToTheConsumerWithoutReturningACollection() throws Exception {
        String csv = """
            trip_id,stop_id,stop_sequence
            L1_A,UNION_N,1
            L1_A,KING_N,2
            """;
        List<String> observed = new ArrayList<>();

        GtfsCsvReader.forEachRow(
            new StringReader(csv),
            row -> observed.add(row.value("trip_id") + ":" + row.value("stop_id"))
        );

        assertThat(observed).containsExactly("L1_A:UNION_N", "L1_A:KING_N");
    }

    @Test
    void streamingReaderStripsTheByteOrderMark() throws Exception {
        String csv = "\uFEFFtrip_id,stop_id\nL1_A,UNION_N\n";
        List<String> observed = new ArrayList<>();

        GtfsCsvReader.forEachRow(
            new StringReader(csv),
            row -> observed.add(row.value("trip_id"))
        );

        assertThat(observed).containsExactly("L1_A");
    }
}
