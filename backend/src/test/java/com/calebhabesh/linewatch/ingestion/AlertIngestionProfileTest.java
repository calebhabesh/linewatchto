package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class AlertIngestionProfileTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withUserConfiguration(PropertiesOnlyConfiguration.class);

    @Test
    void defaultProfileLeavesAlertPollingDisabled() {
        contextRunner.run(context ->
            assertThat(context.getBean(AlertIngestionProperties.class).isEnabled()).isFalse()
        );
    }

    @Test
    void devLiveProfileEnablesAlertPolling() {
        contextRunner
            .withPropertyValues("spring.profiles.active=dev-live")
            .run(context -> {
                AlertIngestionProperties properties = context.getBean(AlertIngestionProperties.class);
                assertThat(properties.isEnabled()).isTrue();
                assertThat(properties.getFixedDelay()).isEqualTo(Duration.ofSeconds(15));
                assertThat(properties.getMaxDashboardAge()).isEqualTo(Duration.ofMinutes(2));
            });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AlertIngestionProperties.class)
    static class PropertiesOnlyConfiguration {}
}
