package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountService;
import com.calebhabesh.linewatch.account.AuthCookieFactory;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class PushNotificationControllerTest {
    private final AccountService accountService = mock(AccountService.class);
    private final PushNotificationService pushNotificationService = mock(PushNotificationService.class);
    private final PushNotificationController controller = new PushNotificationController(accountService, pushNotificationService);
    private final AccountEntity account = AccountEntity.create(
        "user_1",
        "rider@example.com",
        "Rider",
        "$2a$hash",
        false,
        Instant.parse("2026-06-05T14:00:00Z")
    );

    @Test
    void configUsesCurrentSessionAccount() {
        PushResponses.PushConfigResponse expected = new PushResponses.PushConfigResponse(
            true,
            "BPublicVapidKey",
            new PushResponses.PushPreferencesResponse(true, true),
            new PushResponses.PushDeviceSummaryResponse(1, true)
        );
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(pushNotificationService.config(account)).thenReturn(expected);

        PushResponses.PushConfigResponse response = controller.config("raw-token");

        assertThat(response).isEqualTo(expected);
    }

    @Test
    void savesBrowserSubscriptionForCurrentAccount() {
        PushRequests.SaveSubscriptionRequest request = new PushRequests.SaveSubscriptionRequest(
            "https://updates.push.services.mozilla.com/wpush/v2/subscription",
            new PushRequests.PushSubscriptionKeys("p256dh-key", "auth-secret"),
            "Mobile Safari"
        );
        PushResponses.PushSubscriptionResponse expected = new PushResponses.PushSubscriptionResponse(
            "push_subscription_1",
            true,
            true,
            true
        );
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(pushNotificationService.saveSubscription(account, request)).thenReturn(expected);

        PushResponses.PushSubscriptionResponse response = controller.saveSubscription("raw-token", request);

        assertThat(response).isEqualTo(expected);
    }

    @Test
    void returnsLatestPendingNotificationForCurrentSubscription() {
        PushRequests.SubscriptionEndpointRequest request = new PushRequests.SubscriptionEndpointRequest(
            "https://fcm.googleapis.com/fcm/send/subscription"
        );
        PushResponses.PendingPushNotification notification = new PushResponses.PendingPushNotification(
            "⚠️ Line 1 Yonge-University Delay",
            "Finch to Union.\n🕗 Jun 5, 10:20 AM",
            "/?panel=commutes&commute=commute_1",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
            "ACTIVE",
            "2026-06-05T15:00:00Z"
        );
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(pushNotificationService.latestPendingNotification(account, request)).thenReturn(
            new PushResponses.PendingPushNotificationResponse(notification)
        );

        PushResponses.PendingPushNotificationResponse response = controller.latest("raw-token", request);

        assertThat(response.notification()).isEqualTo(notification);
        verify(pushNotificationService).latestPendingNotification(account, request);
    }

    @Test
    void returnsActiveNotificationTagsForCurrentSubscription() {
        PushRequests.SubscriptionEndpointRequest request = new PushRequests.SubscriptionEndpointRequest(
            "https://fcm.googleapis.com/fcm/send/subscription"
        );
        PushResponses.ActivePushNotificationsResponse expected = new PushResponses.ActivePushNotificationsResponse(
            java.util.List.of("saved-commute-impact|commute_1|delay-line-1|active")
        );
        when(accountService.requireAccount("raw-token")).thenReturn(account);
        when(pushNotificationService.activeNotifications(account, request)).thenReturn(expected);

        PushResponses.ActivePushNotificationsResponse response = controller.active("raw-token", request);

        assertThat(response).isEqualTo(expected);
        assertThat(response.retainedTags()).containsExactly("saved-commute-impact|commute_1|delay-line-1|active");
        verify(pushNotificationService).activeNotifications(account, request);
    }

    @Test
    void disablesCurrentSubscription() {
        PushRequests.SubscriptionEndpointRequest request = new PushRequests.SubscriptionEndpointRequest(
            "https://fcm.googleapis.com/fcm/send/subscription"
        );
        when(accountService.requireAccount("raw-token")).thenReturn(account);

        controller.disableSubscription("raw-token", request);

        verify(pushNotificationService).disableSubscription(account, request);
    }
}
