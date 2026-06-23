package com.calebhabesh.linewatch.feedback;

public final class FeedbackResponses {
    private FeedbackResponses() {}

    public record SubmitFeedbackRequest(
        String message,
        String pageUrl,
        String appVersion,
        String dataSource,
        String viewport,
        String website
    ) {}

    public record SubmitFeedbackResponse(boolean accepted, String message) {}
}
