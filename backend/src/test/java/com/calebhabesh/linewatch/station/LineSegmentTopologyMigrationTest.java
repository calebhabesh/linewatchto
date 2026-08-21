package com.calebhabesh.linewatch.station;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class LineSegmentTopologyMigrationTest {

    @Test
    void v7ReplacesCoarseCorridorsWithAdjacentTopologyAndSvgMetadata() throws IOException {
        String sql = migrationSql("/db/migration/V7__adjacent_rapid_transit_topology.sql");

        assertThat(sql).contains("add column forward_direction");
        assertThat(sql).contains("add column guide_path_id");
        assertThat(sql).contains("add column station_a_anchor_id");
        assertThat(sql).contains("add column station_b_anchor_id");
        assertThat(sql).contains("add column guide_path_reversed");
        assertThat(sql).contains("drop constraint if exists line_segments_station_a_id_station_b_id_key");
        assertThat(sql).contains("unique (line_id, station_a_id, station_b_id)");
        assertThat(sql).contains("'eglinton', 'davisville'");
        assertThat(sql).contains("'wilson', 'yorkdale'");
        assertThat(sql).contains("'line-1-dupont-spadina'");
        assertThat(sql).contains("'seg-line-1-dupont-spadina'");
        assertThat(sql).contains("'station-spadina-1'");
        assertThat(sql).contains("'station-spadina-2'");
        assertThat(sql).contains("'line-2'");
        assertThat(sql).contains("'line-4'");
        assertThat(sql).contains("'line-5'");
        assertThat(sql).contains("'line-6'");
        assertThat(sql).contains("delete from alert_segments");
        assertThat(sql).contains("delete from line_segments");
    }

    @Test
    void v15UpdatesLineOneSpadinaGuideMetadataForEditedMapAsset() throws IOException {
        String sql = migrationSql("/db/migration/V15__update_line_1_spadina_guide_metadata.sql");

        assertThat(sql).contains("'line-1-dupont-spadina'");
        assertThat(sql).contains("set guide_path_id = null");
        assertThat(sql).contains("guide_path_reversed = false");
        assertThat(sql).contains("'line-1-spadina-st-george'");
        assertThat(sql).contains("'seg-line-1-st-george-spadina'");
        assertThat(sql).contains("'station-spadina-1'");
    }

    @Test
    void v14AddsLineSixHumberCollegeGuidePathMetadata() throws IOException {
        String sql = migrationSql("/db/migration/V14__line_6_humber_college_westmore_guide.sql");

        assertThat(sql).contains("'line-6-humber-college-westmore'");
        assertThat(sql).contains("'seg-line-6-humber-college-westmore'");
    }

    @Test
    void v71MarksTheUnionKingGuideAsOppositeTheStoredTopologyOrder() throws IOException {
        String sql = migrationSql("/db/migration/V71__correct_union_guide_direction.sql");

        assertThat(sql).contains("'line-1-king-union'");
        assertThat(sql).contains("guide_path_reversed = true");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
