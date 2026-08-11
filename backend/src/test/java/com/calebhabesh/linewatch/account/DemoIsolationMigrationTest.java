package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class DemoIsolationMigrationTest {
    @Test
    void invalidatesLegacySharedDemoState() throws Exception {
        String sql = Files.readString(Path.of("src/main/resources/db/migration/V63__isolate_demo_accounts.sql"));

        assertThat(sql).contains("delete from accounts where demo = true");
    }
}
