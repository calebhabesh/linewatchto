package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TtcSubwayClosureSchemaMigrationTest {
    @Test
    void allowsWebsiteClosuresAndExistingAnnouncementSectionsInRawStaging() throws Exception {
        String migration = Files.readString(Path.of(
            "src/main/resources/db/migration/V73__ttc_subway_closure_source.sql"
        ));

        assertThat(migration)
            .contains("'subway-closures'")
            .contains("'site-wide-announcements'")
            .contains("'general-announcements'")
            .contains("ttc_subway_closure_supplement_available")
            .contains("ttc_subway_closure_records_fetched");
    }
}
