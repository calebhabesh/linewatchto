package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class SurfaceArrivalCatalogMigrationTest {
    @Test
    void createsImportScopedParentLinkedSurfaceCatalog() throws IOException {
        try (var input = getClass().getResourceAsStream(
            "/db/migration/V65__ttc_surface_arrival_catalog.sql"
        )) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("create table ttc_surface_routes");
            assertThat(sql).contains("create table ttc_surface_station_stops");
            assertThat(sql).contains("create table ttc_surface_trips");
            assertThat(sql).contains("references gtfs_schedule_imports(id) on delete cascade");
            assertThat(sql).contains("references stations(id)");
            assertThat(sql).contains("check (mode in ('bus', 'streetcar'))");
        }
    }
}
