package com.calebhabesh.linewatch.status;

import java.util.List;

public final class StatusResponses {
    private StatusResponses() {}

    public record StatusResponse(GeneratedAtDto generatedAt, List<LineStatusDto> lines) {}
    public record GeneratedAtDto(String time, String date, boolean live, String lastPoll) {}
    public record LineStatusDto(String id, String number, String name, String route, String color, String status, String statusLabel, String summary, String updatedAgo) {}
}
