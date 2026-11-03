package com.calebhabesh.linewatch.streetcarposition;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({StreetcarPositionProperties.class, BusPositionProperties.class})
public class StreetcarPositionConfiguration {
}
