package com.calebhabesh.linewatch.feedback;

import org.springframework.stereotype.Component;

@Component
public class FeedbackEmailSender {
    public boolean sendFeedback(FeedbackResponses.SubmitFeedbackRequest request) {
        return true;
    }
}
