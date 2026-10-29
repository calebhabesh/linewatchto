package com.calebhabesh.linewatch.admin;

import com.calebhabesh.linewatch.alert.RawAlertPage;
import com.calebhabesh.linewatch.ingestion.TtcAlertStore;
import com.calebhabesh.linewatch.regional.RegionalAlertStore;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/raw-alerts")
public class AdminRawAlertController {
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
        @RequestParam(defaultValue = "" + RawAlertPage.DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        access.requireAuthorized(authorization);
        return RawAlertPage.fetch(limit, offset, ttcAlertStore::getRawAlerts);
    }

    @GetMapping("/regional")
    public ResponseEntity<RawAlertPage> regional(
        @RequestHeader(name = "Authorization", required = false) String authorization,
        @RequestParam(defaultValue = "" + RawAlertPage.DEFAULT_LIMIT) int limit,
        @RequestParam(defaultValue = "0") int offset
    ) {
        access.requireAuthorized(authorization);
        return RawAlertPage.fetch(limit, offset, regionalAlertStore::findRawAlerts);
    }
}
