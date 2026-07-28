package com.calebhabesh.linewatch.regional;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class MetrolinxPropertiesTest {
    @Test
    void isDisabledAndUnconfiguredByDefault() {
        MetrolinxProperties properties = new MetrolinxProperties();

        assertThat(properties.isEnabled()).isFalse();
        assertThat(properties.isConfigured()).isFalse();
        assertThat(properties.getApiKey()).isEmpty();
        assertThat(properties.getFixedDelay()).isEqualTo(Duration.ofMinutes(2));
        assertThat(properties.getMaxDashboardAge()).isEqualTo(Duration.ofMinutes(10));
    }
}
