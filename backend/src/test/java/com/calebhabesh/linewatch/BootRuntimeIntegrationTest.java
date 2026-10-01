package com.calebhabesh.linewatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.dashboard.DashboardResponses;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;
import tools.jackson.databind.ObjectMapper;

class BootRuntimeIntegrationTest {
    @Test
    void bootStartsWithMigrationsAndPreservesJsonSessionsAndManagementIsolation() throws Exception {
        String url = setting("spring.datasource.url", "SPRING_DATASOURCE_URL",
            "jdbc:postgresql://127.0.0.1:5434/linewatch_test");
        String username = setting("spring.datasource.username", "SPRING_DATASOURCE_USERNAME", "linewatch");
        String password = setting("spring.datasource.password", "SPRING_DATASOURCE_PASSWORD", "linewatch_dev_password");
        try (var connection = DriverManager.getConnection(url, username, password)) {
            assertThat(connection.isValid(1)).isTrue();
        } catch (java.sql.SQLException exception) {
            Assumptions.abort("PostgreSQL test database is unavailable");
        }

        // A separate schema keeps application runners and account writes out of other tests' data.
        String schema = "boot_runtime_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(url, username, password);
             var statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
            try (var context = new SpringApplicationBuilder(LinewatchApplication.class).run(
                "--server.port=0", "--management.server.port=0",
                "--spring.datasource.url=" + url + (url.contains("?") ? "&" : "?") + "currentSchema=" + schema + ",public",
                "--spring.datasource.username=" + username, "--spring.datasource.password=" + password,
                "--spring.flyway.default-schema=" + schema,
                "--spring.jpa.properties.hibernate.default_schema=" + schema,
                "--linewatch.ingestion.alerts.enabled=false", "--linewatch.ingestion.metrolinx.enabled=false",
                "--linewatch.arrivals.enabled=false", "--linewatch.arrivals.gtfs-import-enabled=false",
                "--linewatch.arrivals.gtfs-refresh-enabled=false", "--linewatch.regional.arrivals.enabled=false",
                "--linewatch.regional.arrivals.schedule-enabled=false", "--linewatch.regional.train-markers.enabled=false",
                "--linewatch.surface-arrivals.ttc-enabled=false", "--linewatch.surface-arrivals.regional-enabled=false",
                "--linewatch.station-notices.monitor.enabled=false", "--linewatch.performance.ttc.enabled=false",
                "--linewatch.push.enabled=false", "--linewatch.maintenance.cleanup.enabled=false",
                "--linewatch.cache.dashboard.enabled=false", "--linewatch.auth.rate-limit.enabled=false"
            ); var client = HttpClient.newHttpClient()) {
                int port = ((ServletWebServerApplicationContext) context).getWebServer().getPort();
                String base = "http://127.0.0.1:" + port;
                ObjectMapper mapper = context.getBean(ObjectMapper.class);

                var health = get(client, base + "/api/health", null);
                assertThat(health.statusCode()).isEqualTo(200);
                assertThat(mapper.readTree(health.body()).path("status").asText()).isEqualTo("ok");
                assertThat(get(client, base + "/actuator/health", null).statusCode()).isEqualTo(404);
                int managementPort = context.getEnvironment().getRequiredProperty("local.management.port", Integer.class);
                assertThat(get(client, "http://127.0.0.1:" + managementPort + "/actuator/prometheus", null).statusCode())
                    .isEqualTo(200);

                var dashboard = get(client, base + "/api/dashboard", null);
                assertThat(dashboard.statusCode()).isEqualTo(200);
                assertThat(mapper.readTree(dashboard.body()).path("networkId").asText()).isEqualTo("ttc");
                assertThat(mapper.readTree(dashboard.body()).path("availability").asText()).isEqualTo("unavailable");
                assertThat(mapper.readTree(dashboard.body()).path("status").path("generatedAt").path("live").asBoolean()).isFalse();
                assertThat(dashboard.body()).doesNotContain("rawPayload");

                // Read a pre-upgrade cache shape and keep ISO timestamps/null fields on the wire.
                var details = mapper.readValue("{\"replacementService\":null,\"maximumDelayMinutes\":5,"
                    + "\"publishedAt\":\"2026-06-01T12:00:00Z\"}", DashboardResponses.IncidentDetails.class);
                assertThat(details.publishedAt()).isEqualTo(OffsetDateTime.parse("2026-06-01T12:00:00Z"));
                assertThat(mapper.writeValueAsString(details)).contains("\"replacementService\":null",
                    "\"publishedAt\":\"2026-06-01T12:00:00Z\"");

                assertThat(get(client, base + "/api/account/stations", null).statusCode()).isEqualTo(401);
                var malformed = client.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/login"))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString("{"))
                    .build(), HttpResponse.BodyHandlers.ofString());
                assertThat(malformed.statusCode()).isEqualTo(400);
                var demo = client.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/demo"))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
                assertThat(demo.statusCode()).isEqualTo(200);
                assertThat(mapper.readTree(demo.body()).path("authenticated").asBoolean()).isTrue();
                String cookie = demo.headers().firstValue("set-cookie").orElseThrow().split(";", 2)[0];
                assertThat(get(client, base + "/api/account/stations", cookie).statusCode()).isEqualTo(200);
                var logout = client.send(HttpRequest.newBuilder(URI.create(base + "/api/auth/logout"))
                    .header("Cookie", cookie).POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
                assertThat(logout.statusCode()).isEqualTo(200);
                assertThat(get(client, base + "/api/account/stations", cookie).statusCode()).isEqualTo(401);
            } finally {
                statement.execute("DROP SCHEMA " + schema + " CASCADE");
            }
        }
    }

    private HttpResponse<String> get(HttpClient client, String url, String cookie) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10));
        if (cookie != null) request.header("Cookie", cookie);
        return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private String setting(String property, String environment, String fallback) {
        return System.getProperty(property, System.getenv().getOrDefault(environment, fallback));
    }
}
