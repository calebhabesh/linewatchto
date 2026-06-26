package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class PushLineEventObservationServiceTest {
    private final PushLineEventObservationRepository observationRepository = mock(PushLineEventObservationRepository.class);
    private final PushLineSubscriptionRepository lineSubscriptionRepository = mock(PushLineSubscriptionRepository.class);
    private final PushLineEventObservationService service = new PushLineEventObservationService(
        observationRepository,
        lineSubscriptionRepository
    );

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void createsSilentBaselineForReducedSpeedZoneThatStartedBeforeStream() {
        PushLineSubscriptionEntity lineSub = PushLineSubscriptionEntity.create(
            account,
            "line-1",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "line-1",
            "1",
            "reduced-speed-zone",
            "line-current|line-1|reduced-speed-zone|rsz-1",
            Instant.parse("2026-06-05T13:00:00Z")
        );

        when(observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
            "user_1",
            "line-current|line-1|reduced-speed-zone|rsz-1"
        )).thenReturn(Optional.empty());
        when(lineSubscriptionRepository.findById("user_1:line-1")).thenReturn(Optional.of(lineSub));
        when(observationRepository.save(any(PushLineEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushLineEventObservationService.ObservationDecision decision =
            service.observe(candidate, preferences, Instant.parse("2026-06-05T15:01:00Z"));

        assertThat(decision.firstObserved()).isTrue();
        assertThat(decision.silentBaseline()).isTrue();
        assertThat(decision.shouldSendActive()).isFalse();
    }

    @Test
    void sendsActiveForReducedSpeedZoneThatStartedAfterStream() {
        PushLineSubscriptionEntity lineSub = PushLineSubscriptionEntity.create(
            account,
            "line-1",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(
            "line-1",
            "1",
            "reduced-speed-zone",
            "line-current|line-1|reduced-speed-zone|rsz-2",
            Instant.parse("2026-06-05T15:05:00Z")
        );

        when(observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
            "user_1",
            "line-current|line-1|reduced-speed-zone|rsz-2"
        )).thenReturn(Optional.empty());
        when(lineSubscriptionRepository.findById("user_1:line-1")).thenReturn(Optional.of(lineSub));
        when(observationRepository.save(any(PushLineEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushLineEventObservationService.ObservationDecision decision =
            service.observe(candidate, preferences, Instant.parse("2026-06-05T15:06:00Z"));

        assertThat(decision.firstObserved()).isTrue();
        assertThat(decision.silentBaseline()).isFalse();
        assertThat(decision.shouldSendActive()).isTrue();
    }

    @Test
    void refreshesExistingObservationWithoutSendingActiveAgain() {
        PushNotificationCandidate candidate = candidate(
            "line-1",
            "1",
            "reduced-speed-zone",
            "line-current|line-1|reduced-speed-zone|rsz-1",
            Instant.parse("2026-06-05T15:05:00Z")
        );
        PushLineEventObservationEntity existing = PushLineEventObservationEntity.create(
            "line_obs_existing",
            candidate,
            Instant.parse("2026-06-05T15:06:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );

        when(observationRepository.findByAccountIdAndNotificationKeyAndClearedAtIsNull(
            "user_1",
            "line-current|line-1|reduced-speed-zone|rsz-1"
        )).thenReturn(Optional.of(existing));
        when(observationRepository.save(existing)).thenReturn(existing);

        PushLineEventObservationService.ObservationDecision decision =
            service.observe(candidate, preferences, Instant.parse("2026-06-05T15:10:00Z"));

        assertThat(decision.firstObserved()).isFalse();
        assertThat(decision.shouldSendActive()).isFalse();
        assertThat(existing.getLastSeenAt()).isEqualTo(Instant.parse("2026-06-05T15:10:00Z"));
    }

    @Test
    void activeObservationsReturnsRepositoryRows() {
        when(observationRepository.findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc("user_1"))
            .thenReturn(List.of());

        assertThat(service.activeObservations("user_1")).isEmpty();
    }

    private PushNotificationCandidate candidate(
        String lineId,
        String lineNumber,
        String eventType,
        String notificationKey,
        Instant sourceEventAt
    ) {
        FormattedPushNotification notification = new PushNotificationFormatter().formatActive(
            new PushNotificationFacts(
                lineId,
                lineNumber,
                eventType,
                "on-change",
                "Eglinton to Davisville",
                null,
                false,
                null,
                null,
                sourceEventAt
            )
        );
        return new PushNotificationCandidate(
            "user_1",
            null,
            null,
            lineId,
            lineNumber,
            "line-current",
            eventType,
            "on-change",
            notificationKey,
            "user_1|line|" + lineId + "|" + eventType + "|on-change|source",
            notification,
            "/?panel=reduced-speed-zones"
        );
    }
}
