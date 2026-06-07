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

    @Test
    void parsesLiveTtcHomepagePerformanceCards() {
        String html = """
            <div class="otp-dashboard-wrapper" id="otp-dashboard">
                <div class="otp-dashboard-container">
                    <div class="otp-header">
                        <h3 class="otp-title">On-time performance and elevator/escalator status</h3>
                    </div>
                    <div class="otp-body">
                        <div class="otp-updated">Last updated: Jun 6, 8:30 PM</div>
                        <div class="otp-grid">
                            <div class="otp-card">
                                <div class="otp-card-top">
                                    <div class="otp-card-label">
                                        <span class="otp-service-name">Yonge-University Line</span>
                                    </div>
                                    <span class="otp-percentage ">86%</span>
                                </div>
                                <div class="otp-progress-track">
                                    <span class="otp-target-marker" style="left: 90%;" data-label="Target: 90%"></span>
                                </div>
                            </div>
                            <div class="otp-card">
                                <div class="otp-card-top">
                                    <div class="otp-card-label">
                                        <span class="otp-service-name">Elevator</span>
                                    </div>
                                    <span class="otp-percentage ">97%</span>
                                </div>
                                <div class="otp-progress-track">
                                    <span class="otp-target-marker" style="left: 98%;" data-label="Target: 98%"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            """;

        TtcPerformanceResponses.SnapshotResponse snapshot = parser.parse(
            html,
            "https://www.ttc.ca/",
            java.time.OffsetDateTime.parse("2026-06-07T12:00:00Z")
        );

        assertThat(snapshot.status()).isEqualTo("available");
        assertThat(snapshot.source()).isEqualTo("TTC.ca");
        assertThat(snapshot.updatedLabel()).isEqualTo("Jun 6, 8:30 PM");
        assertThat(snapshot.metrics()).extracting("id")
            .containsExactly("line-1", "elevators");
        assertThat(snapshot.metrics()).filteredOn(metric -> metric.id().equals("line-1"))
            .singleElement()
            .satisfies(metric -> {
                assertThat(metric.label()).isEqualTo("Line 1");
                assertThat(metric.category()).isEqualTo("subway");
                assertThat(metric.percentage()).isEqualTo(86);
                assertThat(metric.target()).isEqualTo(90);
            });
        assertThat(snapshot.metrics()).filteredOn(metric -> metric.id().equals("elevators"))
            .singleElement()
            .satisfies(metric -> {
                assertThat(metric.label()).isEqualTo("Elevators");
                assertThat(metric.category()).isEqualTo("accessibility");
                assertThat(metric.percentage()).isEqualTo(97);
                assertThat(metric.target()).isEqualTo(98);
            });
    }
}
