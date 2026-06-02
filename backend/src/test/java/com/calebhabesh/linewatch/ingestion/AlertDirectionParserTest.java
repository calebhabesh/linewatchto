package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AlertDirectionParserTest {
    private final AlertDirectionParser parser = new AlertDirectionParser();

    @Test
    void prefersStructuredDirectionWhenPresent() {
        assertThat(parser.parse(
            "Northbound",
            "Southbound trains are moving slower than usual.",
            "",
            ""
        )).isEqualTo(AlertDirection.NORTHBOUND);
    }

    @Test
    void readsTtcStructuredDirectionPhrases() {
        assertThat(parser.parse("Northbound To Vaughan", "", "", ""))
            .isEqualTo(AlertDirection.NORTHBOUND);
        assertThat(parser.parse("Southbound From Finch", "", "", ""))
            .isEqualTo(AlertDirection.SOUTHBOUND);
    }

    @Test
    void derivesSouthboundFromAlertTitle() {
        assertThat(parser.parse(
            null,
            "Synthetic scenario: reduced speed southbound between Eglinton and Davisville.",
            "",
            ""
        )).isEqualTo(AlertDirection.SOUTHBOUND);
    }

    @Test
    void usesHeaderAndDescriptionWhenEarlierFieldsAreBlank() {
        assertThat(parser.parse(null, "", "Line 2: Westbound reduced speed zone.", ""))
            .isEqualTo(AlertDirection.WESTBOUND);
        assertThat(parser.parse(null, "", "", "Eastbound trains are moving slowly."))
            .isEqualTo(AlertDirection.EASTBOUND);
    }

    @Test
    void treatsExplicitBothDirectionsAndOpposingWordsAsBidirectional() {
        assertThat(parser.parse(null, "Reduced speed zone in both directions.", "", ""))
            .isEqualTo(AlertDirection.BIDIRECTIONAL);
        assertThat(parser.parse(null, "Northbound and southbound trains are moving slowly.", "", ""))
            .isEqualTo(AlertDirection.BIDIRECTIONAL);
    }

    @Test
    void treatsStructuredBothWaysCaseInsensitivelyAsBidirectional() {
        assertThat(parser.parse("Both ways", "", "", ""))
            .isEqualTo(AlertDirection.BIDIRECTIONAL);
        assertThat(parser.parse("both ways", "", "", ""))
            .isEqualTo(AlertDirection.BIDIRECTIONAL);
    }

    @Test
    void returnsUnknownInsteadOfGuessingFromStationOrder() {
        assertThat(parser.parse(null, "Reduced speed zone from Wilson to Yorkdale.", "", ""))
            .isEqualTo(AlertDirection.UNKNOWN);
    }

    @Test
    void doesNotTreatDirectionalSubstringsAsExplicitWords() {
        assertThat(parser.parse(null, "Reduced speed zone southboundish from Eglinton.", "", ""))
            .isEqualTo(AlertDirection.UNKNOWN);
    }

    @Test
    void mapsWireValuesConservatively() {
        assertThat(AlertDirection.fromWireValue(" southbound "))
            .isEqualTo(AlertDirection.SOUTHBOUND);
        assertThat(AlertDirection.fromWireValue(null)).isEqualTo(AlertDirection.UNKNOWN);
        assertThat(AlertDirection.fromWireValue(" ")).isEqualTo(AlertDirection.UNKNOWN);
        assertThat(AlertDirection.fromWireValue("toward downtown")).isEqualTo(AlertDirection.UNKNOWN);
    }
}
