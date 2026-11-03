package com.calebhabesh.linewatch.surfacearrival;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * The GO bus stops the GO/UP Map View draws (plan 13, S6), from
 * {@code regional/go-bus-stops.csv}, written by
 * {@code scripts/generate-go-bus-catalog.mjs} from GO static GTFS. Stop
 * departures are fetched only for a stop number in this list, so a request
 * can never send an arbitrary code to Metrolinx.
 */
@Component
public class GoBusStopCatalog {
    public record Stop(String stopCode, String name, List<String> routes) {
    }

    static final String RESOURCE = "/regional/go-bus-stops.csv";

    private final Map<String, Stop> stops;

    public GoBusStopCatalog() {
        this(GoBusStopCatalog.class.getResourceAsStream(RESOURCE));
    }

    GoBusStopCatalog(InputStream input) {
        this.stops = input == null ? Map.of() : read(input);
    }

    public Optional<Stop> find(String stopCode) {
        if (stopCode == null || !stopCode.matches("\\d{1,6}")) return Optional.empty();
        return Optional.ofNullable(stops.get(stopCode));
    }

    public int size() {
        return stops.size();
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
