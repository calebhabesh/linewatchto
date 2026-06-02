package com.calebhabesh.linewatch.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

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
            .run(context ->
                assertThat(context.getBean(AlertIngestionProperties.class).isEnabled()).isTrue()
            );
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AlertIngestionProperties.class)
    static class PropertiesOnlyConfiguration {}
}
