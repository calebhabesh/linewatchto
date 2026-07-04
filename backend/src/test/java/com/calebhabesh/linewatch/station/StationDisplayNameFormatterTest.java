package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StationDisplayNameFormatterTest {

    @Test
    void formatsStationIdsWithKnownAcronyms() {
        assertThat(StationDisplayNameFormatter.fromStationId("tmu")).isEqualTo("TMU");
        assertThat(StationDisplayNameFormatter.fromStationId("bloor-yonge")).isEqualTo("Bloor Yonge");
        assertThat(StationDisplayNameFormatter.fromStationId("main_street")).isEqualTo("Main Street");
    }

    @Test
    void returnsNullForBlankNullableStationIds() {
        assertThat(StationDisplayNameFormatter.nullableFromStationId(null)).isNull();
        assertThat(StationDisplayNameFormatter.nullableFromStationId(" ")).isNull();
    }

    @Test
    void canonicalizesKnownAcronymsInPersistedDisplayText() {
        assertThat(StationDisplayNameFormatter.canonicalizeKnownStationAcronyms("Tmu station"))
            .isEqualTo("TMU station");
        assertThat(StationDisplayNameFormatter.canonicalizeKnownStationAcronyms("Delays at tmu."))
            .isEqualTo("Delays at TMU.");
        assertThat(StationDisplayNameFormatter.canonicalizeKnownStationAcronyms("St Clair West station"))
            .isEqualTo("St Clair West station");
    }
}
