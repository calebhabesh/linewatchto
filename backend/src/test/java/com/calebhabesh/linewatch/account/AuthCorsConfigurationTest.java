package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

class AuthCorsConfigurationTest {
    @Test
    void accountPatchEndpointsAreAllowedForCrossOriginDevClients() {
        ExposedCorsRegistry registry = new ExposedCorsRegistry();

        new AuthCorsConfiguration(List.of("http://localhost:3000")).addCorsMappings(registry);

        CorsConfiguration configuration = registry.configurations().get("/api/**");
        assertThat(configuration).isNotNull();
        assertThat(configuration.getAllowedMethods()).contains("PATCH");
    }

    @Test
    void allowsScenarioFrontendPorts() {
        ExposedCorsRegistry registry = new ExposedCorsRegistry();

        new AuthCorsConfiguration(List.of(
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
            "http://localhost:3002",
            "http://127.0.0.1:3002"
        )).addCorsMappings(registry);

        CorsConfiguration configuration = registry.configurations().get("/api/**");
        assertThat(configuration).isNotNull();
        assertThat(configuration.checkOrigin("http://localhost:3001")).isEqualTo("http://localhost:3001");
        assertThat(configuration.checkOrigin("http://localhost:3002")).isEqualTo("http://localhost:3002");
        assertThat(configuration.checkOrigin("http://127.0.0.1:3002")).isEqualTo("http://127.0.0.1:3002");
        assertThat(configuration.checkOrigin("http://localhost:4999")).isNull();
    }

    private static class ExposedCorsRegistry extends CorsRegistry {
        Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }
}
