package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AlertIngestionPropertiesTest {
    @Test
    void gtfsRtServiceAlertSupplementIsOptInByDefault() {
        AlertIngestionProperties properties = new AlertIngestionProperties();

        assertThat(properties.isSurfaceGtfsRtEnabled()).isFalse();
    }
}
