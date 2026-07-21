package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Test;

class PushSavedCommuteEventObservationServiceTest {
    private final PushSavedCommuteEventObservationRepository observationRepository =
        mock(PushSavedCommuteEventObservationRepository.class);
    private final PushSavedCommuteEventObservationService service =
        new PushSavedCommuteEventObservationService(observationRepository);

    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void createsSilentBaselineForCurrentImpactThatStartedBeforeSavedCommuteStream() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(Instant.parse("2026-06-05T13:00:00Z"));

        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            "user_1",
            "saved-commute-current|commute_1|outbound|rsz-line-1"
        )).thenReturn(List.of());
        when(observationRepository.save(any(PushSavedCommuteEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushSavedCommuteEventObservationService.ObservationDecision decision =
            service.observe(candidate, commute, preferences, Instant.parse("2026-06-05T15:01:00Z"));

        assertThat(decision.firstObserved()).isTrue();
        assertThat(decision.silentBaseline()).isTrue();
        assertThat(decision.shouldSendActive()).isFalse();
    }

    @Test
    void sendsActiveForCurrentImpactThatStartedAfterSavedCommuteStream() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(Instant.parse("2026-06-05T15:05:00Z"));

        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            "user_1",
            "saved-commute-current|commute_1|outbound|rsz-line-1"
        )).thenReturn(List.of());
        when(observationRepository.save(any(PushSavedCommuteEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushSavedCommuteEventObservationService.ObservationDecision decision =
            service.observe(candidate, commute, preferences, Instant.parse("2026-06-05T15:06:00Z"));

        assertThat(decision.firstObserved()).isTrue();
        assertThat(decision.silentBaseline()).isFalse();
        assertThat(decision.shouldSendActive()).isTrue();
    }

    @Test
    void unknownSourceStartIsTreatedAsSilentBaseline() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );
        PushNotificationCandidate candidate = candidate(null);

        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            "user_1",
            "saved-commute-current|commute_1|outbound|rsz-line-1"
        )).thenReturn(List.of());
        when(observationRepository.save(any(PushSavedCommuteEventObservationEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        PushSavedCommuteEventObservationService.ObservationDecision decision =
            service.observe(candidate, commute, preferences, Instant.parse("2026-06-05T15:06:00Z"));

        assertThat(decision.silentBaseline()).isTrue();
        assertThat(decision.shouldSendActive()).isFalse();
    }

    @Test
    void refreshesExistingObservationWithoutSendingActiveAgain() {
        PushNotificationCandidate firstCandidate = candidate(Instant.parse("2026-06-05T15:05:00Z"));
        PushSavedCommuteEventObservationEntity existing = PushSavedCommuteEventObservationEntity.create(
            "saved_obs_existing",
            firstCandidate,
            Instant.parse("2026-06-05T15:06:00Z")
        );
        PushNotificationCandidate refreshedCandidate = candidate(Instant.parse("2026-06-05T15:05:00Z"));
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1",
            account,
            "Morning commute",
            "finch",
            "union",
            true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account,
            Instant.parse("2026-06-05T14:30:00Z")
        );

        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            "user_1",
            "saved-commute-current|commute_1|outbound|rsz-line-1"
        )).thenReturn(List.of(existing));
        when(observationRepository.save(existing)).thenReturn(existing);

        PushSavedCommuteEventObservationService.ObservationDecision decision =
            service.observe(refreshedCandidate, commute, preferences, Instant.parse("2026-06-05T15:10:00Z"));

        assertThat(decision.firstObserved()).isFalse();
        assertThat(decision.shouldSendActive()).isFalse();
        assertThat(existing.getLastSeenAt()).isEqualTo(Instant.parse("2026-06-05T15:10:00Z"));
    }

    @Test
    void sendsActiveWhenAnExistingImpactHasAChangedSourceRevision() {
        PushNotificationCandidate firstCandidate = candidateWithSourceRevision(
            OffsetDateTime.parse("2026-06-05T11:05:00-04:00")
        );
        PushSavedCommuteEventObservationEntity existing = PushSavedCommuteEventObservationEntity.create(
            "saved_obs_existing", firstCandidate, Instant.parse("2026-06-05T15:06:00Z")
        );
        PushNotificationCandidate updatedCandidate = candidateWithSourceRevision(
            OffsetDateTime.parse("2026-06-05T11:08:00-04:00")
        );
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1", account, "Morning commute", "finch", "union", true,
            Instant.parse("2026-06-05T15:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account, Instant.parse("2026-06-05T14:30:00Z")
        );

        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            "user_1", "saved-commute-current|commute_1|outbound|rsz-line-1"
        )).thenReturn(List.of(existing));
        when(observationRepository.save(existing)).thenReturn(existing);

        PushSavedCommuteEventObservationService.ObservationDecision decision =
            service.observe(updatedCandidate, commute, preferences, Instant.parse("2026-06-05T15:10:00Z"));

        assertThat(decision.firstObserved()).isFalse();
        assertThat(decision.updated()).isTrue();
        assertThat(decision.shouldSendActive()).isTrue();
        assertThat(existing.getSourceUpdatedAt()).isEqualTo(Instant.parse("2026-06-05T15:08:00Z"));
    }

    @Test
    void silentlyMigratesLegacyFingerprintAfterBackendDeployment() throws Exception {
        OffsetDateTime sourceUpdatedAt = OffsetDateTime.parse("2026-07-21T15:30:00-04:00");
        PushNotificationCandidate candidate = candidateWithSourceRevision(sourceUpdatedAt);
        PushSavedCommuteEventObservationEntity existing = mock(PushSavedCommuteEventObservationEntity.class);
        when(existing.getUpdateFingerprint()).thenReturn(legacyFingerprint(candidate, sourceUpdatedAt));
        when(existing.getEventType()).thenReturn(candidate.eventType());
        when(existing.getEventLocation()).thenReturn(candidate.eventLocation());
        when(existing.getDisplayDirection()).thenReturn(candidate.displayDirection());
        when(existing.isDeliveryAllowed()).thenReturn(true);
        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            candidate.accountId(), candidate.sourceIncidentKey()
        )).thenReturn(List.of(existing));
        when(observationRepository.save(existing)).thenReturn(existing);

        PushSavedCommuteEventObservationService.ObservationDecision decision = service.observe(
            candidate,
            SavedCommuteEntity.create(
                "commute_1", account, "Morning commute", "finch", "union", true,
                Instant.parse("2026-06-05T15:00:00Z")
            ),
            PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:30:00Z")),
            Instant.parse("2026-07-21T19:31:00Z")
        );

        assertThat(decision.updated()).isFalse();
        assertThat(decision.shouldSendActive()).isFalse();
        verify(existing).refresh(candidate, Instant.parse("2026-07-21T19:31:00Z"));
    }

    @Test
    void sendsAnUnchangedImpactOnceWhenItsNaturalNotificationWindowOpens() {
        SavedCommuteEntity commute = SavedCommuteEntity.create(
            "commute_1", account, "Morning commute", "finch", "union", true,
            Instant.parse("2026-06-05T12:00:00Z")
        );
        PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(
            account, Instant.parse("2026-06-05T12:00:00Z")
        );
        PushNotificationCandidate outsideWindow = candidate(
            Instant.parse("2026-06-05T12:50:00Z"), "revision-one", false
        );
        PushSavedCommuteEventObservationEntity existing = PushSavedCommuteEventObservationEntity.create(
            "saved_obs_existing", outsideWindow, Instant.parse("2026-06-05T12:59:00Z")
        );
        PushNotificationCandidate insideWindow = candidate(
            Instant.parse("2026-06-05T12:50:00Z"), "revision-one", true
        );

        when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
            "user_1", "saved-commute-current|commute_1|outbound|rsz-line-1"
        )).thenReturn(List.of(existing));
        when(observationRepository.save(existing)).thenReturn(existing);

        PushSavedCommuteEventObservationService.ObservationDecision decision = service.observe(
            insideWindow, commute, preferences, Instant.parse("2026-06-05T13:00:00Z")
        );

        assertThat(decision.becameEligible()).isTrue();
        assertThat(decision.shouldSendActive()).isTrue();
    }

    @Test
    void activeObservationsReturnsRepositoryRows() {
        when(observationRepository.findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc("user_1"))
            .thenReturn(List.of());

        assertThat(service.activeObservations("user_1")).isEmpty();
    }

    private PushNotificationCandidate candidate(Instant sourceEventAt) {
        return candidate(sourceEventAt, PushNotificationUpdateFingerprint.forCandidate(
            null, "reduced-speed-zone", null, "/?panel=commutes&commute=commute_1"
        ));
    }

    private PushNotificationCandidate candidate(Instant sourceEventAt, String updateFingerprint) {
        return candidate(sourceEventAt, updateFingerprint, true);
    }

    private PushNotificationCandidate candidate(
        Instant sourceEventAt,
        String updateFingerprint,
        boolean deliveryAllowed
    ) {
        FormattedPushNotification notification = new PushNotificationFormatter().formatActive(
            new PushNotificationFacts(
                "line-1",
                "1",
                "reduced-speed-zone",
                "on-change",
                "Eglinton to Davisville",
                null,
                false,
                "Morning commute",
                "outbound",
                sourceEventAt
            )
        );
        return new PushNotificationCandidate(
            "user_1",
            "commute_1",
            "outbound",
            "line-1",
            "1",
            "saved-commute-current",
            "reduced-speed-zone",
            "on-change",
            "saved-commute-current|commute_1|outbound|rsz-line-1",
            "saved-commute-current|commute_1|outbound|reduced-speed-zone|rsz-line-1",
            "user_1|commute_1|outbound|reduced-speed-zone|on-change|rsz-line-1|segments:line-1-eglinton-davisville|stations:",
            notification,
            "/?panel=commutes&commute=commute_1",
            updateFingerprint,
            deliveryAllowed
        );
    }

    private PushNotificationCandidate candidateWithSourceRevision(OffsetDateTime sourceUpdatedAt) {
        PushNotificationCandidate base = candidate(
            Instant.parse("2026-07-10T14:22:00Z"),
            "placeholder-current-fingerprint"
        );
        String currentFingerprint = PushNotificationUpdateFingerprint.forCandidate(
            sourceUpdatedAt,
            base.eventType(),
            base.notification(),
            base.url()
        );
        return new PushNotificationCandidate(
            base.accountId(), base.commuteId(), base.legId(), base.lineId(), base.lineNumber(),
            base.category(), base.eventType(), base.reminderBucket(), base.sourceIncidentKey(),
            base.notificationKey(), base.dedupeKey(), base.notification(), base.url(),
            currentFingerprint, base.deliveryAllowed(), sourceUpdatedAt.toInstant()
        );
    }

    private String legacyFingerprint(
        PushNotificationCandidate candidate,
        OffsetDateTime sourceUpdatedAt
    ) throws Exception {
        String value = String.join("\u001f",
            normalize(sourceUpdatedAt.toInstant().toString()),
            normalize(candidate.eventType()),
            normalize(candidate.title()),
            normalize(candidate.body()),
            normalize(candidate.eventLocation()),
            normalize(candidate.displayDirection()),
            normalize(candidate.url())
        );
        return HexFormat.of().formatHex(
            MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
        );
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }
}
