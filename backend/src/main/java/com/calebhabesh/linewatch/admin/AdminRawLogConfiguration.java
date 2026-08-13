package com.calebhabesh.linewatch.admin;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(AdminRawLogProperties.class)
public class AdminRawLogConfiguration {
}
