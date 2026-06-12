package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import com.calebhabesh.linewatch.account.AccountException;
import com.calebhabesh.linewatch.account.AccountService;
import com.calebhabesh.linewatch.account.AuthCookieFactory;
import com.calebhabesh.linewatch.account.AccountErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
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
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.config(account);
    }

    @PutMapping("/subscription")
    public PushResponses.PushSubscriptionResponse saveSubscription(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody PushRequests.SaveSubscriptionRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.saveSubscription(account, request);
    }

    @PutMapping("/preferences")
    public PushResponses.PushSubscriptionResponse updatePreferences(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody PushRequests.UpdatePushPreferencesRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.updatePreferences(account, request);
    }

    @PostMapping("/latest")
    public PushResponses.PendingPushNotificationResponse latest(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody PushRequests.SubscriptionEndpointRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return pushNotificationService.latestPendingNotification(account, request);
    }

    @PostMapping("/subscription/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void disableSubscription(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
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
