package com.calebhabesh.linewatch.announcement;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class TtcAnnouncementSchemaMigrationTest {
    @Test
    void migrationCreatesInformationalAnnouncementStore() throws Exception {
        String migration = Files.readString(Path.of("src/main/resources/db/migration/V57__ttc_announcements.sql"));

        assertThat(migration).contains("create table ttc_announcements");
        assertThat(migration).contains("scope in ('site-wide', 'general')");
    }
}
