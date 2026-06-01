package com.calebhabesh.linewatch.alert;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    @GetMapping
    public Object getAlerts(@RequestParam(required = false) String type) {
        if ("planned".equals(type)) {
            return List.of(
                new PlannedClosureDto(
                    "closure-line-1-north",
                    "line-1",
                    "1",
                    "Weekend closure",
                    "Sat 12:00 AM - Mon 5:00 AM",
                    "Finch to Eglinton",
                    "There will be no subway service between Finch and Eglinton stations on Line 1 Yonge-University this weekend for planned track work.",
                    List.of("line-1-finch-eglinton"),
                    true,
                    "Planned TTC closure"
                ),
                new PlannedClosureDto(
                    "closure-line-2-west",
                    "line-2",
                    "2",
                    "Early nightly closure",
                    "Fri 9:00 PM - Mon 5:00 AM",
                    "Kipling to Jane",
                    "Late-week track work will replace eastbound service with shuttle buses on the west end of Line 2.",
                    List.of("line-2-kipling-jane"),
                    true,
                    "Planned TTC closure"
                )
            );
        }

        // Default or "live"
        return List.of(
            new ActiveAlertDto(
                "alert-line-2-jane-ossington",
                "line-2",
                "2",
                "Planned track work",
                "suspension",
                "Jane to Ossington",
                "No subway service between Jane and Ossington due to planned track work. Shuttle buses are operating.",
                "Updated 10 min ago",
                List.of("line-2-jane-ossington"),
                true,
                "TTC service alert"
            ),
            new ActiveAlertDto(
                "alert-line-1-north",
                "line-1",
                "1",
                "Signal problem",
                "suspension",
                "Finch to Eglinton",
                "No subway service between Finch and Eglinton due to a signal problem. Shuttle buses are on the way.",
                "Updated 4 min ago",
                List.of("line-1-finch-eglinton"),
                true,
                "TTC service alert"
            ),
            new ActiveAlertDto(
                "alert-line-2-east",
                "line-2",
                "2",
                "Track issues",
                "delay",
                "Sherbourne to Castle Frank",
                "Eastbound trains are experiencing longer than normal travel times near Sherbourne due to earlier track issues.",
                "Updated 1 min ago",
                List.of("line-2-sherbourne-castle-frank"),
                false,
                "TTC service alert"
            )
        );
    }

    public record ActiveAlertDto(
            String id, String lineId, String lineNumber, String title, String severity,
            String location, String description, String updatedAgo,
            List<String> affectedSegmentIds, boolean shuttle, String source
    ) {}

    public record PlannedClosureDto(
            String id, String lineId, String lineNumber, String title, String window,
            String location, String description, List<String> previewSegmentIds,
            boolean shuttle, String source
    ) {}
}
