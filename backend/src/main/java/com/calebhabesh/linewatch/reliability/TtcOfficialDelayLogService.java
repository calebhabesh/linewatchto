package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsCsvReader;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogBucket;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogCodeRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogLineRow;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogPublicationPeriod;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogResponse;
import com.calebhabesh.linewatch.reliability.ReliabilityRangeResponses.TtcDelayLogTotals;
import com.calebhabesh.linewatch.reliability.TtcOfficialDelayLogRepository.CodeAggregate;
import com.calebhabesh.linewatch.reliability.TtcOfficialDelayLogRepository.DailyAggregate;
import com.calebhabesh.linewatch.reliability.TtcOfficialDelayLogRepository.DelayIncidentRow;
import com.calebhabesh.linewatch.reliability.TtcOfficialDelayLogRepository.ImportMetadata;
import com.calebhabesh.linewatch.reliability.TtcOfficialDelayLogRepository.LineAggregate;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Plan 17 A10 (D6): imports Open Data Toronto's official TTC Subway Delay Data (OGL–Toronto)
 * in bounded-memory batches and serves it as an independent labelled series, never merged into
 * LineWatchTO-observed minutes.
 */
@Service
public class TtcOfficialDelayLogService {
    private static final Logger log = LoggerFactory.getLogger(TtcOfficialDelayLogService.class);
    private static final int BATCH_SIZE = 1000;
    private static final int TOP_CODES_LIMIT = 12;
    static final String SOURCE_LABEL = "TTC Delay Log · Open Data Toronto";
    static final String LICENCE_LABEL = "Open Government Licence – Toronto";

    private final TtcOfficialDelayLogRepository repository;
    private final ReliabilitySourcesProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public TtcOfficialDelayLogService(
        TtcOfficialDelayLogRepository repository,
        ReliabilitySourcesProperties properties,
        ObjectMapper objectMapper,
        Clock clock
    ) {
        this.repository = repository;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public ImportMetadata refreshIfUpdated() throws IOException, InterruptedException {
        ReliabilitySourcesProperties.TtcDelayLog cfg = properties.getTtcDelayLog();
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(cfg.getConnectTimeout())
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

        HttpRequest pkgReq = HttpRequest.newBuilder(URI.create(cfg.getPackageUrl()))
            .timeout(cfg.getReadTimeout())
            .GET()
            .build();
        HttpResponse<String> pkgResp = client.send(pkgReq, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (pkgResp.statusCode() < 200 || pkgResp.statusCode() >= 300) {
            throw new IOException("Open Data Toronto CKAN package returned HTTP " + pkgResp.statusCode());
        }

        JsonNode resources = objectMapper.readTree(pkgResp.body()).path("result").path("resources");
        String delayUrl = null;
        String delayLastModified = null;
        String codesUrl = null;
        for (JsonNode res : resources) {
            if (!"CSV".equalsIgnoreCase(res.path("format").asText(""))) continue;
            String name = res.path("name").asText("").toLowerCase(Locale.ROOT);
            String url = res.path("url").asText("");
            if (url.isBlank()) continue;
            if (name.contains("code") && name.contains("description")) {
                codesUrl = url;
            } else if (name.contains("delay")) {
                delayUrl = url;
                delayLastModified = res.path("last_modified").asText(null);
            }
        }
        if (delayUrl == null) {
            throw new IOException("No TTC Subway Delay CSV resource found in Open Data Toronto package");
        }

        ImportMetadata latest = repository.latestImport().orElse(null);
        if (latest != null
            && delayUrl.equals(latest.resourceUrl())
            && delayLastModified != null
            && delayLastModified.equals(latest.resourceLastModified())
            && latest.rowCount() > 0) {
            return latest;
        }

        Map<String, String> codeDescriptions = new HashMap<>();
        if (codesUrl != null) {
            HttpRequest codeReq = HttpRequest.newBuilder(URI.create(codesUrl)).timeout(cfg.getReadTimeout()).GET().build();
            HttpResponse<InputStream> codeResp = client.send(codeReq, HttpResponse.BodyHandlers.ofInputStream());
            if (codeResp.statusCode() >= 200 && codeResp.statusCode() < 300) {
                try (Reader r = new InputStreamReader(codeResp.body(), StandardCharsets.UTF_8)) {
                    codeDescriptions.putAll(parseCodeDescriptions(r));
                }
            }
        }

        HttpRequest dataReq = HttpRequest.newBuilder(URI.create(delayUrl)).timeout(cfg.getReadTimeout()).GET().build();
        HttpResponse<InputStream> dataResp = client.send(dataReq, HttpResponse.BodyHandlers.ofInputStream());
        if (dataResp.statusCode() < 200 || dataResp.statusCode() >= 300) {
            throw new IOException("TTC delay CSV returned HTTP " + dataResp.statusCode());
        }
        try (Reader r = new InputStreamReader(dataResp.body(), StandardCharsets.UTF_8)) {
            ImportMetadata result = importFromReader(r, codeDescriptions, delayUrl, delayLastModified);
            log.info(
                "Imported TTC official delay log ({}..{}, {} rows, modified {})",
                result.minDate(), result.maxDate(), result.rowCount(), result.resourceLastModified()
            );
            return result;
        }
    }

    public ImportMetadata importFromStreams(
        Reader delayCsv,
        Reader codesCsv,
        String resourceUrl,
        String lastModified
    ) throws IOException {
        Map<String, String> codes = codesCsv == null ? Map.of() : parseCodeDescriptions(codesCsv);
        return importFromReader(delayCsv, codes, resourceUrl, lastModified);
    }

    private ImportMetadata importFromReader(
        Reader delayCsv,
        Map<String, String> codeDescriptions,
        String resourceUrl,
        String lastModified
    ) throws IOException {
        OffsetDateTime importedAt = OffsetDateTime.now(clock);
        List<DelayIncidentRow> batch = new ArrayList<>(BATCH_SIZE);
        int[] totalRows = {0};
        LocalDate[] range = new LocalDate[2];

        GtfsCsvReader.forEachRow(delayCsv, row -> {
            String dateStr = row.value("Date");
            if (dateStr.isBlank()) return;
            LocalDate incidentDate;
            try {
                incidentDate = LocalDate.parse(dateStr.trim().substring(0, Math.min(10, dateStr.trim().length())));
            } catch (RuntimeException e) {
                return;
            }
            int sourceRowId = parseNonNegativeInt(row.value("_id"), totalRows[0] + 1);
            int minDelay = parseNonNegativeInt(row.value("Min Delay"), 0);
            int minGap = parseNonNegativeInt(row.value("Min Gap"), 0);
            String rawLine = truncate(row.value("Line").trim(), 40);
            String lineId = normalizeLine(rawLine);
            String code = truncate(row.value("Code").trim().toUpperCase(Locale.ROOT), 32);
            String desc = codeDescriptions.get(code);
            if (desc != null) desc = truncate(desc, 240);

            if (range[0] == null || incidentDate.isBefore(range[0])) range[0] = incidentDate;
            if (range[1] == null || incidentDate.isAfter(range[1])) range[1] = incidentDate;

            batch.add(new DelayIncidentRow(
                sourceRowId,
                incidentDate,
                truncate(row.value("Time").trim(), 16),
                truncate(row.value("Day").trim(), 16),
                lineId,
                rawLine.isBlank() ? "UNKNOWN" : rawLine,
                truncate(row.value("Station").trim(), 160),
                code.isBlank() ? null : code,
                desc,
                minDelay,
                minGap,
                truncate(row.value("Bound").trim(), 16),
                truncate(row.value("Vehicle").trim(), 32),
                importedAt
            ));
            totalRows[0]++;
            if (batch.size() >= BATCH_SIZE) {
                repository.upsertIncidents(batch);
                batch.clear();
            }
        });
        if (!batch.isEmpty()) {
            repository.upsertIncidents(batch);
            batch.clear();
        }
        ImportMetadata meta = new ImportMetadata(
            resourceUrl,
            lastModified,
            range[0],
            range[1],
            totalRows[0],
            importedAt
        );
        repository.recordImport(meta);
        return meta;
    }

    public TtcDelayLogResponse delayLog(LocalDate from, LocalDate to, String lineId, String granularity) {
        ImportMetadata latest = repository.latestImport().orElse(null);
        TtcDelayLogPublicationPeriod period = latest == null ? null : new TtcDelayLogPublicationPeriod(
            latest.minDate(),
            latest.maxDate(),
            latest.resourceLastModified(),
            latest.rowCount()
        );
        List<DailyAggregate> daily = repository.dailyAggregates(from, to, lineId);
        List<LineAggregate> lineAggs = repository.lineAggregates(from, to, lineId);
        List<CodeAggregate> codeAggs = repository.topCodes(from, to, lineId, TOP_CODES_LIMIT);
        Integer median = repository.medianDelayMinutes(from, to, lineId);

        Map<LocalDate, DailyAggregate> byDate = new LinkedHashMap<>();
        int totalIncidents = 0;
        int totalMinutes = 0;
        for (DailyAggregate d : daily) {
            byDate.put(d.date(), d);
            totalIncidents += d.incidents();
            totalMinutes += d.delayMinutes();
        }

        List<LocalDate[]> bucketBounds = ReliabilityRangeService.buckets(from, to, granularity);
        List<TtcDelayLogBucket> buckets = new ArrayList<>(bucketBounds.size());
        for (LocalDate[] bounds : bucketBounds) {
            int incidents = 0;
            int minutes = 0;
            for (LocalDate d = bounds[0]; !d.isAfter(bounds[1]); d = d.plusDays(1)) {
                DailyAggregate agg = byDate.get(d);
                if (agg != null) {
                    incidents += agg.incidents();
                    minutes += agg.delayMinutes();
                }
            }
            buckets.add(new TtcDelayLogBucket(bounds[0], bounds[1], incidents, minutes));
        }

        List<TtcDelayLogLineRow> lines = lineAggs.stream()
            .map(l -> new TtcDelayLogLineRow(l.lineId(), lineLabel(l.lineId()), l.incidents(), l.delayMinutes()))
            .toList();
        List<TtcDelayLogCodeRow> topCodes = codeAggs.stream()
            .map(c -> new TtcDelayLogCodeRow(c.code(), c.description() != null ? c.description() : c.code(), c.incidents(), c.delayMinutes()))
            .toList();

        String message = latest == null
            ? (properties.getTtcDelayLog().isEnabled()
                ? "TTC Delay Log import has not completed yet."
                : "TTC Delay Log import is disabled on this deployment.")
            : totalIncidents == 0
                ? "No official TTC subway delay log incidents recorded in this range."
                : "Official TTC subway delay log (published " + latest.minDate() + " to " + latest.maxDate()
                    + "); shown separately from LineWatchTO-observed minutes.";

        return new TtcDelayLogResponse(
            "ttc",
            from,
            to,
            granularity,
            SOURCE_LABEL,
            LICENCE_LABEL,
            period,
            new TtcDelayLogTotals(totalIncidents, totalMinutes, median),
            lines,
            topCodes,
            buckets,
            message
        );
    }

    static Map<String, String> parseCodeDescriptions(Reader reader) throws IOException {
        Map<String, String> map = new HashMap<>();
        GtfsCsvReader.forEachRow(reader, row -> {
            String code = row.value("CODE").trim().toUpperCase(Locale.ROOT);
            String desc = row.value("DESCRIPTION").trim();
            if (!code.isBlank() && !desc.isBlank()) {
                map.put(code, desc);
            }
        });
        return map;
    }

    static String normalizeLine(String rawLine) {
        if (rawLine == null || rawLine.isBlank()) return "other";
        String upper = rawLine.trim().toUpperCase(Locale.ROOT);
        return switch (upper) {
            case "YU", "YUS", "LINE 1", "1" -> "line-1";
            case "BD", "LINE 2", "2" -> "line-2";
            case "SRT", "LINE 3", "3" -> "line-3";
            case "SHP", "LINE 4", "4" -> "line-4";
            case "ECL", "L5", "LINE 5", "5" -> "line-5";
            case "FWL", "L6", "LINE 6", "6" -> "line-6";
            default -> {
                if (upper.startsWith("YU")) yield "line-1";
                if (upper.startsWith("BD")) yield "line-2";
                if (upper.startsWith("SHP")) yield "line-4";
                yield "other";
            }
        };
    }

    private static String lineLabel(String lineId) {
        return switch (lineId) {
            case "line-1" -> "Line 1 Yonge-University";
            case "line-2" -> "Line 2 Bloor-Danforth";
            case "line-3" -> "Line 3 Scarborough (Legacy)";
            case "line-4" -> "Line 4 Sheppard";
            case "line-5" -> "Line 5 Eglinton Crosstown";
            case "line-6" -> "Line 6 Finch West";
            default -> "Other / Multi-Line";
        };
    }

    private static int parseNonNegativeInt(String value, int fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return Math.max(0, Integer.parseInt(value.trim()));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }
}
