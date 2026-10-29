package com.calebhabesh.linewatch.diagnostics;

import com.calebhabesh.linewatch.alert.RawAlertPage;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.regional.RegionalAlertStore;
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
        @RequestParam(defaultValue = "" + RawAlertPage.DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        requireEnabled();
        return RawAlertPage.fetch(limit, offset, ttcAlertStore::getRawAlerts);
    }

    @GetMapping("/raw-alerts/regional")
    public ResponseEntity<RawAlertPage> regional(
        @RequestParam(defaultValue = "" + RawAlertPage.DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        requireEnabled();
        return RawAlertPage.fetch(limit, offset, regionalAlertStore::findRawAlerts);
    }

    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
    }

    public record Capabilities(boolean rawAlertsEnabled) {}
}
