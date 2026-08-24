package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.javamail.JavaMailSender;

class EmailVerificationEmailSenderTest {
    @Test
    void sendsMultipartVerificationEmailWhenEnabled() throws Exception {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(mailSender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        EmailVerificationEmailSender sender = new EmailVerificationEmailSender(
            mailSender,
            true,
            "no-reply@linewatchto.ca"
        );

        boolean delivered = sender.sendVerificationEmail(
            "rider@example.com",
            "https://linewatchto.ca/verify-email#token=abc123",
            Instant.parse("2026-08-25T14:30:00Z")
        );

        assertThat(delivered).isTrue();

        ArgumentCaptor<MimeMessage> messageCaptor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        MimeMessage message = messageCaptor.getValue();
        assertThat(message.getSubject()).isEqualTo("Verify your LineWatchTO email");
        assertThat(message.getAllRecipients()[0].toString()).isEqualTo("rider@example.com");
        List<String> bodies = new ArrayList<>();
        collectTextParts(message.getContent(), bodies);
        assertThat(bodies).anySatisfy(body ->
            assertThat(body).contains("Verify your email", "https://linewatchto.ca/verify-email#token=abc123")
        );
    }

    @Test
    void skipsDeliveryWhenDisabledOrMailSenderIsUnavailable() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        EmailVerificationEmailSender disabled = new EmailVerificationEmailSender(mailSender, false, "no-reply@linewatch.local");
        assertThat(disabled.sendVerificationEmail(
            "rider@example.com", "https://example.test/verify", Instant.now()
        )).isFalse();
        verify(mailSender, never()).send(any(MimeMessage.class));

        EmailVerificationEmailSender unavailable = new EmailVerificationEmailSender(
            (JavaMailSender) null,
            true,
            "no-reply@linewatch.local"
        );
        assertThat(unavailable.sendVerificationEmail(
            "rider@example.com", "https://example.test/verify", Instant.now()
        )).isFalse();
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
