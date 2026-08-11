package com.calebhabesh.linewatch.feedback;

import com.calebhabesh.linewatch.account.ClientAddressResolver;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {
    private final FeedbackService feedbackService;
    private final FeedbackRateLimiter rateLimiter;
    private final ClientAddressResolver clientAddressResolver;

    public FeedbackController(
        FeedbackService feedbackService,
        FeedbackRateLimiter rateLimiter,
        ClientAddressResolver clientAddressResolver
    ) {
        this.feedbackService = feedbackService;
        this.rateLimiter = rateLimiter;
        this.clientAddressResolver = clientAddressResolver;
    }

    @PostMapping
    public ResponseEntity<FeedbackResponses.SubmitFeedbackResponse> submit(
        @RequestBody FeedbackResponses.SubmitFeedbackRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireFeedbackAttempt(clientAddressResolver.clientAddress(httpRequest));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(feedbackService.submit(request));
    }

    @ExceptionHandler(FeedbackException.class)
    public ResponseEntity<FeedbackErrorResponse> handleFeedbackException(FeedbackException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new FeedbackErrorResponse(ex.getError(), ex.getMessage()));
    }
}
