package com.calebhabesh.linewatch.cache;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(DashboardCacheProperties.class)
public class DashboardCacheConfiguration {}
