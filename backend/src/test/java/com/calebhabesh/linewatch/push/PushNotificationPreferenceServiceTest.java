package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import com.calebhabesh.linewatch.account.AccountRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class PushNotificationPreferenceServiceTest {
    private final PushNotificationPreferenceRepository preferenceRepository = mock(PushNotificationPreferenceRepository.class);
    private final PushLineSubscriptionRepository lineSubscriptionRepository = mock(PushLineSubscriptionRepository.class);
    private final AccountRepository accountRepository = mock(AccountRepository.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-06-05T15:00:00Z"), ZoneOffset.UTC);
    private final PushNotificationPreferenceService service = new PushNotificationPreferenceService(
        preferenceRepository,
        lineSubscriptionRepository,
        accountRepository,
        clock
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
    void preferencesForReturnsDefaultsForNewAccount() {
        when(preferenceRepository.findById("user_1")).thenReturn(Optional.empty());
        when(lineSubscriptionRepository.findByAccountIdOrderByLineIdAsc("user_1")).thenReturn(List.of());

        when(preferenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(lineSubscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PushResponses.PushPreferencesResponse response = service.preferencesFor(account);

        assertThat(response.savedCommutes().currentDisruptions()).isTrue();
        assertThat(response.savedCommutes().plannedClosureReminders()).isTrue();
        assertThat(response.savedCommutes().eventTypes().reducedSpeedZones()).isTrue();
        assertThat(response.lineSubscriptions().lines())
            .extracting(PushResponses.LineSubscriptionResponse::lineId)
            .containsExactly("line-1", "line-2", "line-4", "line-5", "line-6");
        assertThat(response.lineSubscriptions().lines())
            .allSatisfy(line -> assertThat(line.subscribed()).isFalse());
        assertThat(response.lineSubscriptions().eventTypes().reducedSpeedZones()).isTrue();
        assertThat(response.plannedClosureFollowUp()).isEqualTo("smart");
        assertThat(response.reminderTiming().closure24h()).isTrue();
        assertThat(response.reminderTiming().closureMorning()).isTrue();
    }

    @Test
    void updatePreferencesStoresOneExplicitPlannedClosureFollowUpPolicy() {
        PushNotificationPreferenceEntity existingPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceRepository.findById("user_1")).thenReturn(Optional.of(existingPrefs));
        when(preferenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(lineSubscriptionRepository.findByAccountIdOrderByLineIdAsc("user_1")).thenReturn(List.of());
        when(lineSubscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
            null, null, null, null, null, "announcements-only"
        );

        PushResponses.PushPreferencesResponse response = service.updatePreferences(account, request);

        assertThat(response.plannedClosureFollowUp()).isEqualTo("announcements-only");
        assertThat(response.reminderTiming().onChange()).isTrue();
        assertThat(response.reminderTiming().closure24h()).isFalse();
        assertThat(response.reminderTiming().closureMorning()).isFalse();
    }

    @Test
    void updatePreferencesRejectsUnknownPlannedClosureFollowUpPolicy() {
        PushNotificationPreferenceEntity existingPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceRepository.findById("user_1")).thenReturn(Optional.of(existingPrefs));

        PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
            null, null, null, null, null, "sometimes"
        );

        assertThatThrownBy(() -> service.updatePreferences(account, request))
            .isInstanceOf(AccountException.class)
            .satisfies(ex -> {
                AccountException aex = (AccountException) ex;
                assertThat(aex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(aex.getError()).isEqualTo("invalid_planned_closure_follow_up");
            });
    }

    @Test
    void updatePreferencesPersistsChanges() {
        PushNotificationPreferenceEntity existingPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceRepository.findById("user_1")).thenReturn(Optional.of(existingPrefs));

        PushLineSubscriptionEntity line1Sub = PushLineSubscriptionEntity.create(account, "line-1", false, clock.instant());
        when(lineSubscriptionRepository.findById("user_1:line-1")).thenReturn(Optional.of(line1Sub));

        when(preferenceRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(lineSubscriptionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(lineSubscriptionRepository.findByAccountIdOrderByLineIdAsc("user_1")).thenReturn(List.of(line1Sub));

        PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
            null,
            null,
            new PushRequests.SavedCommutePreferencesRequest(false, false, null),
            new PushRequests.LineSubscriptionPreferencesRequest(
                List.of(new PushRequests.LineSubscriptionSelectionRequest("line-1", true)),
                new PushRequests.EventTypePreferencesRequest(null, null, true, null, null)
            ),
            null
        );

        PushResponses.PushPreferencesResponse response = service.updatePreferences(account, request);

        assertThat(response.savedCommutes().currentDisruptions()).isFalse();
        assertThat(response.savedCommutes().plannedClosureReminders()).isFalse();
        assertThat(response.lineSubscriptions().eventTypes().reducedSpeedZones()).isTrue();

        assertThat(response.lineSubscriptions().lines())
            .filteredOn(l -> l.lineId().equals("line-1"))
            .first()
            .satisfies(l -> assertThat(l.subscribed()).isTrue());
    }

    @Test
    void updatePreferencesRejectsUnsupportedLine() {
        PushNotificationPreferenceEntity existingPrefs = PushNotificationPreferenceEntity.create(account, clock.instant());
        when(preferenceRepository.findById("user_1")).thenReturn(Optional.of(existingPrefs));

        PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
            null,
            null,
            null,
            new PushRequests.LineSubscriptionPreferencesRequest(
                List.of(new PushRequests.LineSubscriptionSelectionRequest("line-3", true)),
                null
            ),
            null
        );

        assertThatThrownBy(() -> service.updatePreferences(account, request))
            .isInstanceOf(AccountException.class)
            .satisfies(ex -> {
                AccountException aex = (AccountException) ex;
                assertThat(aex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(aex.getError()).isEqualTo("invalid_line_subscription");
            });
    }
}
