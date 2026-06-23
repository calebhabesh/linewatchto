package com.calebhabesh.linewatch.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class FeedbackControllerTest {
    private final FeedbackService service = mock(FeedbackService.class);
    private final FeedbackRateLimiter rateLimiter = mock(FeedbackRateLimiter.class);
    private final FeedbackController controller = new FeedbackController(service, rateLimiter);

    @Test
    void submitFeedbackAppliesRateLimitAndDelegatesToService() {
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Show exactly which TTC alert created a map segment.",
            "/?panel=alerts",
            "0.1.0-dev",
            "backend",
            "390x844",
            ""
        );
        FeedbackResponses.SubmitFeedbackResponse serviceResponse = new FeedbackResponses.SubmitFeedbackResponse(
            true,
            "Feedback received."
        );
        when(service.submit(request)).thenReturn(serviceResponse);

        ResponseEntity<FeedbackResponses.SubmitFeedbackResponse> response = controller.submit(
            request,
            requestFrom("203.0.113.30")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getBody()).isEqualTo(serviceResponse);
        verify(rateLimiter).requireFeedbackAttempt("203.0.113.30");
        verify(service).submit(request);
    }

    @Test
    void feedbackExceptionMapsToErrorResponse() {
        FeedbackException ex = new FeedbackException(
            HttpStatus.BAD_REQUEST,
            "invalid_feedback",
            "Enter a suggestion before sending feedback."
        );

        ResponseEntity<FeedbackErrorResponse> response = controller.handleFeedbackException(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isEqualTo(new FeedbackErrorResponse(
            "invalid_feedback",
            "Enter a suggestion before sending feedback."
        ));
    }

    private MockHttpServletRequest requestFrom(String ip) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(ip);
        return request;
    }
}
