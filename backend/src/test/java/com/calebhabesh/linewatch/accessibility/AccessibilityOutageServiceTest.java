package com.calebhabesh.linewatch.accessibility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageReadRepository.OutageRow;
import com.calebhabesh.linewatch.accessibility.AccessibilityOutageResponses.*;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AccessibilityOutageServiceTest {
    @Mock
    private AccessibilityOutageReadRepository repository;
    @Mock
    private IngestionFreshness ingestionFreshness;
    
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-14T15:40:00Z"), ZoneId.of("UTC"));

    private AccessibilityOutageService getService() {
        return new AccessibilityOutageService(repository, ingestionFreshness, clock);
    }

    @Test
    void staleIngestionReturnsEmptyFreshFalseResponse() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
        AccessibilityOutageService service = getService();

        AccessibilityOutagesResponse response = service.getAccessibilityOutages(null);

        assertThat(response.fresh()).isFalse();
        assertThat(response.assetTypes()).isEmpty();
        assertThat(response.groups()).isEmpty();
    }

    @Test
    void oneBloorYongeElevatorOutageAppearsUnderBothLine1AndLine2() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime updated = OffsetDateTime.parse("2026-06-14T11:00:00Z");
        
        OutageRow line1Row = new OutageRow(
            "ttc-accessibility-69283", "elevator", "Bloor-Yonge: Elevator out of service...", "", "Technical issue", updated,
            "bloor-yonge", "Bloor-Yonge", 10,
            "line-1", "1", "Yonge-University", "#F8C300", 1
        );
        OutageRow line2Row = new OutageRow(
            "ttc-accessibility-69283", "elevator", "Bloor-Yonge: Elevator out of service...", "", "Technical issue", updated,
            "bloor-yonge", "Bloor-Yonge", 20,
            "line-2", "2", "Bloor-Danforth", "#00923F", 2
        );

        when(repository.findActiveOutages(null)).thenReturn(List.of(line1Row, line2Row));
        AccessibilityOutageService service = getService();

        AccessibilityOutagesResponse response = service.getAccessibilityOutages(null);

        assertThat(response.fresh()).isTrue();
        assertThat(response.groups()).hasSize(2);
        
        LineGroup g1 = response.groups().get(0);
        assertThat(g1.lineId()).isEqualTo("line-1");
        assertThat(g1.stations()).hasSize(1);
        assertThat(g1.stations().get(0).stationId()).isEqualTo("bloor-yonge");
        assertThat(g1.stations().get(0).outages()).hasSize(1);
        assertThat(g1.stations().get(0).outages().get(0).id()).isEqualTo("ttc-accessibility-69283");

        LineGroup g2 = response.groups().get(1);
        assertThat(g2.lineId()).isEqualTo("line-2");
        assertThat(g2.stations()).hasSize(1);
        assertThat(g2.stations().get(0).stationId()).isEqualTo("bloor-yonge");
        assertThat(g2.stations().get(0).outages()).hasSize(1);
        assertThat(g2.stations().get(0).outages().get(0).id()).isEqualTo("ttc-accessibility-69283");

        assertThat(response.assetTypes()).hasSize(2);
        AssetTypeSummary elevatorSummary = response.assetTypes().stream()
            .filter(a -> a.assetType().equals("elevator")).findFirst().orElseThrow();
        assertThat(elevatorSummary.count()).isEqualTo(2); // one for line 1, one for line 2
        assertThat(elevatorSummary.lines()).hasSize(2);
    }

    @Test
    void assetFilterFiltersOutEscalatorsButOverviewStillIncludesTotalElevatorLinesAndCounts() {
        when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
        OffsetDateTime updated = OffsetDateTime.parse("2026-06-14T11:00:00Z");

        OutageRow line1Elevator = new OutageRow(
            "ttc-accessibility-69283", "elevator", "Bloor-Yonge: Elevator out of service...", "", "Technical issue", updated,
            "bloor-yonge", "Bloor-Yonge", 10,
            "line-1", "1", "Yonge-University", "#F8C300", 1
        );

        when(repository.findActiveOutages("elevator")).thenReturn(List.of(line1Elevator));
        AccessibilityOutageService service = getService();

        AccessibilityOutagesResponse response = service.getAccessibilityOutages("elevator");

        assertThat(response.fresh()).isTrue();
        assertThat(response.assetTypes()).hasSize(1);
        assertThat(response.assetTypes().get(0).assetType()).isEqualTo("elevator");
        assertThat(response.assetTypes().get(0).count()).isEqualTo(1);
        assertThat(response.groups()).hasSize(1);
        assertThat(response.groups().get(0).stations().get(0).outages().get(0).assetType()).isEqualTo("elevator");
    }

    @Test
    void invalidAssetThrowsIllegalArgumentException() {
        AccessibilityOutageService service = getService();
        assertThatThrownBy(() -> service.getAccessibilityOutages("invalid"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Invalid asset type");
    }
}
