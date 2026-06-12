package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class VapidWebPushClientSpringContextTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(PushConfiguration.class, VapidWebPushClient.class);

    @Test
    void createsWebPushClientBeanWithConfiguredPushProperties() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(PushProperties.class);
            assertThat(context).hasSingleBean(WebPushClient.class);
        });
    }
}
