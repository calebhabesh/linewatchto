package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

class AccountSchemaMigrationTest {

    @Test
    void passwordResetMigrationStoresOnlyHashedTokens() throws Exception {
        String sql = Files.readString(Path.of("src/main/resources/db/migration/V19__password_reset_tokens.sql"));

        assertThat(sql).contains("create table password_reset_tokens");
        assertThat(sql).contains("token_hash varchar(64) not null unique");
        assertThat(sql).contains("account_id varchar(80) not null references accounts(id) on delete cascade");
        assertThat(sql).contains("expires_at timestamp with time zone not null");
        assertThat(sql).contains("used_at timestamp with time zone");
        assertThat(sql).contains("idx_password_reset_tokens_account_id");
        assertThat(sql).contains("idx_password_reset_tokens_expires_at");
        assertThat(sql).doesNotContain("raw_token");
    }

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

    @Test
    void v20AddsSavedCommuteReturnTripPreference() throws IOException {
        String sql = migrationSql("/db/migration/V20__saved_commute_return_trip.sql");

        assertThat(sql).contains("alter table saved_commutes");
        assertThat(sql).contains("add column watch_return_trip boolean not null default true");
    }

    private String migrationSql(String path) throws IOException {
        try (var input = getClass().getResourceAsStream(path)) {
            assertThat(input).isNotNull();
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
