package com.calebhabesh.linewatch.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class FeedbackServiceTest {
    private final FeedbackEmailSender sender = mock(FeedbackEmailSender.class);
    private final FeedbackProperties properties = enabledProperties();
    private final FeedbackService service = new FeedbackService(properties, sender);

    @Test
    void acceptsValidFeedbackAndSendsEmailWithoutReplyAddress() {
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Show planned closures on the map earlier in the week.",
            "/?panel=closures",
            "0.1.0-dev",
            "backend",
            "390x844",
            ""
        );
        when(sender.sendFeedback(request)).thenReturn(true);

        FeedbackResponses.SubmitFeedbackResponse response = service.submit(request);

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).isEqualTo("Feedback received.");
        verify(sender).sendFeedback(request);
    }

    @Test
    void rejectsBlankFeedbackMessage() {
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "   ",
            "/",
            "0.1.0-dev",
            "fixture",
            "1280x720",
            ""
        );

        assertThatThrownBy(() -> service.submit(request))
            .isInstanceOf(FeedbackException.class)
            .satisfies(error -> {
                FeedbackException ex = (FeedbackException) error;
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(ex.getError()).isEqualTo("invalid_feedback");
                assertThat(ex.getMessage()).isEqualTo("Enter a suggestion before sending feedback.");
            });
        verify(sender, never()).sendFeedback(request);
    }

    @Test
    void rejectsOverlongFeedbackMessage() {
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "x".repeat(properties.getMaxMessageLength() + 1),
            "/",
            "0.1.0-dev",
            "fixture",
            "1280x720",
            ""
        );

        assertThatThrownBy(() -> service.submit(request))
            .isInstanceOf(FeedbackException.class)
            .satisfies(error -> {
                FeedbackException ex = (FeedbackException) error;
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(ex.getError()).isEqualTo("feedback_too_long");
                assertThat(ex.getMessage()).isEqualTo("Feedback must be 2000 characters or less.");
            });
        verify(sender, never()).sendFeedback(request);
    }

    @Test
    void silentlyAcceptsHoneypotSubmissionsWithoutSending() {
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Add status history exports.",
            "/",
            "0.1.0-dev",
            "backend",
            "1280x720",
            "https://spam.example"
        );

        FeedbackResponses.SubmitFeedbackResponse response = service.submit(request);

        assertThat(response.accepted()).isTrue();
        assertThat(response.message()).isEqualTo("Feedback received.");
        verify(sender, never()).sendFeedback(request);
    }

    @Test
    void rejectsWhenFeedbackIsDisabled() {
        FeedbackProperties disabled = enabledProperties();
        disabled.setEnabled(false);
        FeedbackService disabledService = new FeedbackService(disabled, sender);
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Add a station elevator status summary.",
            "/",
            "0.1.0-dev",
            "backend",
            "1280x720",
            ""
        );

        assertThatThrownBy(() -> disabledService.submit(request))
            .isInstanceOf(FeedbackException.class)
            .satisfies(error -> {
                FeedbackException ex = (FeedbackException) error;
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(ex.getError()).isEqualTo("feedback_unavailable");
                assertThat(ex.getMessage()).isEqualTo("Feedback is unavailable.");
            });
        verify(sender, never()).sendFeedback(request);
    }

    @Test
    void rejectsWhenConfiguredSenderCannotDeliver() {
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Make the reduced speed zone arrows easier to scan.",
            "/?panel=reduced-speed-zones",
            "0.1.0-dev",
            "backend",
            "390x844",
            ""
        );
        when(sender.sendFeedback(request)).thenReturn(false);

        assertThatThrownBy(() -> service.submit(request))
            .isInstanceOf(FeedbackException.class)
            .satisfies(error -> {
                FeedbackException ex = (FeedbackException) error;
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(ex.getError()).isEqualTo("feedback_unavailable");
                assertThat(ex.getMessage()).isEqualTo("Feedback could not be sent.");
            });
    }

    private FeedbackProperties enabledProperties() {
        FeedbackProperties props = new FeedbackProperties();
        props.setEnabled(true);
        props.setFrom("no-reply@linewatch.local");
        props.setTo("feedback@linewatchto.ca");
        props.setMaxMessageLength(2000);
        return props;
    }
}
