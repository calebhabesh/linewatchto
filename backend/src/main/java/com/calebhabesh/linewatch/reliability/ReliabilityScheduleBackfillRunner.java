package com.calebhabesh.linewatch.reliability;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleImportService;
import com.calebhabesh.linewatch.regional.RegionalGtfsScheduleImportService;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Plan 17 A2 runner: imports an archived static GTFS zip through the normal bounded-memory
 * importer as an inactive import, captures spans only for dates with no existing row in
 * {@code reliability_schedule_days} ({@code source_kind = 'archive'}), then removes the temporary
 * import. Never activates the archived import or overwrites existing schedule days.
 */
@Component
@EnableConfigurationProperties(ReliabilityScheduleBackfillProperties.class)
public class ReliabilityScheduleBackfillRunner implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ReliabilityScheduleBackfillRunner.class);

    private final ReliabilityScheduleBackfillProperties properties;
    private final GtfsScheduleImportService ttcImportService;
    private final RegionalGtfsScheduleImportService regionalImportService;

    public ReliabilityScheduleBackfillRunner(
        ReliabilityScheduleBackfillProperties properties,
        GtfsScheduleImportService ttcImportService,
        RegionalGtfsScheduleImportService regionalImportService
    ) {
        this.properties = properties;
        this.ttcImportService = ttcImportService;
        this.regionalImportService = regionalImportService;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!properties.isEnabled()) return;
        backfill(
            properties.getSource(),
            Path.of(requireNonBlank(properties.getZipPath(), "linewatch.reliability.schedule-backfill.zip-path")),
            properties.getArchiveUrl(),
            properties.getFeedVersion()
        );
    }

    public BackfillResult backfill(String source, Path zipPath, String archiveUrl, String feedVersion) throws IOException {
        String normalizedSource = requireNonBlank(source, "linewatch.reliability.schedule-backfill.source")
            .trim().toLowerCase(Locale.ROOT);
        if (!Files.isRegularFile(zipPath)) {
            throw new IOException("Archived GTFS zip does not exist: " + zipPath);
        }
        String sha256 = sha256Hex(zipPath);
        String resolvedUrl = archiveUrl == null || archiveUrl.isBlank() ? zipPath.getFileName().toString() : archiveUrl.trim();
        String resolvedVersion = feedVersion == null || feedVersion.isBlank()
            ? resolvedUrl + "#sha256=" + sha256.substring(0, 12)
            : feedVersion.trim();

        ReliabilityScheduleCapture.CaptureResult captured = switch (normalizedSource) {
            case "ttc" -> ttcImportService.importZipForArchiveBackfill(zipPath, resolvedUrl, resolvedVersion);
            case "go", "up" -> regionalImportService.importZipForArchiveBackfill(zipPath, normalizedSource, resolvedUrl, resolvedVersion);
            default -> throw new IllegalArgumentException("Unsupported schedule backfill source: " + source);
        };
        log.info(
            "Backfilled {} archive schedule {} (sha256={}): {} missing schedule days, {} spans",
            normalizedSource, resolvedVersion, sha256, captured.scheduleDays(), captured.serviceSpans()
        );
        return new BackfillResult(normalizedSource, resolvedVersion, sha256, captured.scheduleDays(), captured.serviceSpans());
    }

    private static String requireNonBlank(String value, String propertyName) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(propertyName + " must be set when schedule backfill is enabled");
        }
        return value;
    }

    static String sha256Hex(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            try (InputStream in = Files.newInputStream(path)) {
                int read;
                while ((read = in.read(buffer)) >= 0) {
                    if (read > 0) digest.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public record BackfillResult(
        String source,
        String feedVersion,
        String sha256,
        int scheduleDays,
        int serviceSpans
    ) {}
}
