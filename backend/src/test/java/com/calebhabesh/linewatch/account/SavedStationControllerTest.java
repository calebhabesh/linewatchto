package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.station.StationResponses;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class SavedStationControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final SavedStationService savedStationService = mock(SavedStationService.class);
    private final AccountRateLimiter rateLimiter = mock(AccountRateLimiter.class);
    private final SavedStationController controller = new SavedStationController(
        accountService,
        savedStationService,
        rateLimiter
    );
    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-07-23T14:00:00Z")
    );

    @Test
    void listUsesCurrentSessionAccount() {
        SavedStationResponses.SavedStationListResponse expected =
            new SavedStationResponses.SavedStationListResponse(List.of());
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(savedStationService.list(account)).thenReturn(expected);

        assertThat(controller.list("raw-token")).isEqualTo(expected);
    }

    @Test
    void saveReturnsCreatedForNewRelationshipAndRateLimitsByAccount() {
        SavedStationResponses.SavedStationResponse response = response();
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(savedStationService.save(account, "regional", "union"))
            .thenReturn(new SavedStationResponses.SaveResult(response, true));

        var result = controller.save("raw-token", "union", "regional");

        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(result.getBody()).isEqualTo(response);
        verify(rateLimiter).requirePreferenceMutation("user_1");
    }

    @Test
    void saveReturnsOkWhenRelationshipAlreadyExists() {
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(savedStationService.save(account, "ttc", "union"))
            .thenReturn(new SavedStationResponses.SaveResult(response(), false));

        assertThat(controller.save("raw-token", "union", "ttc").getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void deleteUsesCurrentSessionAccount() {
        when(accountService.requireAccount("raw-token")).thenReturn(account);

        controller.delete("raw-token", "union", "regional");

        verify(rateLimiter).requirePreferenceMutation("user_1");
        verify(savedStationService).delete(account, "regional", "union");
    }

    private SavedStationResponses.SavedStationResponse response() {
        return new SavedStationResponses.SavedStationResponse(
            "ttc",
            new StationResponses.StationSummaryResponse(
                "union",
                "Union",
                100,
                200,
                false,
                List.of("line-1"),
                false,
                "normal",
                new StationResponses.StationAccessOutageCountsResponse(0, 0)
            ),
            Instant.parse("2026-07-23T14:30:00Z")
        );
    }
}
