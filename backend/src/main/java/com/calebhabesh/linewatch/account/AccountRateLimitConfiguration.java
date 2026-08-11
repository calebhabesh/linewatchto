package com.calebhabesh.linewatch.account;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties({AccountRateLimitProperties.class, TrustedProxyProperties.class})
public class AccountRateLimitConfiguration {
}
