package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class SurfaceServiceNoticeSchemaMigrationTest {

    @Test
    void directionColumnIsAddedByFollowupMigrationNotEditedIntoV25() throws Exception {
        String v25 = Files.readString(Path.of("src/main/resources/db/migration/V25__surface_service_notices.sql"));
        String v26 = Files.readString(Path.of("src/main/resources/db/migration/V26__surface_service_notice_direction.sql"));

        assertThat(v25).doesNotContain("direction varchar(160)");
        assertThat(v26).contains("alter table surface_service_notices");
        assertThat(v26).contains("add column direction varchar(160)");
    }
}
