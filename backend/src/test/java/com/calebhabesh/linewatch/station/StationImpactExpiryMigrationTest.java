package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class StationImpactExpiryMigrationTest {

    @Test
    void v5RemainsStableForAlreadyAppliedJaneOssingtonCleanup() throws IOException {
        String sql = migrationSql("/db/migration/V5__remove_expired_station_impacts.sql");

        assertThat(sql).contains("impact-jane-suspension");
        assertThat(sql).contains("impact-ossington-suspension");
        assertThat(sql).doesNotContain("impact-finch-suspension");
        assertThat(sql).doesNotContain("impact-york-mills-suspension");
        assertThat(sql).doesNotContain("impact-eglinton-suspension");
        assertThat(sql).doesNotContain("impact-sherbourne-delay");
        assertThat(sql).doesNotContain("impact-castle-frank-delay");
        assertThat(sql).doesNotContain("impact-union-weekend");
        assertThat(sql).doesNotContain("impact-kipling-weekend");
        assertThat(sql).contains("delete from station_impacts");
    }

    @Test
    void v6RemovesRemainingSeededServiceImpactsFromVisibleStationData() throws IOException {
        String sql = migrationSql("/db/migration/V6__remove_remaining_seeded_station_impacts.sql");

        assertThat(sql).contains("impact-finch-suspension");
        assertThat(sql).contains("impact-york-mills-suspension");
        assertThat(sql).contains("impact-eglinton-suspension");
        assertThat(sql).contains("impact-sherbourne-delay");
        assertThat(sql).contains("impact-castle-frank-delay");
        assertThat(sql).contains("impact-union-weekend");
        assertThat(sql).contains("impact-kipling-weekend");
        assertThat(sql).contains("delete from station_impacts");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
