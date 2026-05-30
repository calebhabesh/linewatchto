package com.calebhabesh.linewatch.health;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class HealthControllerTest {

    @Test
    void healthReturnsLinewatchServiceStatus() {
        HealthController controller = new HealthController();

        HealthController.HealthResponse response = controller.health();

        assertThat(response.service()).isEqualTo("linewatch-backend");
        assertThat(response.status()).isEqualTo("ok");
    }
}
