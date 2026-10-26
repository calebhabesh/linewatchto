package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * Local diagnostic over exported Metrolinx source records; skipped in the normal suite.
 * {@code scripts/audit-metrolinx-duplicates.sh} exports the active records and runs it.
 * Records are lines of source system, source ID, and payload separated by U+001F.
 */
@EnabledIfSystemProperty(named = "linewatch.metrolinxAudit.records", matches = ".+")
class MetrolinxDuplicateAuditTest {
    @Test
    void activeNoticesHaveNoUnconsolidatedNearDuplicates() throws Exception {
        Path recordsFile = Path.of(System.getProperty("linewatch.metrolinxAudit.records"));
        Path reportFile = Path.of(System.getProperty("linewatch.metrolinxAudit.report", recordsFile + ".report"));
        List<MetrolinxFetchedRecord> records = Files.readAllLines(recordsFile).stream()
            .filter(line -> !line.isBlank())
            .map(line -> line.split("\u001f", 3))
            .map(fields -> new MetrolinxFetchedRecord(fields[0], fields[1], fields[2]))
            .toList();
        var result = new MetrolinxAlertNormalizer(Clock.systemUTC())
            .consolidate(new MetrolinxFeed(OffsetDateTime.now(), records, Map.of()));
        Map<String, RegionalAlertClassification> events = result.events().stream()
            .collect(Collectors.toMap(RegionalAlertClassification::canonicalEventId, event -> event));

        StringBuilder report = new StringBuilder()
            .append(records.size()).append(" source records -> ").append(result.events().size())
            .append(" events, ").append(result.merges().size()).append(" consolidated, ")
            .append(result.nearDuplicates().size()).append(" near-duplicate pairs\n");
        if (!result.merges().isEmpty()) report.append("\nConsolidated:\n");
        for (var merge : result.merges()) {
            report.append("  ").append(merge.absorbedEventId()).append(" -> ").append(merge.leadEventId())
                .append(" (").append(merge.reason()).append(")  ")
                .append(events.get(merge.leadEventId()).title()).append('\n');
        }
        if (!result.nearDuplicates().isEmpty()) report.append("\nNear duplicates (still separate):\n");
        for (var pair : result.nearDuplicates()) {
            for (String eventId : List.of(pair.firstEventId(), pair.secondEventId())) {
                var event = events.get(eventId);
                report.append("  ").append(eventId).append(' ').append(event.lineIds()).append(' ')
                    .append(event.serviceEffect()).append(' ').append(event.scope()).append("  ")
                    .append(event.title()).append('\n');
            }
            report.append('\n');
        }
        Files.writeString(reportFile, report);

        assertThat(result.nearDuplicates()).as("near duplicates; see %s", reportFile).isEmpty();
    }
}
