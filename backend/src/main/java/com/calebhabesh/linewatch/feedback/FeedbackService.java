package com.calebhabesh.linewatch.feedback;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class FeedbackService {
    private final FeedbackProperties properties;
    private final FeedbackEmailSender emailSender;

    public FeedbackService(FeedbackProperties properties, FeedbackEmailSender emailSender) {
        this.properties = properties;
        this.emailSender = emailSender;
    }

    public FeedbackResponses.SubmitFeedbackResponse submit(FeedbackResponses.SubmitFeedbackRequest request) {
        if (request == null) {
            throw invalid("Enter a suggestion before sending feedback.");
        }
        if (!properties.isEnabled()) {
            throw new FeedbackException(HttpStatus.SERVICE_UNAVAILABLE, "feedback_unavailable", "Feedback is unavailable.");
        }

        String message = normalize(request.message());
        if (message.isBlank()) {
            throw invalid("Enter a suggestion before sending feedback.");
        }
        if (message.length() > properties.getMaxMessageLength()) {
            throw new FeedbackException(
                HttpStatus.BAD_REQUEST,
                "feedback_too_long",
                "Feedback must be %d characters or less.".formatted(properties.getMaxMessageLength())
            );
        }
        if (!normalize(request.website()).isBlank()) {
            return accepted();
        }
        if (!emailSender.sendFeedback(request)) {
            throw new FeedbackException(HttpStatus.SERVICE_UNAVAILABLE, "feedback_unavailable", "Feedback could not be sent.");
        }
        return accepted();
    }

    private FeedbackException invalid(String message) {
        return new FeedbackException(HttpStatus.BAD_REQUEST, "invalid_feedback", message);
    }

    private FeedbackResponses.SubmitFeedbackResponse accepted() {
        return new FeedbackResponses.SubmitFeedbackResponse(true, "Feedback received.");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
