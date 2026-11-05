package com.calebhabesh.linewatch.surfacearrival;

import com.calebhabesh.linewatch.scheduleassets.ScheduleAssetsVolume;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

/**
 * The GO bus stops the GO/UP Map View draws (plan 13, S6). Stop departures are
 * fetched only for a stop number in this list, so a request can never send an
 * arbitrary code to Metrolinx.
 *
 * Plan 16: the list is the one the schedule-assets service published with the
 * map and search files ({@code go-bus-stops.csv} in its manifest), checked every
 * minute and swapped in when it changes, so stop departures accept the same
 * stops the map draws. Until the first publication, or while the volume is
 * unreadable, it is {@code regional/go-bus-stops.csv} from the classpath,
 * written by {@code scripts/generate-go-bus-catalog.mjs} for the release. A
 * published list that is empty or under half the current one is refused.
 */
@Component
public class GoBusStopCatalog {
    private static final Logger LOGGER = LoggerFactory.getLogger(GoBusStopCatalog.class);

    public record Stop(String stopCode, String name, List<String> routes) {
    }

    /** Where the current list came from: "bundled" (classpath) or "published" (schedule-assets). */
    public record Source(String origin, String publishedPath, String feedVersion, int size) {
    }

    private record Snapshot(Map<String, Stop> stops, Source source) {
    }

    static final String RESOURCE = "/regional/go-bus-stops.csv";

    private final ScheduleAssetsVolume volume;
    private volatile Snapshot snapshot;

    public GoBusStopCatalog() {
        this(GoBusStopCatalog.class.getResourceAsStream(RESOURCE), new ScheduleAssetsVolume(""));
    }

    @Autowired
    public GoBusStopCatalog(ScheduleAssetsVolume volume) {
        this(GoBusStopCatalog.class.getResourceAsStream(RESOURCE), volume);
        refresh();
    }

    GoBusStopCatalog(InputStream input) {
        this(input, new ScheduleAssetsVolume(""));
    }

    GoBusStopCatalog(InputStream input, ScheduleAssetsVolume volume) {
        this.volume = volume;
        Map<String, Stop> bundled = input == null ? Map.of() : read(input);
        this.snapshot = new Snapshot(bundled, new Source("bundled", null, null, bundled.size()));
    }

    public Optional<Stop> find(String stopCode) {
        if (stopCode == null || !stopCode.matches("\\d{1,6}")) return Optional.empty();
        return Optional.ofNullable(snapshot.stops().get(stopCode));
    }

    public int size() {
        return snapshot.stops().size();
    }

    public Source source() {
        return snapshot.source();
    }

    /** Swaps in the published list when the manifest names a new one; keeps the current list otherwise. */
    @Scheduled(
        initialDelayString = "${linewatch.schedule-assets.reload-interval:PT1M}",
        fixedDelayString = "${linewatch.schedule-assets.reload-interval:PT1M}"
    )
    public void refresh() {
        if (!volume.enabled()) return;
        Optional<JsonNode> manifest = volume.manifest();
        if (manifest.isEmpty()) return;
        Optional<String> path = volume.publishedPath(manifest.get(), "go", "go-bus-stops.csv");
        Snapshot current = snapshot;
        if (path.isEmpty() || path.get().equals(current.source().publishedPath())) return;
        Optional<Path> file = volume.resolve(path.get());
        if (file.isEmpty()) {
            LOGGER.warn("Published GO stop list {} is not readable; keeping the {} list", path.get(), current.source().origin());
            return;
        }
        Map<String, Stop> stops;
        try (InputStream input = Files.newInputStream(file.get())) {
            stops = read(input);
        } catch (IOException | UncheckedIOException exception) {
            LOGGER.warn("Published GO stop list {} could not be read; keeping the {} list", path.get(), current.source().origin(), exception);
            return;
        }
        if (stops.isEmpty() || stops.size() < current.stops().size() / 2) {
            LOGGER.warn("Published GO stop list {} has {} stops against {}; keeping the {} list",
                path.get(), stops.size(), current.stops().size(), current.source().origin());
            return;
        }
        JsonNode feedVersion = manifest.get().path("networks").path("go").path("feedVersion");
        Source source = new Source("published", path.get(), feedVersion.isString() ? feedVersion.asString() : null, stops.size());
        snapshot = new Snapshot(stops, source);
        LOGGER.info("GO stop list now {} ({} stops, feed {})", path.get(), stops.size(), source.feedVersion());
    }

    private static Map<String, Stop> read(InputStream input) {
        Map<String, Stop> result = new LinkedHashMap<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line = reader.readLine(); // header
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                List<String> fields = parse(line);
                if (fields.size() < 3) continue;
                String code = fields.get(0).trim();
                List<String> routes = Arrays.stream(fields.get(2).trim().split("\\s+")).filter(route -> !route.isEmpty()).toList();
                result.put(code, new Stop(code, fields.get(1).trim(), routes));
            }
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
        return Map.copyOf(result);
    }

    /** One CSV record; a quoted field may hold commas and doubled quotes. */
    private static List<String> parse(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (ch == '"') {
                    quoted = false;
                } else {
                    field.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                out.add(field.toString());
                field.setLength(0);
            } else {
                field.append(ch);
            }
        }
        out.add(field.toString());
        return out;
    }
}
