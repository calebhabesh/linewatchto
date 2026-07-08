package com.calebhabesh.linewatch.maintenance;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(MaintenanceCleanupProperties.class)
public class MaintenanceCleanupConfiguration {
}
