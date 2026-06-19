package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.arrival.schedule.GtfsScheduleReadRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class GtfsRtRapidTransitStationResolverTest {
    private final GtfsScheduleReadRepository scheduleRepository =
        mock(GtfsScheduleReadRepository.class);
    private final StationAliasResolver stationAliasResolver =
        mock(StationAliasResolver.class);

    private GtfsRtRapidTransitStationResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new GtfsRtRapidTransitStationResolver(
            scheduleRepository,
            stationAliasResolver
        );
    }

    @Test
    void resolvesPlatformStopIdsToUniqueStationsInLineOrder() {
        List<String> stopIds = List.of(
            "13784",
            "13783",
            "13781",
            "13782",
            "13780",
            "13779",
            "13777",
            "13778"
        );
        when(scheduleRepository.findActiveImportId()).thenReturn(Optional.of(91L));
        when(scheduleRepository.findStationMappings(91L, "line-2", stopIds))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("13784", "jane", 10),
                new GtfsScheduleReadRepository.StationMapping("13783", "jane", 10),
                new GtfsScheduleReadRepository.StationMapping("13781", "runnymede", 20),
                new GtfsScheduleReadRepository.StationMapping("13782", "runnymede", 20),
                new GtfsScheduleReadRepository.StationMapping("13780", "old-mill", 30),
                new GtfsScheduleReadRepository.StationMapping("13779", "old-mill", 30),
                new GtfsScheduleReadRepository.StationMapping("13777", "islington", 40),
                new GtfsScheduleReadRepository.StationMapping("13778", "islington", 40)
            ));

        GtfsRtRapidTransitStationResolver.Resolution result = resolver.resolve(
            "line-2",
            stopIds,
            ""
        );

        assertThat(result.stationIds())
            .containsExactly("jane", "runnymede", "old-mill", "islington");
        assertThat(result.startStationId()).isEqualTo("jane");
        assertThat(result.endStationId()).isEqualTo("islington");
        assertThat(result.unresolved()).isFalse();
    }

    @Test
    void resolvesExplicitTextBoundsWithoutAnActiveScheduleImport() {
        when(scheduleRepository.findActiveImportId()).thenReturn(Optional.empty());
        when(stationAliasResolver.resolve("Jane")).thenReturn(Optional.of("jane"));
        when(stationAliasResolver.resolve("Islington")).thenReturn(Optional.of("islington"));

        GtfsRtRapidTransitStationResolver.Resolution result = resolver.resolve(
            "line-2",
            List.of(),
            "Line 2: No service between Jane and Islington stations due to an incident."
        );

        assertThat(result.stationIds()).containsExactly("jane", "islington");
        assertThat(result.startStationId()).isEqualTo("jane");
        assertThat(result.endStationId()).isEqualTo("islington");
        assertThat(result.unresolved()).isFalse();
    }

    @Test
    void usesTextBoundsButReportsUnknownSuppliedStopIds() {
        List<String> stopIds = List.of("unknown-a", "unknown-b");
        when(scheduleRepository.findActiveImportId()).thenReturn(Optional.of(91L));
        when(scheduleRepository.findStationMappings(91L, "line-2", stopIds))
            .thenReturn(List.of());
        when(stationAliasResolver.resolve("Jane")).thenReturn(Optional.of("jane"));
        when(stationAliasResolver.resolve("Islington")).thenReturn(Optional.of("islington"));

        GtfsRtRapidTransitStationResolver.Resolution result = resolver.resolve(
            "line-2",
            stopIds,
            "No service between Jane and Islington stations."
        );

        assertThat(result.stationIds()).containsExactly("jane", "islington");
        assertThat(result.startStationId()).isEqualTo("jane");
        assertThat(result.endStationId()).isEqualTo("islington");
        assertThat(result.unresolved()).isTrue();
    }

    @Test
    void preservesKnownStationWhenOnlyPartOfTheStopScopeResolves() {
        List<String> stopIds = List.of("known", "unknown");
        when(scheduleRepository.findActiveImportId()).thenReturn(Optional.of(91L));
        when(scheduleRepository.findStationMappings(91L, "line-2", stopIds))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("known", "old-mill", 30)
            ));

        GtfsRtRapidTransitStationResolver.Resolution result = resolver.resolve(
            "line-2",
            stopIds,
            ""
        );

        assertThat(result.stationIds()).containsExactly("old-mill");
        assertThat(result.startStationId()).isEqualTo("old-mill");
        assertThat(result.endStationId()).isEqualTo("old-mill");
        assertThat(result.unresolved()).isTrue();
    }

    @Test
    void unresolvedTextCaptureDoesNotEraseKnownStaticEndpoint() {
        List<String> stopIds = List.of("known", "unknown");
        when(scheduleRepository.findActiveImportId()).thenReturn(Optional.of(91L));
        when(scheduleRepository.findStationMappings(91L, "line-2", stopIds))
            .thenReturn(List.of(
                new GtfsScheduleReadRepository.StationMapping("known", "old-mill", 30)
            ));
        when(stationAliasResolver.resolve("Unknown")).thenReturn(Optional.empty());
        when(stationAliasResolver.resolve("Islington")).thenReturn(Optional.of("islington"));

        GtfsRtRapidTransitStationResolver.Resolution result = resolver.resolve(
            "line-2",
            stopIds,
            "No service between Unknown and Islington stations."
        );

        assertThat(result.startStationId()).isEqualTo("old-mill");
        assertThat(result.endStationId()).isEqualTo("islington");
        assertThat(result.stationIds()).containsExactly("old-mill", "islington");
        assertThat(result.unresolved()).isTrue();
    }

    @Test
    void returnsLineWideUnresolvedScopeWhenNoStationCanBeDerived() {
        when(scheduleRepository.findActiveImportId()).thenReturn(Optional.empty());

        GtfsRtRapidTransitStationResolver.Resolution result = resolver.resolve(
            "line-2",
            List.of("13784"),
            "Line 2 service is suspended."
        );

        assertThat(result.stationIds()).isEmpty();
        assertThat(result.startStationId()).isNull();
        assertThat(result.endStationId()).isNull();
        assertThat(result.unresolved()).isTrue();
    }
}
