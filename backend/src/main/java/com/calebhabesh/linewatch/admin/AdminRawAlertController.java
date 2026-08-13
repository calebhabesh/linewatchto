package com.calebhabesh.linewatch.admin;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/admin/raw-alerts")
public class AdminRawAlertController {
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    private final AdminRawLogAccess access;
    private final TtcAlertStore ttcAlertStore;
    private final RegionalAlertStore regionalAlertStore;

    public AdminRawAlertController(
        AdminRawLogAccess access,
        TtcAlertStore ttcAlertStore,
        RegionalAlertStore regionalAlertStore
    ) {
        this.access = access;
        this.ttcAlertStore = ttcAlertStore;
        this.regionalAlertStore = regionalAlertStore;
    }

    @GetMapping("/ttc")
    public ResponseEntity<RawAlertPage> ttc(
        @RequestHeader(name = "Authorization", required = false) String authorization,
        @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        access.requireAuthorized(authorization);
        PageRequest page = validate(limit, offset);
        return response(ttcAlertStore.getRawAlerts(page.fetchLimit(), page.offset()), page);
    }

    @GetMapping("/regional")
    public ResponseEntity<RawAlertPage> regional(
        @RequestHeader(name = "Authorization", required = false) String authorization,
        @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        access.requireAuthorized(authorization);
        PageRequest page = validate(limit, offset);
        return response(regionalAlertStore.findRawAlerts(page.fetchLimit(), page.offset()), page);
    }

    private PageRequest validate(int limit, int offset) {
        if (limit < 1 || limit > MAX_LIMIT || offset < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be 1-100 and offset must be non-negative");
        }
        return new PageRequest(limit, offset);
    }

    private ResponseEntity<RawAlertPage> response(List<RawAlertDto> fetched, PageRequest page) {
        boolean hasMore = fetched.size() > page.limit();
        List<RawAlertDto> items = hasMore ? fetched.subList(0, page.limit()) : fetched;
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(new RawAlertPage(items, page.limit(), page.offset(), hasMore));
    }

    private record PageRequest(int limit, int offset) {
        int fetchLimit() {
            return limit + 1;
        }
    }

    public record RawAlertPage(List<RawAlertDto> items, int limit, int offset, boolean hasMore) {}
}
