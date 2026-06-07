package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class TtcPerformanceParserTest {
    private final TtcPerformanceParser parser = new TtcPerformanceParser();

    @Test
    void parsesOfficialHomepagePerformanceBlock() throws Exception {
        String html = new String(
            getClass().getResourceAsStream("/fixtures/ttc-performance-homepage.html").readAllBytes(),
            StandardCharsets.UTF_8
        );

        TtcPerformanceResponses.SnapshotResponse snapshot = parser.parse(
            html,
            "https://www.ttc.ca/",
            java.time.OffsetDateTime.parse("2026-06-07T12:00:00Z")
        );

        assertThat(snapshot.status()).isEqualTo("available");
        assertThat(snapshot.source()).isEqualTo("TTC.ca");
        assertThat(snapshot.title()).isEqualTo("On-time performance and elevator/escalator status");
        assertThat(snapshot.updatedLabel()).isEqualTo("June 7, 2026 7:00 AM");
        assertThat(snapshot.metrics()).extracting("id")
            .containsExactly("line-1", "line-2", "line-4", "bus", "streetcar", "wheel-trans", "elevators", "escalators");
        assertThat(snapshot.metrics()).filteredOn(metric -> metric.id().equals("line-1"))
            .singleElement()
            .satisfies(metric -> {
                assertThat(metric.category()).isEqualTo("subway");
                assertThat(metric.percentage()).isEqualTo(94);
                assertThat(metric.valueLabel()).isEqualTo("94%");
            });
        assertThat(snapshot.metrics()).filteredOn(metric -> metric.id().equals("elevators"))
            .singleElement()
            .satisfies(metric -> assertThat(metric.category()).isEqualTo("accessibility"));
    }

    @Test
    void rejectsHomepageWithoutPerformanceBlock() {
        assertThatThrownBy(() -> parser.parse("<html><body>No metrics</body></html>", "https://www.ttc.ca/", java.time.OffsetDateTime.now()))
            .isInstanceOf(TtcPerformanceParser.TtcPerformanceParseException.class)
            .hasMessageContaining("performance");
    }
}
