package com.calebhabesh.linewatch.diagnostics;

import com.calebhabesh.linewatch.alert.RawAlertDto;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/diagnostics")
public class RawAlertDiagnosticsController {
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    private final RawAlertDiagnosticsProperties properties;
    private final TtcAlertStore ttcAlertStore;
    private final RegionalAlertStore regionalAlertStore;

    public RawAlertDiagnosticsController(
        RawAlertDiagnosticsProperties properties,
        TtcAlertStore ttcAlertStore,
        RegionalAlertStore regionalAlertStore
    ) {
        this.properties = properties;
        this.ttcAlertStore = ttcAlertStore;
        this.regionalAlertStore = regionalAlertStore;
    }

    @GetMapping("/capabilities")
    public ResponseEntity<Capabilities> capabilities() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(new Capabilities(properties.isEnabled()));
    }

    @GetMapping("/raw-alerts/ttc")
    public ResponseEntity<RawAlertPage> ttc(
        @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        requireEnabled();
        PageRequest page = validate(limit, offset);
        return response(ttcAlertStore.getRawAlerts(page.fetchLimit(), page.offset()), page);
    }

    @GetMapping("/raw-alerts/regional")
    public ResponseEntity<RawAlertPage> regional(
        @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        requireEnabled();
        PageRequest page = validate(limit, offset);
        return response(regionalAlertStore.findRawAlerts(page.fetchLimit(), page.offset()), page);
    }

    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
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

    public record Capabilities(boolean rawAlertsEnabled) {}

    public record RawAlertPage(List<RawAlertDto> items, int limit, int offset, boolean hasMore) {}
}
