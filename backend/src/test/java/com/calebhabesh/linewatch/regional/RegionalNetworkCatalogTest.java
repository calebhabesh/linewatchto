package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RegionalNetworkCatalogTest {
    @Test
    void exposesEightRoutesAndSeventyTwoNetworkScopedStations() {
        assertThat(RegionalNetworkCatalog.routes()).hasSize(8);
        assertThat(RegionalNetworkCatalog.stations()).hasSize(72);
        assertThat(RegionalNetworkCatalog.station("union")).get().satisfies(station -> {
            assertThat(station.interchange()).isTrue();
            assertThat(station.lineIds()).contains("regional-br", "regional-up");
        });
        assertThat(RegionalNetworkCatalog.station("finch")).isEmpty();
    }
}
