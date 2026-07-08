package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushSavedCommuteEventObservationService {
    private final PushSavedCommuteEventObservationRepository observationRepository;

    public PushSavedCommuteEventObservationService(
        PushSavedCommuteEventObservationRepository observationRepository
    ) {
        this.observationRepository = observationRepository;
    }

    @Transactional
    public ObservationDecision observe(
        PushNotificationCandidate candidate,
        SavedCommuteEntity commute,
        PushNotificationPreferenceEntity preferences,
        Instant now
    ) {
        return observationRepository
            .findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
                candidate.accountId(),
                candidate.sourceIncidentKey()
            )
            .stream()
            .findFirst()
            .map(existing -> {
                existing.refresh(candidate, now);
                PushSavedCommuteEventObservationEntity saved = observationRepository.save(existing);
                return new ObservationDecision(saved, false, false);
            })
            .orElseGet(() -> {
                PushSavedCommuteEventObservationEntity created = PushSavedCommuteEventObservationEntity.create(
                    PushSavedCommuteEventObservationEntity.idFor(candidate.accountId(), candidate.sourceIncidentKey()),
                    candidate,
                    now
                );
                PushSavedCommuteEventObservationEntity saved = observationRepository.save(created);
                return new ObservationDecision(saved, true, silentBaseline(candidate, commute, preferences));
            });
    }

    @Transactional(readOnly = true)
    public List<PushSavedCommuteEventObservationEntity> activeObservations(String accountId) {
        return observationRepository.findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc(accountId);
    }

    @Transactional
    public void markCleared(PushSavedCommuteEventObservationEntity observation, Instant now) {
        observation.markCleared(now);
        observationRepository.save(observation);
    }

    private boolean silentBaseline(
        PushNotificationCandidate candidate,
        SavedCommuteEntity commute,
        PushNotificationPreferenceEntity preferences
    ) {
        if (!savedCommuteCurrentCategory(candidate.category())) {
            return false;
        }
        Instant sourceEventAt = candidate.sourceEventAt();
        return sourceEventAt == null || !sourceEventAt.isAfter(streamStartedAt(commute, preferences));
    }

    private boolean savedCommuteCurrentCategory(String category) {
        return "saved-commute-current".equals(category) || "saved-commute-impact".equals(category);
    }

    private Instant streamStartedAt(SavedCommuteEntity commute, PushNotificationPreferenceEntity preferences) {
        Instant commuteUpdatedAt = commute == null ? null : commute.getUpdatedAt();
        Instant commuteCreatedAt = commute == null ? null : commute.getCreatedAt();
        Instant preferencesUpdatedAt = preferences == null ? null : preferences.getUpdatedAt();
        return Stream.of(commuteUpdatedAt, commuteCreatedAt, preferencesUpdatedAt)
            .filter(value -> value != null)
            .max(Comparator.naturalOrder())
            .orElse(Instant.EPOCH);
    }

    public record ObservationDecision(
        PushSavedCommuteEventObservationEntity observation,
        boolean firstObserved,
        boolean silentBaseline
    ) {
        public boolean shouldSendActive() {
            return firstObserved && !silentBaseline;
        }
    }
}
