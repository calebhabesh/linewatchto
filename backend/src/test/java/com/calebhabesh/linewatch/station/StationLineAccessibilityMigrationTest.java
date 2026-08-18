package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class StationLineAccessibilityMigrationTest {

    @Test
    void v10CompletesStationLinesAndAddsLineSpecificAccessibility() throws IOException {
        String sql = migrationSql("/db/migration/V10__station_line_accessibility.sql");

        assertThat(sql).contains("add column wheelchair_accessible");
        assertThat(sql).contains("add column has_elevator");
        assertThat(sql).contains("on conflict (station_id, line_id) do update");
        assertThat(sql).contains("('spadina', 'line-1', 'Northbound / Southbound', 1, false, false)");
        assertThat(sql).contains("('spadina', 'line-2', 'Eastbound / Westbound', 2, true, true)");
        assertThat(sql).contains("('kipling', 'line-2'");
        assertThat(sql).contains("('don-mills', 'line-4'");
        assertThat(sql).contains("('mount-dennis', 'line-5'");
        assertThat(sql).contains("('humber-college', 'line-6'");
        assertThat(sql.lines()
            .filter(line -> line.stripLeading().startsWith("('"))
            .count()).isEqualTo(117);
    }

    @Test
    void v67AddsStationWashroomsAndParkingAmenities() throws IOException {
        String sql = migrationSql("/db/migration/V67__station_amenities_washrooms_and_parking.sql");

        assertThat(sql).contains("add column has_washroom");
        assertThat(sql).contains("add column has_parking");
        assertThat(sql).contains("'vaughan-metropolitan-centre'");
        assertThat(sql).contains("'union'");
        assertThat(sql).contains("'finch'");
        assertThat(sql).contains("'wilson'");
        assertThat(sql).contains("'kipling'");
    }

    @Test
    void v68CorrectsStationWashroomsAndParkingAmenities() throws IOException {
        String sql = migrationSql("/db/migration/V68__correct_station_amenities_washrooms_and_parking.sql");

        assertThat(sql).contains("update stations set has_washroom = false, has_parking = false");
        assertThat(sql).contains("'bloor-yonge'");
        assertThat(sql).contains("'cedarvale'");
        assertThat(sql).contains("'humber-college'");
        assertThat(sql).contains("'mount-dennis'");
        assertThat(sql).contains("'finch'");
        assertThat(sql).contains("'finch-west'");
        assertThat(sql).contains("'highway-407'");
        assertThat(sql).contains("'wilson'");
        assertThat(sql).contains("'kipling'");
        assertThat(sql).doesNotContain("'union'");
    }

    @Test
    void v69AddsExpandedStationAmenities() throws IOException {
        String sql = migrationSql("/db/migration/V69__expanded_station_amenities.sql");

        assertThat(sql).contains("add column if not exists has_bicycle_lockup");
        assertThat(sql).contains("add column if not exists has_bicycle_repair");
        assertThat(sql).contains("add column if not exists has_bike_share");
        assertThat(sql).contains("add column if not exists has_ppudo");
        assertThat(sql).contains("'cedarvale'");
        assertThat(sql).contains("'mount-dennis'");
        assertThat(sql).contains("'highway-407'");
        assertThat(sql).contains("'don-valley'");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
