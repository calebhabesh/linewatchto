package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class AccountSchemaMigrationTest {

    @Test
    void v18CreatesAccountsSessionsAndSavedCommutes() throws IOException {
        String sql = migrationSql("/db/migration/V18__account_auth_and_saved_commutes.sql");

        assertThat(sql).contains("create table accounts");
        assertThat(sql).contains("email varchar(320) not null unique");
        assertThat(sql).contains("password_hash varchar(255) not null");
        assertThat(sql).contains("demo boolean not null default false");
        assertThat(sql).contains("create table user_sessions");
        assertThat(sql).contains("token_hash varchar(64) not null unique");
        assertThat(sql).contains("expires_at timestamp with time zone not null");
        assertThat(sql).contains("create table saved_commutes");
        assertThat(sql).contains("origin_station_id varchar(80) not null references stations(id)");
        assertThat(sql).contains("destination_station_id varchar(80) not null references stations(id)");
        assertThat(sql).contains("unique (account_id, origin_station_id, destination_station_id)");
        assertThat(sql).contains("origin_station_id <> destination_station_id");
        assertThat(sql).contains("idx_user_sessions_expires_at");
        assertThat(sql).contains("idx_saved_commutes_account_id");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
