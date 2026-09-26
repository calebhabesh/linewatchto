package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.calebhabesh.linewatch.account.SavedCommuteRepository;
import com.calebhabesh.linewatch.alert.AlertHistoryRepository;
import com.calebhabesh.linewatch.ingestion.IngestionFreshness;
import com.calebhabesh.linewatch.regional.RegionalIngestionFreshness;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class PushWiringSpringContextTest {

    @Configuration
    static class MockCollaboratorsConfiguration {
        @Bean SavedCommuteRepository savedCommuteRepository() { return mock(SavedCommuteRepository.class); }
        @Bean PushNotificationEventRepository pushNotificationEventRepository() { return mock(PushNotificationEventRepository.class); }
        @Bean PushSubscriptionRepository pushSubscriptionRepository() { return mock(PushSubscriptionRepository.class); }
        @Bean PushNotificationDeliveryRepository pushNotificationDeliveryRepository() { return mock(PushNotificationDeliveryRepository.class); }
        @Bean PushNotificationClientEventRepository pushNotificationClientEventRepository() { return mock(PushNotificationClientEventRepository.class); }
        @Bean WebPushClient webPushClient() { return mock(WebPushClient.class); }
        @Bean PushNotificationPreferenceService pushNotificationPreferenceService() { return mock(PushNotificationPreferenceService.class); }
        @Bean SavedCommutePushPlanner savedCommutePushPlanner() { return mock(SavedCommutePushPlanner.class); }
        @Bean LineSubscriptionPushPlanner lineSubscriptionPushPlanner() { return mock(LineSubscriptionPushPlanner.class); }
        @Bean RegionalLineSubscriptionPushPlanner regionalLineSubscriptionPushPlanner() { return mock(RegionalLineSubscriptionPushPlanner.class); }
        @Bean PushLineEventObservationService pushLineEventObservationService() { return mock(PushLineEventObservationService.class); }
        @Bean PushSavedCommuteEventObservationService pushSavedCommuteEventObservationService() { return mock(PushSavedCommuteEventObservationService.class); }
        @Bean PushNotificationFormatter pushNotificationFormatter() { return mock(PushNotificationFormatter.class); }
        @Bean PushReceiptTokenService pushReceiptTokenService() { return mock(PushReceiptTokenService.class); }
        @Bean IngestionFreshness ingestionFreshness() { return mock(IngestionFreshness.class); }
        @Bean RegionalIngestionFreshness regionalIngestionFreshness() { return mock(RegionalIngestionFreshness.class); }
        @Bean AlertHistoryRepository alertHistoryRepository() { return mock(AlertHistoryRepository.class); }
        @Bean PushSubscriptionLifecycleService pushSubscriptionLifecycleService() { return mock(PushSubscriptionLifecycleService.class); }
    }

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withUserConfiguration(
            PushConfiguration.class,
            MockCollaboratorsConfiguration.class,
            PushCandidateResolver.class,
            PushDeliveryDiagnosticsService.class,
            PushNotificationService.class,
            PushNotificationDispatchService.class
        );

    @Test
    void verifiesProductionSpringWiringResolvesPushBeansWithNonNullCollaborators() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(PushProperties.class);
            assertThat(context).hasSingleBean(PushCandidateResolver.class);
            assertThat(context).hasSingleBean(PushDeliveryDiagnosticsService.class);
            assertThat(context).hasSingleBean(PushNotificationService.class);
            assertThat(context).hasSingleBean(PushNotificationDispatchService.class);
        });
    }
}
