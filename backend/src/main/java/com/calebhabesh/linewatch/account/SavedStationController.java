package com.calebhabesh.linewatch.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/account/stations")
public class SavedStationController {
    private final AccountService accountService;
    private final SavedStationService savedStationService;
    private final AccountRateLimiter accountRateLimiter;

    public SavedStationController(
        AccountService accountService,
        SavedStationService savedStationService,
        AccountRateLimiter accountRateLimiter
    ) {
        this.accountService = accountService;
        this.savedStationService = savedStationService;
        this.accountRateLimiter = accountRateLimiter;
    }

    @GetMapping
    public SavedStationResponses.SavedStationListResponse list(
        @SessionToken String rawSessionToken
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        return savedStationService.list(account);
    }

    @PutMapping("/{stationId}")
    public ResponseEntity<SavedStationResponses.SavedStationResponse> save(
        @SessionToken String rawSessionToken,
        @PathVariable String stationId,
        @RequestParam(defaultValue = "ttc") String network
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        accountRateLimiter.requirePreferenceMutation(account.getId());
        SavedStationResponses.SaveResult result = savedStationService.save(account, network, stationId);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
            .body(result.station());
    }

    @DeleteMapping("/{stationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
        @SessionToken String rawSessionToken,
        @PathVariable String stationId,
        @RequestParam(defaultValue = "ttc") String network
    ) {
        AccountEntity account = accountService.requireAccount(rawSessionToken);
        accountRateLimiter.requirePreferenceMutation(account.getId());
        savedStationService.delete(account, network, stationId);
    }

    @ExceptionHandler(AccountException.class)
    public ResponseEntity<AccountErrorResponse> handleAccountException(AccountException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new AccountErrorResponse(ex.getError(), ex.getMessage()));
    }
}
