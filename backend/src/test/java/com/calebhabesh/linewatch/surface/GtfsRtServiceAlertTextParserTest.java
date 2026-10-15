package com.calebhabesh.linewatch.surface;

import static org.assertj.core.api.Assertions.assertThat;

import com.calebhabesh.linewatch.ingestion.TtcFetchedRecord;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class GtfsRtServiceAlertTextParserTest {

    private final GtfsRtServiceAlertTextParser parser = new GtfsRtServiceAlertTextParser();

    @ParameterizedTest
    @ValueSource(strings = {"id", "route_id", "stop_id", "header_text", "description_text", "url"})
    void parsesLongQuotedFieldsWithoutOverflowingTheStack(String field) {
        String longValue = "synthetic-advisory".repeat(2_000);
        String id = field.equals("id") ? longValue : "long-advisory";
        String routeId = field.equals("route_id") ? "501" + longValue : "501";
        String stopId = field.equals("stop_id") ? longValue : "test-stop";
        String title = field.equals("header_text") ? longValue : "Service advisory";
        String description = field.equals("description_text") ? longValue : "Advisory description";
        String url = field.equals("url") ? "https://example.test/" + longValue : "https://example.test/advisory";
        String text = """
            entity {
              id: "%s"
              alert {
                informed_entity { route_id: "%s" stop_id: "%s" }
                header_text { translation { text: "%s" language: "en" } }
                description_text { translation { text: "%s" language: "en" } }
                url { translation { text: "%s" language: "en" } }
              }
            }
            """.formatted(id, routeId, stopId, title, description, url);

        List<TtcFetchedRecord> records = parser.parse(text);

        assertThat(records).hasSize(1);
        var record = records.getFirst().record();
        assertThat(record.id()).isEqualTo("gtfsrt-" + id);
        assertThat(record.route()).isEqualTo(routeId);
        assertThat(record.stopIDList()).containsExactly(stopId);
        assertThat(record.headerText()).isEqualTo(title);
        assertThat(record.description()).isEqualTo(description);
        assertThat(record.url()).isEqualTo(url);
    }

    @Test
    void preservesEscapedQuotesAndNewlinesInLongAdvisories() {
        String escapedDescription = "Proceed to the \\\"temporary stop\\\".\\n".repeat(2_000);
        String text = """
            entity {
              id: "escaped-advisory"
              alert {
                informed_entity { route_id: "501" }
                description_text { translation { text: "%s" language: "en" } }
                url { translation { text: "https://example.test/advisory" language: "en" } }
              }
            }
            """.formatted(escapedDescription);

        var record = parser.parse(text).getFirst().record();

        assertThat(record.description()).isEqualTo("Proceed to the \"temporary stop\".\n".repeat(2_000));
        assertThat(record.url()).isEqualTo("https://example.test/advisory");
    }

    @Test
    void parsesSupportedRapidTransitEntityWithoutTreatingLineTwoAsBus() {
        String text = """
            header {
              gtfs_realtime_version: "2.0"
              incrementality: FULL_DATASET
              timestamp: 1781843332
            }
            entity {
              id: "70483"
              alert {
                active_period {
                  start: 1781885880
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13784"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13783"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13781"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13782"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13780"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13779"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13777"
                }
                informed_entity {
                  route_id: "2"
                  stop_id: "13778"
                }
                cause: POLICE_ACTIVITY
                effect: NO_SERVICE
                header_text {
                  translation {
                    text: "Line 2 Bloor-Danforth: No service between Jane and Islington stations due to a security incident."
                    language: "en"
                  }
                }
                description_text {
                  translation {
                    text: "at Old Mill Station."
                    language: "en"
                  }
                }
              }
            }
            """;

        TtcFetchedRecord fetched = parser.parse(text).getFirst();

        assertThat(fetched.record().id()).isEqualTo("gtfsrt-70483");
        assertThat(fetched.record().route()).isEqualTo("2");
        assertThat(fetched.record().routeType()).isEqualTo("Subway");
        assertThat(fetched.record().stopIDList()).containsExactly(
            "13784",
            "13783",
            "13781",
            "13782",
            "13780",
            "13779",
            "13777",
            "13778"
        );
        assertThat(fetched.record().effect()).isEqualTo("NO_SERVICE");
        assertThat(fetched.record().cause()).isEqualTo("POLICE_ACTIVITY");
        assertThat(fetched.record().lastUpdated())
            .isEqualTo(OffsetDateTime.parse("2026-06-19T04:28:52Z"));
        assertThat(fetched.record().activePeriod().start())
            .isEqualTo(OffsetDateTime.parse("2026-06-19T16:18:00Z"));
    }

    @Test
    void marksMultiLineRapidTransitEntityWithoutTreatingItAsSurfaceService() {
        String text = """
            header { gtfs_realtime_version: "2.0" timestamp: 1781843332 }
            entity {
              id: "multi-line"
              alert {
                informed_entity { route_id: "2" }
                informed_entity { route_id: "5" }
                effect: NO_SERVICE
                header_text { translation { text: "Rapid transit service change." language: "en" } }
              }
            }
            """;

        assertThat(parser.parse(text).getFirst().record().routeType())
            .isEqualTo("Rapid Transit");
    }

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
