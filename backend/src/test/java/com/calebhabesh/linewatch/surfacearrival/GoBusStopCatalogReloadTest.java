package com.calebhabesh.linewatch.surfacearrival;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.scheduleassets.ScheduleAssetsVolume;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Plan 16: stop departures accept the GO stops the schedule-assets service published with the map. */
class GoBusStopCatalogReloadTest {
    @TempDir
    Path volume;

    private static final String BUNDLED = """
        stop_code,name,routes
        00001,Bundled A,1
        00002,Bundled B,1
        00003,Bundled C,1
        00004,Bundled D,1
        """;

    private GoBusStopCatalog catalog() {
        return new GoBusStopCatalog(new ByteArrayInputStream(BUNDLED.getBytes(StandardCharsets.UTF_8)),
            new ScheduleAssetsVolume(volume.toString()));
    }

    private void publish(String hash, String csv) throws IOException {
        Files.createDirectories(volume.resolve("files"));
        Files.writeString(volume.resolve("files/go-bus-stops." + hash + ".csv"), csv);
        Files.writeString(volume.resolve("manifest.json"), """
            {"schemaVersion":"1.0.0","generation":"g","networks":{"go":{"origin":"runtime","feedVersion":"F%s",
            "files":{"go-bus-stops.csv":"files/go-bus-stops.%s.csv"}}}}
            """.formatted(hash, hash));
    }

    @Test
    void keepsTheBundledListUntilAListIsPublished() {
        GoBusStopCatalog catalog = catalog();
        catalog.refresh();
        assertThat(catalog.source().origin()).isEqualTo("bundled");
        assertThat(catalog.find("00001")).isPresent();
    }

    @Test
    void swapsInThePublishedListAndFollowsTheNextPublication() throws IOException {
        GoBusStopCatalog catalog = catalog();
        publish("aaaaaaaaaaaaaaaa", "stop_code,name,routes\n00001,A,1\n00002,B,1\n00005,New E,27 19\n");
        catalog.refresh();
        assertThat(catalog.source().origin()).isEqualTo("published");
        assertThat(catalog.source().feedVersion()).isEqualTo("Faaaaaaaaaaaaaaaa");
        assertThat(catalog.find("00005")).hasValueSatisfying(stop -> assertThat(stop.routes()).containsExactly("27", "19"));
        assertThat(catalog.find("00003")).isEmpty();

        publish("bbbbbbbbbbbbbbbb", "stop_code,name,routes\n00001,A,1\n00002,B,1\n00006,F,1\n");
        catalog.refresh();
        assertThat(catalog.find("00006")).isPresent();
        assertThat(catalog.find("00005")).isEmpty();
    }

    @Test
    void refusesAnEmptyOrMuchSmallerList() throws IOException {
        GoBusStopCatalog catalog = catalog();
        publish("cccccccccccccccc", "stop_code,name,routes\n");
        catalog.refresh();
        assertThat(catalog.source().origin()).isEqualTo("bundled");
        publish("dddddddddddddddd", "stop_code,name,routes\n00009,Only,1\n");
        catalog.refresh();
        assertThat(catalog.source().origin()).isEqualTo("bundled");
        assertThat(catalog.size()).isEqualTo(4);
    }

    @Test
    void ignoresAPathOutsideTheFilesDirectoryAndAnUnreadableManifest() throws IOException {
        GoBusStopCatalog catalog = catalog();
        Files.writeString(volume.resolve("secret.csv"), "stop_code,name,routes\n1,a,1\n2,b,1\n3,c,1\n");
        Files.writeString(volume.resolve("manifest.json"),
            "{\"networks\":{\"go\":{\"files\":{\"go-bus-stops.csv\":\"files/../secret.csv\"}}}}");
        catalog.refresh();
        assertThat(catalog.source().origin()).isEqualTo("bundled");
        Files.writeString(volume.resolve("manifest.json"), "{not json");
        catalog.refresh();
        assertThat(catalog.source().origin()).isEqualTo("bundled");
    }

    @Test
    void doesNothingWithoutAVolume() {
        GoBusStopCatalog catalog = new GoBusStopCatalog(new ByteArrayInputStream(BUNDLED.getBytes(StandardCharsets.UTF_8)));
        catalog.refresh();
        assertThat(catalog.size()).isEqualTo(4);
        assertThat(catalog.source().origin()).isEqualTo("bundled");
    }
}
