package com.calebhabesh.linewatch.stationnotice;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.Test;

class TtcStationPageNoticeParserTest {
    private final TtcStationPageNoticeParser parser = new TtcStationPageNoticeParser();

    @Test
    void extractsTheReviewedRichTextNoticeAndOfficialDetailLink() {
        String html = """
            <main>
              <h1>Warden Station</h1>
              <div class="component rich-text u-p u-bt--red o-grid__col">
                <div class="component-content">
                  <p><strong>Starting January 5, 2025,</strong> the bus terminal will be closed.</p>
                  <p>Routes use temporary stops.</p>
                  <p><a href="/riding-the-ttc/Updates/Warden-Station-bus-terminal-closure">Details</a></p>
                </div>
              </div>
              <h2 id="features">Station features</h2>
            </main>
            """;

        TtcStationPageNoticeParser.DetectedNotice notice = parser.parse(
            html,
            URI.create("https://www.ttc.ca/subway-stations/warden-station")
        ).orElseThrow();

        assertThat(notice.title()).isEqualTo("Starting January 5, 2025,");
        assertThat(notice.text()).contains("bus terminal will be closed", "Routes use temporary stops");
        assertThat(notice.detailUrl()).isEqualTo(
            "https://www.ttc.ca/riding-the-ttc/Updates/Warden-Station-bus-terminal-closure"
        );
    }

    @Test
    void doesNotTreatOrdinaryStationContentAsANotice() {
        assertThat(parser.parse(
            "<main><h1>Union Station</h1><div class='component rich-text'><p>Station overview</p></div></main>",
            URI.create("https://www.ttc.ca/subway-stations/union-station")
        )).isEmpty();
    }
}
