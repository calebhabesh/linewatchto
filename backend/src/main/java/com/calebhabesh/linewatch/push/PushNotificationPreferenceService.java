package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import com.calebhabesh.linewatch.account.AccountRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PushNotificationPreferenceService {
    private final PushNotificationPreferenceRepository preferenceRepository;
    private final PushLineSubscriptionRepository lineSubscriptionRepository;
    private final AccountRepository accountRepository;
    private final Clock clock;


    @Autowired
    public PushNotificationPreferenceService(
        PushNotificationPreferenceRepository preferenceRepository,
        PushLineSubscriptionRepository lineSubscriptionRepository,
        AccountRepository accountRepository
    ) {
        this(preferenceRepository, lineSubscriptionRepository, accountRepository, Clock.systemUTC());
    }

    public PushNotificationPreferenceService(
        PushNotificationPreferenceRepository preferenceRepository,
        PushLineSubscriptionRepository lineSubscriptionRepository,
        AccountRepository accountRepository,
        Clock clock
    ) {
        this.preferenceRepository = preferenceRepository;
        this.lineSubscriptionRepository = lineSubscriptionRepository;
        this.accountRepository = accountRepository;
        this.clock = clock;
    }

    @Transactional
    public PushResponses.PushPreferencesResponse preferencesFor(AccountEntity account) {
        PushNotificationPreferenceEntity prefs = preferenceRepository.findById(account.getId())
            .orElseGet(() -> {
                PushNotificationPreferenceEntity newPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
                return preferenceRepository.save(newPrefs);
            });

        List<PushLineSubscriptionEntity> lineSubs = lineSubscriptionRepository.findByAccountIdOrderByLineIdAsc(account.getId());
        List<PushResponses.LineSubscriptionResponse> lineResponses = new ArrayList<>();

        for (PushLineCatalog.LineMetadata line : PushLineCatalog.supportedLines()) {
            PushLineSubscriptionEntity sub = lineSubs.stream()
                .filter(s -> s.getLineId().equals(line.id()))
                .findFirst()
                .orElseGet(() -> {
                    PushLineSubscriptionEntity newSub = PushLineSubscriptionEntity.create(account, line.id(), false, clock.instant());
                    return lineSubscriptionRepository.save(newSub);
                });
            lineResponses.add(new PushResponses.LineSubscriptionResponse(
                line.id(),
                line.number(),
                line.label(),
                sub.isEnabled()
            ));
        }

        return toPreferencesResponse(prefs, lineResponses);
    }

    @Transactional
    public PushResponses.PushPreferencesResponse updatePreferences(AccountEntity account, PushRequests.UpdatePushPreferencesRequest request) {
        PushNotificationPreferenceEntity prefs = preferenceRepository.findById(account.getId())
            .orElseGet(() -> {
                PushNotificationPreferenceEntity newPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
                return preferenceRepository.save(newPrefs);
            });

        if (request.plannedClosureFollowUp() != null) {
            try {
                PlannedClosureFollowUpPolicy.fromApiValue(request.plannedClosureFollowUp());
            } catch (IllegalArgumentException exception) {
                throw new AccountException(
                    HttpStatus.BAD_REQUEST,
                    "invalid_planned_closure_follow_up",
                    "Planned closure follow-up must be smart, within-24-hours, day-of, or announcements-only."
                );
            }
        }

        Instant now = clock.instant();
        prefs.updateFrom(request, now);
        preferenceRepository.save(prefs);

        if (request.lineSubscriptions() != null && request.lineSubscriptions().lines() != null) {
            for (PushRequests.LineSubscriptionSelectionRequest selection : request.lineSubscriptions().lines()) {
                String lineId = selection.lineId();
                boolean isSupported = PushLineCatalog.supportedLines().stream().anyMatch(line -> line.id().equals(lineId));
                if (!isSupported) {
                    throw new AccountException(HttpStatus.BAD_REQUEST, "invalid_line_subscription", "Line subscription not supported for: " + lineId);
                }

                String subId = PushLineSubscriptionEntity.idFor(account.getId(), lineId);
                PushLineSubscriptionEntity sub = lineSubscriptionRepository.findById(subId)
                    .map(existing -> {
                        if (selection.subscribed() != null) {
                            existing.setEnabled(selection.subscribed(), now);
                        }
                        return existing;
                    })
                    .orElseGet(() -> PushLineSubscriptionEntity.create(account, lineId, selection.subscribed() != null && selection.subscribed(), now));
                lineSubscriptionRepository.save(sub);
            }
        }

        return preferencesFor(account);
    }

    @Transactional(readOnly = true)
    public boolean allows(PushNotificationPreferenceEntity preferences, PushNotificationCandidate candidate) {
        if ("planned-closure".equals(candidate.eventType())
            && !preferences.getPlannedClosureFollowUpPolicy().allowsReminderBucket(candidate.reminderBucket())) {
            return false;
        }

        if (candidate.savedCommuteScoped()) {
            if ("saved-commute-current".equals(candidate.category()) && !preferences.isSavedCommuteCurrentEnabled()) {
                return false;
            }
            if ("saved-commute-planned".equals(candidate.category()) && !preferences.isSavedCommutePlannedEnabled()) {
                return false;
            }

            String eventType = candidate.eventType();
            boolean eventTypeAllowed = switch (eventType) {
                case "suspension" -> preferences.isSavedCommuteSuspensionEnabled();
                case "delay" -> preferences.isSavedCommuteDelayEnabled();
                case "reduced-speed-zone" -> preferences.isSavedCommuteReducedSpeedZoneEnabled();
                case "planned-closure" -> preferences.isSavedCommutePlannedClosureEnabled();
                case "service-restored" -> preferences.isSavedCommuteRestoredEnabled();
                default -> true;
            };
            if (!eventTypeAllowed) {
                return false;
            }
        } else if (candidate.lineScoped()) {
            String subId = PushLineSubscriptionEntity.idFor(preferences.getAccountId(), candidate.lineId());
            boolean subscribed = lineSubscriptionRepository.findById(subId)
                .map(PushLineSubscriptionEntity::isEnabled)
                .orElse(false);
            if (!subscribed) {
                return false;
            }

            String eventType = candidate.eventType();
            boolean eventTypeAllowed = switch (eventType) {
                case "suspension" -> preferences.isLineSuspensionEnabled();
                case "delay" -> preferences.isLineDelayEnabled();
                case "reduced-speed-zone" -> preferences.isLineReducedSpeedZoneEnabled();
                case "planned-closure" -> preferences.isLinePlannedClosureEnabled();
                case "service-restored" -> preferences.isLineRestoredEnabled();
                default -> true;
            };
            if (!eventTypeAllowed) {
                return false;
            }
        } else {
            return false;
        }

        return true;
    }

    @Transactional(readOnly = true)
    public List<String> subscribedLineIds(String accountId) {
        return lineSubscriptionRepository.findByAccountIdOrderByLineIdAsc(accountId)
            .stream()
            .filter(PushLineSubscriptionEntity::isEnabled)
            .map(PushLineSubscriptionEntity::getLineId)
            .toList();
    }

    @Transactional
    public PushNotificationPreferenceEntity preferenceEntityForAccountId(String accountId) {
        return preferenceRepository.findById(accountId)
            .orElseGet(() -> {
                AccountEntity account = accountRepository.findById(accountId)
                    .orElseThrow(() -> new AccountException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found for preference creation."));
                PushNotificationPreferenceEntity newPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
                return preferenceRepository.save(newPrefs);
            });
    }

    private PushResponses.PushPreferencesResponse toPreferencesResponse(
        PushNotificationPreferenceEntity prefs,
        List<PushResponses.LineSubscriptionResponse> lineResponses
    ) {
        return new PushResponses.PushPreferencesResponse(
            prefs.isSavedCommuteCurrentEnabled(),
            prefs.isSavedCommutePlannedEnabled(),
            new PushResponses.SavedCommutePreferencesResponse(
                prefs.isSavedCommuteCurrentEnabled(),
                prefs.isSavedCommutePlannedEnabled(),
                new PushResponses.EventTypePreferencesResponse(
                    prefs.isSavedCommuteSuspensionEnabled(),
                    prefs.isSavedCommuteDelayEnabled(),
                    prefs.isSavedCommuteReducedSpeedZoneEnabled(),
                    prefs.isSavedCommutePlannedClosureEnabled(),
                    prefs.isSavedCommuteRestoredEnabled()
                )
            ),
            new PushResponses.LineSubscriptionPreferencesResponse(
                lineResponses,
                new PushResponses.EventTypePreferencesResponse(
                    prefs.isLineSuspensionEnabled(),
                    prefs.isLineDelayEnabled(),
                    prefs.isLineReducedSpeedZoneEnabled(),
                    prefs.isLinePlannedClosureEnabled(),
                    prefs.isLineRestoredEnabled()
                )
            ),
            new PushResponses.ReminderTimingPreferencesResponse(
                true,
                prefs.isReminderClosure24hEnabled(),
                prefs.isReminderClosureMorningEnabled()
            ),
            prefs.getPlannedClosureFollowUpPolicy().apiValue()
        );
    }
}
