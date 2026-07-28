package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RegionalAccessibilityOutageServiceTest {
    @Mock private RegionalAccessibilityOutageReadRepository repository;
    @Mock private RegionalIngestionFreshness freshness;

    private final Clock clock = Clock.fixed(Instant.parse("2026-07-28T16:00:00Z"), ZoneOffset.UTC);

    @Test
    void staleRegionalIngestionReturnsAnEmptyUnavailableSnapshot() {
        when(freshness.isFresh()).thenReturn(false);

        var response = service().getAccessibilityOutages(null);

        assertThat(response.fresh()).isFalse();
        assertThat(response.source()).isEqualTo("Metrolinx Open API");
        assertThat(response.groups()).isEmpty();
        verifyNoInteractions(repository);
    }

    @Test
    void restorationNoticeIsNotShownAsAnOutageOrUsedToClearAnotherSourceRecord() {
        when(freshness.isFresh()).thenReturn(true);
        when(repository.findActiveGoAmenityRecords()).thenReturn(List.of(
            source("M1", "Elevator out of service", "2026-07-28 08:00:00"),
            source("M2", "Elevator back in service", "2026-07-28 09:00:00")
        ));

        var response = service().getAccessibilityOutages(null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.assetTypes()).first().satisfies(summary -> assertThat(summary.count()).isEqualTo(1));
        assertThat(response.groups()).singleElement().satisfies(group ->
            assertThat(group.stations()).singleElement().satisfies(station ->
                assertThat(station.outages()).singleElement().satisfies(outage ->
                    assertThat(outage.title()).isEqualTo("Elevator out of service"))));
    }

    @Test
    void groupsMappedOutageByRegionalCorridorAndStation() {
        when(freshness.isFresh()).thenReturn(true);
        when(repository.findActiveGoAmenityRecords()).thenReturn(List.of(
            new RegionalAccessibilityOutageReadRepository.SourceRecord("M3", """
                {
                  "Code":"M3",
                  "SubjectEnglish":"Elevator out of service",
                  "BodyEnglish":"The east tunnel elevator is out of service.",
                  "Category":"Amenity",
                  "SubCategory":"Elevator-Escalator Disruption",
                  "PostedDateTime":"2026-07-28 09:00:00",
                  "Lines":[{"Code":"LE"}],
                  "Stops":[{"Code":"EG"}]
                }
                """, OffsetDateTime.parse("2026-07-28T14:00:00Z"))
        ));

        var response = service().getAccessibilityOutages("elevator");

        assertThat(response.assetTypes()).singleElement().satisfies(summary -> {
            assertThat(summary.assetType()).isEqualTo("elevator");
            assertThat(summary.count()).isEqualTo(1);
            assertThat(summary.lines()).singleElement().satisfies(line -> {
                assertThat(line.lineId()).isEqualTo("regional-le");
                assertThat(line.count()).isEqualTo(1);
            });
        });
        assertThat(response.groups()).singleElement().satisfies(group -> {
            assertThat(group.lineId()).isEqualTo("regional-le");
            assertThat(group.stations()).singleElement().satisfies(station -> {
                assertThat(station.stationId()).isEqualTo("eglinton");
                assertThat(station.outages()).singleElement().satisfies(outage ->
                    assertThat(outage.source()).isEqualTo("Metrolinx Open API"));
            });
        });
    }

    private RegionalAccessibilityOutageService service() {
        return new RegionalAccessibilityOutageService(
            repository,
            new RegionalAccessibilityOutageNormalizer(),
            freshness,
            clock
        );
    }

    private RegionalAccessibilityOutageReadRepository.SourceRecord source(
        String code,
        String subject,
        String postedAt
    ) {
        return new RegionalAccessibilityOutageReadRepository.SourceRecord(code, """
            {
              "Code":"%s",
              "SubjectEnglish":"%s",
              "BodyEnglish":"Elevator lifecycle update.",
              "Category":"Amenity",
              "SubCategory":"Elevator-Escalator Disruption",
              "PostedDateTime":"%s",
              "Lines":[{"Code":"LW"}],
              "Stops":[{"Code":"EX"}]
            }
            """.formatted(code, subject, postedAt), OffsetDateTime.parse("2026-07-28T14:00:00Z"));
    }
}
