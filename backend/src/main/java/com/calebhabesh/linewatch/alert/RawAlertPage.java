package com.calebhabesh.linewatch.alert;

import java.util.List;
import java.util.function.BiFunction;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

/** One page of retained raw alerts, shared by the operator and dev diagnostics endpoints. */
public record RawAlertPage(List<RawAlertDto> items, int limit, int offset, boolean hasMore) {
    public static final int DEFAULT_LIMIT = 50;
    public static final int MAX_LIMIT = 100;

    /** Validates paging, fetches one extra row to detect more pages, and returns a no-store response. */
    public static ResponseEntity<RawAlertPage> fetch(
        int limit,
        int offset,
        BiFunction<Integer, Integer, List<RawAlertDto>> fetcher
    ) {
        if (limit < 1 || limit > MAX_LIMIT || offset < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1-100 and offset must be non-negative");
        }
        List<RawAlertDto> fetched = fetcher.apply(limit + 1, offset);
        boolean hasMore = fetched.size() > limit;
        List<RawAlertDto> items = hasMore ? fetched.subList(0, limit) : fetched;
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(new RawAlertPage(items, limit, offset, hasMore));
    }
}
