package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class GtfsRtServiceAlertTextParserTest {

    private final GtfsRtServiceAlertTextParser parser = new GtfsRtServiceAlertTextParser();

    @Test
    void parsesModifiedServiceEntitiesIntoSurfaceRouteRecords() {
        String text = """
            header { gtfs_realtime_version: "2.0" incrementality: FULL_DATASET timestamp: 1781031643 }
            entity {
              id: "100"
              alert {
                active_period { start: 1773547200 end: 1804221000 }
                informed_entity { route_id: "88" }
                effect: MODIFIED_SERVICE
                header_text { translation { text: "88 South Leaside - Route change, due to Ontario Line construction" language: "en" } }
                url { translation { text: "https://www.ttc.ca/service-advisories/Service-Changes/88-Route-change-due-to-Ontario-Line-construction" language: "en" } }
              }
            }
            entity {
              id: "204"
              alert {
                active_period { start: 1780804800 end: 1785470400 }
                informed_entity { route_id: "509" }
                effect: MODIFIED_SERVICE
                header_text { translation { text: "509 Harbourfront - Service change, due to FIFA World Cup 2026" language: "en" } }
              }
            }
            """;

        List<TtcFetchedRecord> records = parser.parse(text);

        assertThat(records).hasSize(2);
        assertThat(records.getFirst().record().id()).isEqualTo("gtfsrt-100");
        assertThat(records.getFirst().record().route()).isEqualTo("88");
        assertThat(records.getFirst().record().routeType()).isEqualTo("Bus");
        assertThat(records.getFirst().record().effect()).isEqualTo("MODIFIED_SERVICE");
        assertThat(records.getFirst().record().url()).contains("88-Route-change");
        assertThat(records.getFirst().record().activePeriod().start())
            .isEqualTo(OffsetDateTime.parse("2026-03-15T04:00:00Z"));
        assertThat(records.get(1).record().routeType()).isEqualTo("Streetcar");
    }
}
