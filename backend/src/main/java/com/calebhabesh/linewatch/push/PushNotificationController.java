package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import com.calebhabesh.linewatch.account.AccountService;
import com.calebhabesh.linewatch.account.AuthCookieFactory;
import com.calebhabesh.linewatch.account.AccountErrorResponse;
import com.calebhabesh.linewatch.account.SessionToken;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/account/push")
public class PushNotificationController {
    private final AccountService accountService;
    private final PushNotificationService pushNotificationService;

    public PushNotificationController(AccountService accountService, PushNotificationService pushNotificationService) {
        this.accountService = accountService;
        this.pushNotificationService = pushNotificationService;
    }

    @GetMapping("/config")
    public PushResponses.PushConfigResponse config(
        @SessionToken String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.config(account);
    }

    @PutMapping("/subscription")
    public PushResponses.PushSubscriptionResponse saveSubscription(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.SaveSubscriptionRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.saveSubscription(account, request);
    }

    @PutMapping("/preferences")
    public PushResponses.PushPreferencesResponse updatePreferences(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.UpdatePushPreferencesRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.updatePreferences(account, request);
    }

    @PostMapping("/latest")
    public PushResponses.PendingPushNotificationResponse latest(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.SubscriptionEndpointRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.latestPendingNotification(account, request);
    }

    @PostMapping("/active")
    public PushResponses.ActivePushNotificationsResponse active(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.SubscriptionEndpointRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.activeNotifications(account, request);
    }

    @GetMapping("/diagnostics")
    public PushResponses.PushDeliveryDiagnosticsResponse diagnostics(
        @SessionToken String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.deliveryDiagnostics(account);
    }

    @GetMapping("/devices")
    public PushResponses.PushDevicesResponse devices(
        @SessionToken String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.devices(account);
    }

    @PostMapping("/devices/{subscriptionId}/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void disableDevice(
        @SessionToken String rawSessionToken,
        @PathVariable String subscriptionId
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        pushNotificationService.disableDevice(account, subscriptionId);
    }

    @PostMapping("/devices/{subscriptionId}/test")
    public PushResponses.PushDeviceTestResponse testDevice(
        @SessionToken String rawSessionToken,
        @PathVariable String subscriptionId
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.testDevice(account, subscriptionId);
    }

    @PostMapping("/client-event")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void recordClientEvent(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.ClientEventRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        pushNotificationService.recordClientEvent(account, request);
    }

    @PostMapping("/receipt")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void recordReceipt(
        @RequestBody PushRequests.ReceiptEventRequest request
    ) {
        pushNotificationService.recordReceiptEvent(request);
    }

    @PostMapping("/displayed")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markDisplayed(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.DisplayedNotificationRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        pushNotificationService.markPayloadNotificationDisplayed(account, request);
    }

    @PostMapping("/subscription/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void disableSubscription(
        @SessionToken String rawSessionToken,
        @RequestBody PushRequests.SubscriptionEndpointRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        pushNotificationService.disableSubscription(account, request);
    }

    @ExceptionHandler(AccountException.class)
    public ResponseEntity<AccountErrorResponse> handleAccountException(AccountException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new AccountErrorResponse(ex.getError(), ex.getMessage()));
    }
}
