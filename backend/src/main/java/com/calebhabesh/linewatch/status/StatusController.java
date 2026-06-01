package com.calebhabesh.linewatch.status;

import com.calebhabesh.linewatch.station.TransitLineEntity;
import com.calebhabesh.linewatch.station.TransitLineRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/status")
public class StatusController {

    private final TransitLineRepository transitLineRepository;

    public StatusController(TransitLineRepository transitLineRepository) {
        this.transitLineRepository = transitLineRepository;
    }

    @GetMapping
    public StatusResponse getStatus() {
        List<LineStatusDto> lines = transitLineRepository.findAllByOrderBySortOrderAsc().stream()
                .map(this::toDto)
                .collect(Collectors.toList());

        return new StatusResponse(
                new GeneratedAtDto("Seeded demo", "Fixture data", false, "Seeded backend demo"),
                lines
        );
    }

    private LineStatusDto toDto(TransitLineEntity entity) {
        // Mocked logic for route and statuses until ingestion is complete
        String route;
        String status = "normal";
        String statusLabel = "Normal";
        String summary = "No active service impacts reported.";
        String updatedAgo = "Updated 52 sec ago";

        switch (entity.getId()) {
            case "line-1" -> {
                route = "Finch - Vaughan Metropolitan Centre";
                status = "suspension";
                statusLabel = "Suspended";
                summary = "No subway service between Finch and Eglinton.";
                updatedAgo = "Updated 4 min ago";
            }
            case "line-2" -> {
                route = "Kipling - Kennedy";
                status = "suspension";
                statusLabel = "Suspended";
                summary = "No service between Jane and Ossington. Slower trains near Sherbourne.";
                updatedAgo = "Updated 1 min ago";
            }
            case "line-4" -> route = "Sheppard-Yonge - Don Mills";
            case "line-5" -> {
                route = "Mount Dennis - Kennedy";
                status = "ready";
                statusLabel = "Ready";
                summary = "Layout is integrated for launch and planned service notices.";
                updatedAgo = "Reference layout";
            }
            case "line-6" -> {
                route = "Humber College - Finch West";
                status = "ready";
                statusLabel = "Ready";
                summary = "Finch West LRT geometry is included for future service notices.";
                updatedAgo = "Reference layout";
            }
            default -> route = "Unknown";
        }

        return new LineStatusDto(
                entity.getId(),
                entity.getNumber(),
                entity.getName(),
                route,
                entity.getColor(),
                status,
                statusLabel,
                summary,
                updatedAgo
        );
    }

    public record StatusResponse(GeneratedAtDto generatedAt, List<LineStatusDto> lines) {}
    public record GeneratedAtDto(String time, String date, boolean live, String lastPoll) {}
    public record LineStatusDto(String id, String number, String name, String route, String color, String status, String statusLabel, String summary, String updatedAgo) {}
}
