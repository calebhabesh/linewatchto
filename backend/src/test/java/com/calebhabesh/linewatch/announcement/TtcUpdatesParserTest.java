package com.calebhabesh.linewatch.announcement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import org.junit.jupiter.api.Test;

class TtcUpdatesParserTest {
    private static final URI SOURCE = URI.create("https://www.ttc.ca/riding-the-ttc/Updates");
    private final TtcUpdatesParser parser = new TtcUpdatesParser();

    @Test
    void parsesDistinctOfficialUpdateLinksInPageOrder() {
        String html = """
            <html><body>
              <a href="/riding-the-ttc/Updates">Updates</a>
              <a href="/riding-the-ttc/Updates/fare-capping">Monthly fare capping</a>
              <a href="/riding-the-ttc/Updates/fare-capping"><img alt="Fare card"></a>
              <a href="https://www.ttc.ca/riding-the-ttc/Updates/service-adjustments"> July&nbsp;service adjustments </a>
              <a href="https://example.com/riding-the-ttc/Updates/not-ttc">External</a>
            </body></html>
            """;

        var updates = parser.parse(html, SOURCE, 10);

        assertThat(updates).extracting(TtcAnnouncementResponses.Detail::title)
            .containsExactly("Monthly fare capping", "July service adjustments");
        assertThat(updates).allSatisfy(update -> {
            assertThat(update.scope()).isEqualTo("update");
            assertThat(update.source()).isEqualTo("TTC.ca Updates");
            assertThat(update.url()).startsWith("https://www.ttc.ca/riding-the-ttc/Updates/");
        });
    }

    @Test
    void rejectsAnUnexpectedPageShapeInsteadOfReportingAFalseEmptyList() {
        assertThatThrownBy(() -> parser.parse("<html><body>Unavailable</body></html>", SOURCE, 10))
            .isInstanceOf(TtcUpdatesParser.TtcUpdatesParseException.class);
    }
}
