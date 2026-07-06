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

    private static class ExposedCorsRegistry extends CorsRegistry {
        Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }
}
