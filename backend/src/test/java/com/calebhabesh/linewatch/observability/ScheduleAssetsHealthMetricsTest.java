package com.calebhabesh.linewatch.observability;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.health.ScheduleAssetsHealthController;
import com.calebhabesh.linewatch.scheduleassets.ScheduleAssetsVolume;
import com.calebhabesh.linewatch.surfacearrival.GoBusStopCatalog;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ScheduleAssetsHealthMetricsTest {
    @TempDir
    Path volume;

    /** The Nov. 18, 2026 state: GO failing at generate twice, its published files ending Nov. 27. */
    private static final String MANIFEST = """
        {"generation":"e62d8014a768fc04","publishedAt":"2026-11-05T18:44:39Z","networks":{
          "ttc":{"origin":"runtime","feedVersion":"S1000544","feedEndDate":"2026-12-19","files":{}},
          "go":{"origin":"runtime","feedVersion":"20261104201520","feedEndDate":"2026-11-27","files":{}}}}
        """;
    private static final String STATUS = """
        {"startedAt":"2026-11-05T18:40:00Z","networks":{
          "ttc":{"enabled":true,"intervalSeconds":3600,"state":"ok","lastSuccessAt":"2026-11-18T05:07:21Z","consecutiveFailures":0},
          "go":{"enabled":true,"intervalSeconds":21600,"state":"failing","lastSuccessAt":"2026-11-17T14:06:45Z",
                "lastFailure":{"stage":"generate"},"consecutiveFailures":2}}}
        """;

    private ScheduleAssetsHealthMetrics metrics(String dir, String now) {
        Clock clock = Clock.fixed(Instant.parse(now), ZoneOffset.UTC);
        var metrics = new ScheduleAssetsHealthMetrics(
            new ScheduleAssetsHealthController(new ScheduleAssetsVolume(dir), new GoBusStopCatalog(), clock), clock);
        metrics.bindTo(new SimpleMeterRegistry());
        return metrics;
    }

    @Test
    void reportsTheWorstNetwork() throws IOException {
        Files.writeString(volume.resolve("manifest.json"), MANIFEST);
        Files.writeString(volume.resolve("status.json"), STATUS);
        // Days count from the Toronto date: 05:30 UTC is 00:30 Nov. 18 there, 04:30 UTC still Nov. 17.
        var metrics = metrics(volume.toString(), "2026-11-18T05:30:00Z");
        assertThat(metrics.consecutiveFailures()).isEqualTo(2.0);
        assertThat(metrics.stale()).isEqualTo(0.0);
        assertThat(metrics.feedDaysRemaining()).isEqualTo(9.0);
        assertThat(metrics(volume.toString(), "2026-11-18T04:30:00Z").feedDaysRemaining()).isEqualTo(10.0);
    }

    @Test
    void reportsStaleWhenANetworkStopsSucceeding() throws IOException {
        Files.writeString(volume.resolve("manifest.json"), MANIFEST);
        Files.writeString(volume.resolve("status.json"), STATUS);
        // GO's last success is over three 6 h intervals old.
        assertThat(metrics(volume.toString(), "2026-11-18T08:07:00Z").stale()).isEqualTo(1.0);
    }

    @Test
    void readsNaNWithoutAVolumeOrManifest() {
        for (String dir : new String[] {"", volume.toString()}) {
            var metrics = metrics(dir, "2026-11-18T05:30:00Z");
            assertThat(metrics.consecutiveFailures()).isNaN();
            assertThat(metrics.stale()).isNaN();
            assertThat(metrics.feedDaysRemaining()).isNaN();
        }
    }
}
