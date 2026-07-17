package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class SavedCommuteControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final SavedCommuteService savedCommuteService = mock(SavedCommuteService.class);
    private final SavedCommuteController controller = new SavedCommuteController(accountService, savedCommuteService);
    private final AccountEntity account = AccountEntity.create("user_1", "rider@example.com", "Rider", "$2a$hash", false, Instant.parse("2026-06-05T14:00:00Z"));

    @Test
    void listUsesCurrentSessionAccount() {
        AccountResponses.SavedCommuteListResponse expected = new AccountResponses.SavedCommuteListResponse(List.of());
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(savedCommuteService.list(account)).thenReturn(expected);

        AccountResponses.SavedCommuteListResponse response = controller.list("raw-token");

        assertThat(response).isEqualTo(expected);
    }

    @Test
    void deleteUsesCurrentSessionAccount() {
        when(accountService.requireAccount("raw-token")).thenReturn(account);

        controller.delete("raw-token", "commute_1");

        verify(savedCommuteService).delete(account, "commute_1");
    }

    @Test
    void updateNotificationRuleUsesCurrentSessionAccount() {
        SavedCommuteService.SavedCommuteNotificationRuleRequest request =
            new SavedCommuteService.SavedCommuteNotificationRuleRequest(
                true,
                62,
                8 * 60,
                9 * 60,
                true,
                false,
                new SavedCommuteService.SavedCommuteNotificationEventTypesRequest(
                    true,
                    true,
                    false,
                    true,
                    true
                )
            );
        AccountResponses.SavedCommuteResponse expected = new AccountResponses.SavedCommuteResponse(
            "commute_1",
            "Morning commute",
            "queen",
            "Queen",
            "bloor-yonge",
            "Bloor-Yonge",
            "Queen -> Bloor-Yonge",
            false,
            null,
            null,
            null,
            null,
            new AccountResponses.SavedCommuteNotificationRuleResponse(
                true,
                62,
                480,
                540,
                true,
                false,
                new AccountResponses.SavedCommuteNotificationEventTypesResponse(
                    true,
                    true,
                    false,
                    true,
                    true
                )
            ),
            Instant.parse("2026-06-05T14:00:00Z"),
            Instant.parse("2026-06-05T14:30:00Z")
        );
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(savedCommuteService.updateNotificationRule(account, "commute_1", request)).thenReturn(expected);

        AccountResponses.SavedCommuteResponse response = controller.updateNotificationRule("raw-token", "commute_1", request);

        assertThat(response).isEqualTo(expected);
        verify(savedCommuteService).updateNotificationRule(account, "commute_1", request);
    }
}
