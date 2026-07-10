package com.calebhabesh.linewatch.account;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/account/commutes")
public class SavedCommuteController {
    private final AccountService accountService;
    private final SavedCommuteService savedCommuteService;

    public SavedCommuteController(AccountService accountService, SavedCommuteService savedCommuteService) {
        this.accountService = accountService;
        this.savedCommuteService = savedCommuteService;
    }

    @GetMapping
    public AccountResponses.SavedCommuteListResponse list(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return savedCommuteService.list(account);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccountResponses.SavedCommuteResponse create(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @RequestBody SavedCommuteService.CreateSavedCommuteRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return savedCommuteService.create(account, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @PathVariable String id
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        savedCommuteService.delete(account, id);
    }

    @PatchMapping("/{id}/notification-rule")
    public AccountResponses.SavedCommuteResponse updateNotificationRule(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @PathVariable String id,
        @RequestBody SavedCommuteService.SavedCommuteNotificationRuleRequest request
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return savedCommuteService.updateNotificationRule(account, id, request);
    }

    @PatchMapping("/{id}/pin")
    public AccountResponses.SavedCommuteResponse updatePinned(
        @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
        @PathVariable String id,
        @RequestBody SavedCommuteService.PinnedRequest request
    ) {
        return savedCommuteService.updatePinned(accountService.requireAccount(rawSessionToken), id, request);
    }

    @ExceptionHandler(AccountException.class)
    public ResponseEntity<AccountErrorResponse> handleAccountException(AccountException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new AccountErrorResponse(ex.getError(), ex.getMessage()));
    }
}
