package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StationDisplayNameFormatterTest {

    @Test
    void formatsStationIdsWithKnownAcronyms() {
        assertThat(StationDisplayNameFormatter.fromStationId("tmu")).isEqualTo("TMU");
        assertThat(StationDisplayNameFormatter.fromStationId("bloor-yonge")).isEqualTo("Bloor-Yonge");
        assertThat(StationDisplayNameFormatter.fromStationId("sheppard-yonge")).isEqualTo("Sheppard-Yonge");
        assertThat(StationDisplayNameFormatter.fromStationId("main_street")).isEqualTo("Main Street");
    }

    @Test
    void preservesCanonicalStationNamePunctuationAndSpelling() {
        assertThat(StationDisplayNameFormatter.fromStationId("queens-park")).isEqualTo("Queen's Park");
        assertThat(StationDisplayNameFormatter.fromStationId("st-patrick")).isEqualTo("St Patrick");
        assertThat(StationDisplayNameFormatter.fromStationId("st-andrew")).isEqualTo("St Andrew");
        assertThat(StationDisplayNameFormatter.fromStationId("st-clair-west")).isEqualTo("St Clair West");
        assertThat(StationDisplayNameFormatter.fromStationId("o_connor")).isEqualTo("O'Connor");
        assertThat(StationDisplayNameFormatter.fromStationId("aga-khan-park-and-museum"))
            .isEqualTo("Aga Khan Park & Museum");
        assertThat(StationDisplayNameFormatter.fromStationId("greenwoood")).isEqualTo("Greenwood");
        assertThat(StationDisplayNameFormatter.fromStationId("st-george")).isEqualTo("St George");
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
