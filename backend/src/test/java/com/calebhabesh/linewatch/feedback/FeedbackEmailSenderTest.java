package com.calebhabesh.linewatch.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.javamail.JavaMailSender;

class FeedbackEmailSenderTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withBean(FeedbackProperties.class)
        .withBean(FeedbackEmailSender.class);

    @Test
    void springCanCreateSenderWithoutSmtpConfiguration() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(FeedbackEmailSender.class);
        });
    }

    @Test
    void sendsMultipartFeedbackEmailWhenEnabled() throws Exception {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        MimeMessage mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);
        FeedbackProperties properties = properties();
        FeedbackEmailSender sender = new FeedbackEmailSender(mailSender, properties);
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Make the route impact cards easier to compare.",
            "/?panel=commutes",
            "0.1.0-dev",
            "backend",
            "390x844",
            ""
        );

        boolean sent = sender.sendFeedback(request);

        assertThat(sent).isTrue();
        ArgumentCaptor<MimeMessage> messageCaptor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        MimeMessage message = messageCaptor.getValue();
        assertThat(message.getFrom()[0].toString()).isEqualTo("no-reply@linewatch.local");
        assertThat(message.getSubject()).isEqualTo("LineWatch TO feedback");
        assertThat(message.getAllRecipients()[0].toString()).isEqualTo("feedback@linewatchto.ca");

        List<String> bodies = new ArrayList<>();
        collectTextParts(message.getContent(), bodies);
        assertThat(bodies).anySatisfy(body -> {
            assertThat(body).contains("Make the route impact cards easier to compare.");
            assertThat(body).contains("Page: /?panel=commutes");
            assertThat(body).contains("App version: 0.1.0-dev");
            assertThat(body).contains("Data source: backend");
            assertThat(body).contains("Viewport: 390x844");
            assertThat(body).doesNotContain("Reply email");
        });
        assertThat(bodies).anySatisfy(body -> {
            assertThat(body).contains("<html");
            assertThat(body).contains("LineWatch TO feedback");
            assertThat(body).contains("Make the route impact cards easier to compare.");
        });
    }

    @Test
    void returnsFalseWhenNoMailSenderIsConfigured() {
        FeedbackEmailSender sender = new FeedbackEmailSender((JavaMailSender) null, properties());
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Add a saved commute impact explanation.",
            "/",
            "0.1.0-dev",
            "fixture",
            "1280x720",
            ""
        );

        assertThatCode(() -> assertThat(sender.sendFeedback(request)).isFalse())
            .doesNotThrowAnyException();
    }

    @Test
    void returnsFalseWhenMailDeliveryThrows() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(mailSender.createMimeMessage()).thenThrow(new IllegalStateException("smtp unavailable"));
        FeedbackEmailSender sender = new FeedbackEmailSender(mailSender, properties());
        FeedbackResponses.SubmitFeedbackRequest request = new FeedbackResponses.SubmitFeedbackRequest(
            "Add surface notice notification controls.",
            "/",
            "0.1.0-dev",
            "backend",
            "1280x720",
            ""
        );

        assertThat(sender.sendFeedback(request)).isFalse();
        verify(mailSender, never()).send(org.mockito.ArgumentMatchers.any(MimeMessage.class));
    }

    private FeedbackProperties properties() {
        FeedbackProperties properties = new FeedbackProperties();
        properties.setEnabled(true);
        properties.setFrom("no-reply@linewatch.local");
        properties.setTo("feedback@linewatchto.ca");
        return properties;
    }

    private void collectTextParts(Object content, List<String> bodies) throws Exception {
        if (content instanceof String text) {
            bodies.add(text);
            return;
        }
        if (content instanceof Multipart multipart) {
            for (int index = 0; index < multipart.getCount(); index++) {
                BodyPart bodyPart = multipart.getBodyPart(index);
                collectTextParts(bodyPart.getContent(), bodies);
            }
        }
    }
}
