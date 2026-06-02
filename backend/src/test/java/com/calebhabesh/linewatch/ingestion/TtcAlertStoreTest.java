package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.test.util.ReflectionTestUtils;

class TtcAlertStoreTest {

    @Test
    void appendsSnapshotOnlyForNewOrChangedFingerprint() {
        assertThat(TtcAlertStore.shouldAppendSnapshot(null, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendSnapshot("old", "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendSnapshot("same", "same")).isFalse();
    }

    @Test
    void appendsActiveSnapshotWhenUnchangedAlertReactivates() {
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot(null, null, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot("old", true, "new")).isTrue();
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot("same", false, "same")).isTrue();
        assertThat(TtcAlertStore.shouldAppendActiveSnapshot("same", true, "same")).isFalse();
    }

    @Test
    void buildsSectionQualifiedSourceKey() {
        TtcFetchedRecord fetched = new TtcFetchedRecord(
            TestAlertRecords.route("route-source"),
            "{\"id\":\"route-source\"}"
        );

        assertThat(TtcAlertStore.sourceKey("routes", fetched))
            .isEqualTo("routes:route-source");
    }

    @Test
    void buildsDeterministicFallbackKeyWhenSourceIdIsMissing() {
        String rawPayload = "{\"route\":\"1\"}";
        TtcFetchedRecord fetched = new TtcFetchedRecord(
            TestAlertRecords.route(null),
            rawPayload
        );

        assertThat(TtcAlertStore.sourceKey("routes", fetched))
            .isEqualTo("routes:missing-" + AlertFingerprint.sha256(rawPayload));
    }

    @Test
    void storesNormalizedDirectionWireValue() {
        MapSqlParameterSource params = ReflectionTestUtils.invokeMethod(
            new TtcAlertStore(null),
            "routeAlertParams",
            TestAlertRecords.normalizedRoute("route-source", AlertDirection.SOUTHBOUND),
            OffsetDateTime.parse("2026-06-01T12:00:00Z")
        );

        assertThat(params.getValue("direction")).isEqualTo("southbound");
    }
}
