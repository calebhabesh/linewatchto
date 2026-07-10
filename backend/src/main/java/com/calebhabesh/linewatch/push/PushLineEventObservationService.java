package com.calebhabesh.linewatch.push;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushLineEventObservationService {
    private final PushLineEventObservationRepository observationRepository;
    private final PushLineSubscriptionRepository lineSubscriptionRepository;

    public PushLineEventObservationService(
        PushLineEventObservationRepository observationRepository,
        PushLineSubscriptionRepository lineSubscriptionRepository
    ) {
        this.observationRepository = observationRepository;
        this.lineSubscriptionRepository = lineSubscriptionRepository;
    }

    @Transactional
    public ObservationDecision observe(
        PushNotificationCandidate candidate,
        PushNotificationPreferenceEntity preferences,
        Instant now
    ) {
        return observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNullOrderByLastSeenAtDesc(
                candidate.accountId(),
                candidate.sourceIncidentKey()
            )
            .stream()
            .findFirst()
            .map(existing -> {
                existing.refresh(candidate, now);
                PushLineEventObservationEntity saved = observationRepository.save(existing);
                return new ObservationDecision(saved, false, false);
            })
            .orElseGet(() -> observationRepository.findByAccountIdAndNotificationKey(
                    candidate.accountId(),
                    candidate.notificationKey()
                )
                .map(previous -> {
                    previous.refresh(candidate, now);
                    PushLineEventObservationEntity saved = observationRepository.save(previous);
                    return new ObservationDecision(saved, true, silentBaseline(candidate, preferences));
                })
                .orElseGet(() -> {
                    PushLineEventObservationEntity created = PushLineEventObservationEntity.create(
                        PushLineEventObservationEntity.idFor(candidate.accountId(), candidate.sourceIncidentKey()),
                        candidate,
                        now
                    );
                    PushLineEventObservationEntity saved = observationRepository.save(created);
                    return new ObservationDecision(saved, true, silentBaseline(candidate, preferences));
                }));
    }

    @Transactional(readOnly = true)
    public List<PushLineEventObservationEntity> activeObservations(String accountId) {
        return observationRepository.findByAccountIdAndClearedAtIsNullOrderByLastSeenAtDesc(accountId);
    }

    @Transactional
    public void markCleared(PushLineEventObservationEntity observation, Instant now) {
        observation.markCleared(now);
        observationRepository.save(observation);
    }

    private boolean silentBaseline(PushNotificationCandidate candidate, PushNotificationPreferenceEntity preferences) {
        if (!"line-current".equals(candidate.category())) {
            return false;
        }
        if (!"reduced-speed-zone".equals(candidate.eventType())) {
            return false;
        }

        Instant streamStartedAt = streamStartedAt(candidate, preferences);
        Instant sourceEventAt = candidate.sourceEventAt();
        return sourceEventAt == null || !sourceEventAt.isAfter(streamStartedAt);
    }

    private Instant streamStartedAt(PushNotificationCandidate candidate, PushNotificationPreferenceEntity preferences) {
        Instant lineEnabledAt = lineSubscriptionRepository
            .findById(PushLineSubscriptionEntity.idFor(candidate.accountId(), candidate.lineId()))
            .map(PushLineSubscriptionEntity::getUpdatedAt)
            .orElseGet(preferences::getUpdatedAt);

        return Stream.of(lineEnabledAt, preferences.getUpdatedAt())
            .filter(value -> value != null)
            .max(Comparator.naturalOrder())
            .orElse(Instant.EPOCH);
    }

    public record ObservationDecision(
        PushLineEventObservationEntity observation,
        boolean firstObserved,
        boolean silentBaseline
    ) {
        public boolean shouldSendActive() {
            return firstObserved && !silentBaseline;
        }
    }
}
