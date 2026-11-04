package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class RegionalCommutePathServiceTest {
    private final RegionalCommutePathService service = new RegionalCommutePathService();

    @Test
    void computesDirectKitchenerCorridorPathWithoutDetouringThroughUnion() {
        var path = service.path("bloor", "stratford");

        assertThat(path.status()).isEqualTo("available");
        assertThat(path.stationIds()).startsWith("bloor", "mount-dennis", "weston").endsWith("stratford");
        assertThat(path.lineIds()).containsExactly("regional-ki");
        assertThat(path.transferStationIds()).isEmpty();
        assertThat(path.weightSource()).isEqualTo("regional-topology-estimate");
        assertThat(path.summary()).contains("KI", "planning estimate");
    }

    @Test
    void choosesUpExpressForSharedAirportRoute() {
        var path = service.path("bloor", "pearson-airport");

        assertThat(path.stationIds()).containsExactly("bloor", "mount-dennis", "weston", "pearson-airport");
        assertThat(path.lineIds()).containsExactly("regional-up");
        assertThat(path.segmentHops()).allSatisfy(hop -> assertThat(hop.lineId()).isEqualTo("regional-up"));
    }

    @Test
    void routesAcrossCorridorsWithReviewedUnionTransfer() {
        var path = service.path("oakville", "ajax");

        assertThat(path.lineIds()).containsExactly("regional-lw", "regional-le");
        assertThat(path.transferStationIds()).containsExactly("union");
        assertThat(path.stationIds()).containsSubsequence("exhibition", "union", "danforth");
    }

    @Test
    void timesSingleLineRideFromTripsThatStopAtBothStations() {
        RegionalGtfsScheduleRepository repository = repository("go:1:100", lakeshoreWestLinks(
            pair("union", "clarkson", 1_800) // Express and local trips both stop at Union and Clarkson.
        ));
        var path = new RegionalCommutePathService(repository).path("union", "clarkson");

        assertThat(path.stationIds()).containsExactly("union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson");
        assertThat(path.estimatedTravelSeconds()).isEqualTo(1_800);
        assertThat(path.weightSource()).isEqualTo(RegionalCommutePathService.SCHEDULED_SOURCE);
        assertThat(path.summary()).isEqualTo("Default scheduled regional route: 6 stations on LW, about 30 min");
    }

    @Test
    void sumsDirectionalLinkTimesWhenNoTripServesBothEnds() {
        RegionalGtfsScheduleRepository repository = repository("go:1:100", List.of(
            pair("union", "exhibition", 480),
            pair("exhibition", "union", 540),
            pair("exhibition", "mimico", 420)
        ));
        var outbound = new RegionalCommutePathService(repository).path("union", "mimico");
        var inbound = new RegionalCommutePathService(repository).path("mimico", "union");

        assertThat(outbound.estimatedTravelSeconds()).isEqualTo(480 + 420);
        // Mimico to Exhibition has no inbound time, so it borrows the outbound run time.
        assertThat(inbound.estimatedTravelSeconds()).isEqualTo(420 + 540);
        assertThat(outbound.weightSource()).isEqualTo(RegionalCommutePathService.SCHEDULED_SOURCE);
    }

    @Test
    void addsTransferAllowanceBetweenScheduledLegs() {
        List<RegionalGtfsScheduleRepository.StationPairTime> pairs = new ArrayList<>(lakeshoreWestLinks(
            pair("oakville", "union", 2_400)
        ));
        pairs.add(pair("union", "danforth", 720, "regional-le"));
        pairs.add(pair("danforth", "scarborough", 360, "regional-le"));
        RegionalGtfsScheduleRepository repository = repository("go:1:100", pairs);

        var path = new RegionalCommutePathService(repository).path("oakville", "scarborough");

        assertThat(path.transferStationIds()).containsExactly("union");
        assertThat(path.estimatedTravelSeconds())
            .isEqualTo(2_400 + RegionalCommutePathService.TRANSFER_SECONDS + 720 + 360);
        assertThat(path.weightSource()).isEqualTo(RegionalCommutePathService.SCHEDULED_SOURCE);
    }

    @Test
    void labelsPathsWithUntimedLinksAsPlanningEstimates() {
        RegionalGtfsScheduleRepository repository = repository("go:1:100", List.of(
            pair("union", "exhibition", 480)
        ));
        var path = new RegionalCommutePathService(repository).path("union", "mimico");

        assertThat(path.estimatedTravelSeconds()).isEqualTo(480 + RegionalCommutePathService.GO_SEGMENT_SECONDS);
        assertThat(path.weightSource()).isEqualTo(RegionalCommutePathService.MIXED_SOURCE);
        assertThat(path.summary()).contains("planning estimate");
    }

    @Test
    void reloadsRideTimesOnlyWhenTheActiveImportsChange() {
        RegionalGtfsScheduleRepository repository = repository("go:1:100", List.of(
            pair("union", "exhibition", 480)
        ));
        RegionalCommutePathService pathService = new RegionalCommutePathService(repository);

        assertThat(pathService.path("union", "exhibition").estimatedTravelSeconds()).isEqualTo(480);
        assertThat(pathService.path("exhibition", "union").estimatedTravelSeconds()).isEqualTo(480);
        verify(repository, times(1)).scheduledStationPairTimes();

        when(repository.activeImportSignature()).thenReturn("go:2:200");
        when(repository.scheduledStationPairTimes()).thenReturn(List.of(pair("union", "exhibition", 540)));
        assertThat(pathService.path("union", "exhibition").estimatedTravelSeconds()).isEqualTo(540);
        verify(repository, times(2)).scheduledStationPairTimes();
    }

    @Test
    void keepsPreviousRideTimesWhenTheScheduleCannotBeRead() {
        RegionalGtfsScheduleRepository repository = repository("go:1:100", List.of(
            pair("union", "exhibition", 480)
        ));
        RegionalCommutePathService pathService = new RegionalCommutePathService(repository);
        assertThat(pathService.path("union", "exhibition").estimatedTravelSeconds()).isEqualTo(480);

        when(repository.activeImportSignature()).thenReturn("go:2:200");
        when(repository.scheduledStationPairTimes()).thenThrow(new IllegalStateException("database down"));
        assertThat(pathService.path("union", "exhibition").estimatedTravelSeconds()).isEqualTo(480);

        when(repository.activeImportSignature()).thenThrow(new IllegalStateException("database down"));
        assertThat(pathService.path("union", "exhibition").estimatedTravelSeconds()).isEqualTo(480);
    }

    @Test
    void usesTopologyWeightsWithoutAnActiveImport() {
        RegionalGtfsScheduleRepository repository = repository("", List.of());
        var path = new RegionalCommutePathService(repository).path("union", "mimico");

        assertThat(path.estimatedTravelSeconds()).isEqualTo(2 * RegionalCommutePathService.GO_SEGMENT_SECONDS);
        assertThat(path.weightSource()).isEqualTo(RegionalCommutePathService.TOPOLOGY_SOURCE);
        verify(repository, times(0)).scheduledStationPairTimes();
    }

    private static RegionalGtfsScheduleRepository repository(
        String signature, List<RegionalGtfsScheduleRepository.StationPairTime> pairs
    ) {
        RegionalGtfsScheduleRepository repository = mock(RegionalGtfsScheduleRepository.class);
        when(repository.activeImportSignature()).thenReturn(signature);
        when(repository.scheduledStationPairTimes()).thenReturn(pairs);
        return repository;
    }

    /** Both directions of every Lakeshore West link from Union to Oakville, plus any extra pairs. */
    private static List<RegionalGtfsScheduleRepository.StationPairTime> lakeshoreWestLinks(
        RegionalGtfsScheduleRepository.StationPairTime... extra
    ) {
        List<String> stations = List.of("union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson", "oakville");
        List<RegionalGtfsScheduleRepository.StationPairTime> pairs = new ArrayList<>();
        for (int index = 0; index < stations.size() - 1; index++) {
            pairs.add(pair(stations.get(index), stations.get(index + 1), 420));
            pairs.add(pair(stations.get(index + 1), stations.get(index), 420));
        }
        pairs.addAll(List.of(extra));
        return pairs;
    }

    private static RegionalGtfsScheduleRepository.StationPairTime pair(String from, String to, int seconds) {
        return pair(from, to, seconds, "regional-lw");
    }

    private static RegionalGtfsScheduleRepository.StationPairTime pair(String from, String to, int seconds, String lineId) {
        return new RegionalGtfsScheduleRepository.StationPairTime(lineId, from, to, seconds, 10);
    }
}
