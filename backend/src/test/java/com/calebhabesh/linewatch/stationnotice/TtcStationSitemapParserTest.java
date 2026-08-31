package com.calebhabesh.linewatch.stationnotice;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class TtcStationSitemapParserTest {
    private final TtcStationSitemapParser parser = new TtcStationSitemapParser();

    @Test
    void parsesSitemapIndexesAndStationPageLastModifiedDates() {
        var index = parser.parse("""
            <?xml version="1.0"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://www.ttc.ca/sitemap-1.xml</loc></sitemap>
            </sitemapindex>
            """, URI.create("https://www.ttc.ca/sitemap.xml"));
        assertThat(index.childSitemaps()).containsExactly(URI.create("https://www.ttc.ca/sitemap-1.xml"));

        var pageList = parser.parse("""
            <?xml version="1.0"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url>
                <loc>https://www.ttc.ca/subway-stations/warden-station</loc>
                <lastmod>2026-07-30T12:00:00Z</lastmod>
              </url>
              <url><loc>https://www.ttc.ca/riding-the-ttc/Updates</loc></url>
            </urlset>
            """, URI.create("https://www.ttc.ca/sitemap-1.xml"));

        assertThat(pageList.stationPages()).containsExactly(
            new TtcStationSitemapParser.StationPage(
                URI.create("https://www.ttc.ca/subway-stations/warden-station"),
                LocalDate.parse("2026-07-30")
            )
        );
    }
}
