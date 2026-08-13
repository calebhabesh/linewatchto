package com.calebhabesh.linewatch.diagnostics;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(RawAlertDiagnosticsProperties.class)
public class RawAlertDiagnosticsConfiguration {
}
