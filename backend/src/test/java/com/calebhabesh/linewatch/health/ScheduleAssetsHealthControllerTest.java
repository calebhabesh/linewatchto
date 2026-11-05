package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.scheduleassets.ScheduleAssetsVolume;
import com.calebhabesh.linewatch.surfacearrival.GoBusStopCatalog;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ScheduleAssetsHealthControllerTest {
    @TempDir
    Path volume;

    private static final String MANIFEST = """
        {"schemaVersion":"1.0.0","generation":"e62d8014a768fc04","publishedAt":"2026-11-05T17:26:57Z","networks":{
          "ttc":{"origin":"runtime","feedVersion":"S1000544","feedStartDate":"2026-11-01","feedEndDate":"2026-12-19","publishedAt":"2026-11-05T17:26:55Z","files":{}},
          "go":{"origin":"runtime","feedVersion":"20261104201520","feedStartDate":"2026-11-04","feedEndDate":"2026-11-27","publishedAt":"2026-11-05T17:26:57Z","files":{}}}}
        """;

    private static String status(String ttcSuccess, String ttcState, String goSuccess) {
        return """
            {"startedAt":"2026-11-05T17:00:00Z","networks":{
              "ttc":{"enabled":true,"intervalSeconds":3600,"state":"%s","lastCheckAt":"2026-11-05T18:00:00Z","lastSuccessAt":%s,
                     "lastFailureAt":"2026-11-05T18:00:00Z","lastFailure":{"stage":"download","message":"ckan0 answered 503 at /secret"},"consecutiveFailures":1},
              "go":{"enabled":true,"intervalSeconds":21600,"state":"ok","lastSuccessAt":%s,"consecutiveFailures":0}}}
            """.formatted(ttcState, ttcSuccess == null ? "null" : "\"" + ttcSuccess + "\"", goSuccess == null ? "null" : "\"" + goSuccess + "\"");
    }

    private ScheduleAssetsHealthController controller(String now) {
        return new ScheduleAssetsHealthController(new ScheduleAssetsVolume(volume.toString()), new GoBusStopCatalog(),
            Clock.fixed(Instant.parse(now), ZoneOffset.UTC));
    }

    @Test
    void reportsDisabledWithoutAVolume() {
        var response = new ScheduleAssetsHealthController(new ScheduleAssetsVolume(""), new GoBusStopCatalog(),
            Clock.systemUTC()).health();
        assertThat(response.status()).isEqualTo("disabled");
        assertThat(response.goBusStops().origin()).isEqualTo("bundled");
    }

    @Test
    void reportsUnavailableBeforeTheFirstManifest() {
        assertThat(controller("2026-11-05T18:00:00Z").health().status()).isEqualTo("unavailable");
    }

    @Test
    void reportsFeedsPerNetworkAndAFailingCheckWithoutItsMessage() throws IOException {
        Files.writeString(volume.resolve("manifest.json"), MANIFEST);
        Files.writeString(volume.resolve("status.json"), status("2026-11-05T17:00:00Z", "failing", "2026-11-05T17:26:57Z"));
        var response = controller("2026-11-05T18:05:00Z").health();
        assertThat(response.status()).isEqualTo("failing");
        assertThat(response.generation()).isEqualTo("e62d8014a768fc04");
        var ttc = response.networks().get(0);
        assertThat(ttc.network()).isEqualTo("ttc");
        assertThat(ttc.state()).isEqualTo("failing");
        assertThat(ttc.feedVersion()).isEqualTo("S1000544");
        assertThat(ttc.feedEndDate()).isEqualTo("2026-12-19");
        assertThat(ttc.lastFailureStage()).isEqualTo("download");
        assertThat(response.toString()).doesNotContain("secret").doesNotContain("503");
        assertThat(response.networks().get(1).state()).isEqualTo("ok");
    }

    @Test
    void marksANetworkStaleAfterThreeIntervalsWithoutASuccessfulCheck() throws IOException {
        Files.writeString(volume.resolve("manifest.json"), MANIFEST);
        Files.writeString(volume.resolve("status.json"), status("2026-11-05T14:00:00Z", "ok", "2026-11-05T14:00:00Z"));
        var response = controller("2026-11-05T17:01:00Z").health();
        assertThat(response.networks().get(0).state()).isEqualTo("stale");
        assertThat(response.networks().get(1).state()).isEqualTo("ok");
        assertThat(response.status()).isEqualTo("stale");
    }

    @Test
    void waitsForTheFirstChecksAfterStart() throws IOException {
        Files.writeString(volume.resolve("manifest.json"), MANIFEST);
        Files.writeString(volume.resolve("status.json"), status(null, "ok", null));
        var response = controller("2026-11-05T17:05:00Z").health();
        assertThat(response.status()).isEqualTo("pending");
        assertThat(response.networks().get(0).origin()).isEqualTo("runtime");
    }
}
