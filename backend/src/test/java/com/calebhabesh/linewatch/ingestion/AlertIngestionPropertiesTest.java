package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import org.junit.jupiter.api.Test;

class AlertIngestionPropertiesTest {
    @Test
    void surfaceGtfsRtServiceAlertSupplementDefaultsToBusAndStreetcar() {
        AlertIngestionProperties properties = new AlertIngestionProperties();

        assertThat(properties.isSurfaceGtfsRtEnabled()).isTrue();
        assertThat(properties.getSurfaceGtfsRtUrls()).containsExactly(
            URI.create("https://gtfsrt.ttc.ca/alerts/bus?format=text"),
            URI.create("https://gtfsrt.ttc.ca/alerts/streetcar?format=text")
        );
    }
}
