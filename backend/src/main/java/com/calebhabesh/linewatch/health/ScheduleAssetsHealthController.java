package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.scheduleassets.ScheduleAssetsVolume;
import com.calebhabesh.linewatch.surfacearrival.GoBusStopCatalog;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * The schedule-assets service's health (plan 16): which TTC and GO feeds the
 * published Map View and search files come from, when each was last checked
 * and published, and whether checks are failing or have stopped. Allowlisted
 * fields only: the failure stage, never its message. The TTC and GO feeds the
 * backend itself imports are /api/health/schedule and
 * /api/health/regional-schedule; the GO stop list departures accept is here.
 */
@RestController
@RequestMapping("/api/health/schedule-assets")
public class ScheduleAssetsHealthController {
    /** A network is stale when no check has succeeded for this many intervals. */
    static final int STALE_INTERVALS = 3;
    private static final List<String> NETWORKS = List.of("ttc", "go");

    private final ScheduleAssetsVolume volume;
    private final GoBusStopCatalog goBusStops;
    private final Clock clock;

    public ScheduleAssetsHealthController(ScheduleAssetsVolume volume, GoBusStopCatalog goBusStops, Clock clock) {
        this.volume = volume;
        this.goBusStops = goBusStops;
        this.clock = clock;
    }

    @GetMapping
    public Response health() {
        GoBusStopCatalog.Source stops = goBusStops.source();
        GoBusStops goStops = new GoBusStops(stops.origin(), stops.size(), stops.feedVersion());
        if (!volume.enabled()) {
            return new Response("disabled", null, null, List.of(), goStops,
                "Schedule-derived map and search files come from the release; no schedule-assets volume is configured.");
        }
        Optional<JsonNode> manifest = volume.manifest();
        if (manifest.isEmpty()) {
            return new Response("unavailable", null, null, List.of(), goStops,
                "No schedule manifest is published yet; riders get the release's files.");
        }
        JsonNode status = volume.status().orElse(null);
        Instant now = clock.instant();
        List<Network> networks = new ArrayList<>();
        for (String network : NETWORKS) {
            JsonNode published = manifest.get().path("networks").path(network);
            JsonNode checks = status == null ? null : status.path("networks").path(network);
            if (published.isMissingNode() && (checks == null || checks.isMissingNode())) continue;
            long interval = checks == null ? 0 : checks.path("intervalSeconds").asLong(0);
            Instant lastSuccess = instant(checks, "lastSuccessAt");
            Instant started = instant(status, "startedAt");
            boolean enabled = checks != null && checks.path("enabled").asBoolean(false);
            // Stale: enabled, and no successful check for STALE_INTERVALS intervals (counted from the
            // service's start when it has not succeeded yet).
            Instant since = lastSuccess != null ? lastSuccess : started;
            boolean stale = enabled && interval > 0 && since != null
                && Duration.between(since, now).compareTo(Duration.ofSeconds(interval * STALE_INTERVALS)) > 0;
            String checkState = checks == null ? null : text(checks, "state");
            String state = !enabled ? "not-checked"
                : stale ? "stale"
                : "failing".equals(checkState) ? "failing"
                : lastSuccess == null ? "pending"
                : "ok";
            networks.add(new Network(
                network,
                state,
                text(published, "origin"),
                text(published, "feedVersion"),
                text(published, "feedStartDate"),
                text(published, "feedEndDate"),
                text(published, "publishedAt"),
                checks == null ? null : text(checks, "lastCheckAt"),
                lastSuccess == null ? null : lastSuccess.toString(),
                checks == null ? null : text(checks, "lastFailureAt"),
                checks == null ? null : text(checks.path("lastFailure"), "stage"),
                checks == null ? 0 : checks.path("consecutiveFailures").asInt(0),
                interval
            ));
        }
        String overall = networks.stream().map(Network::state).anyMatch("stale"::equals) ? "stale"
            : networks.stream().map(Network::state).anyMatch("failing"::equals) ? "failing"
            : networks.stream().map(Network::state).allMatch(state -> "ok".equals(state) || "not-checked".equals(state)) ? "ok"
            : "pending";
        String message = switch (overall) {
            case "ok" -> "Published schedule files are current with the last successful feed checks.";
            case "stale" -> "A network's feed has not been checked successfully for several intervals; riders keep its last published files.";
            case "failing" -> "The last check of a network failed; riders keep its last published files.";
            default -> "Waiting for the first feed checks; riders get the last published files.";
        };
        return new Response(overall, text(manifest.get(), "generation"), text(manifest.get(), "publishedAt"), networks, goStops, message);
    }

    private static String text(JsonNode node, String field) {
        if (node == null) return null;
        JsonNode value = node.path(field);
        return value.isString() ? value.asString() : null;
    }

    private static Instant instant(JsonNode node, String field) {
        String value = text(node, field);
        if (value == null) return null;
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException exception) {
            return null;
        }
    }

    public record Response(
        String status,
        String generation,
        String publishedAt,
        List<Network> networks,
        GoBusStops goBusStops,
        String message
    ) {}

    public record Network(
        String network,
        String state,
        String origin,
        String feedVersion,
        String feedStartDate,
        String feedEndDate,
        String publishedAt,
        String lastCheckAt,
        String lastSuccessAt,
        String lastFailureAt,
        String lastFailureStage,
        int consecutiveFailures,
        long intervalSeconds
    ) {}

    public record GoBusStops(String origin, int size, String feedVersion) {}
}
