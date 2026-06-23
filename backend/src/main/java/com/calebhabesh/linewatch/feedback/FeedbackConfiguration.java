package com.calebhabesh.linewatch.feedback;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(FeedbackProperties.class)
public class FeedbackConfiguration {}
