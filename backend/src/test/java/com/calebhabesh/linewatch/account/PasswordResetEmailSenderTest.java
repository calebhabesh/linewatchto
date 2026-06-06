package com.calebhabesh.linewatch.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
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
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.javamail.JavaMailSender;

class PasswordResetEmailSenderTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
        .withBean(PasswordResetEmailSender.class);

    @Test
    void springCanCreateSenderWithoutSmtpConfiguration() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(PasswordResetEmailSender.class);
        });
    }

    @Test
    void sendsMultipartHtmlPasswordResetEmailWhenEnabled() throws Exception {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        MimeMessage mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);
        PasswordResetEmailSender sender = new PasswordResetEmailSender(mailSender, true, "reset@linewatch.local");

        sender.sendPasswordResetEmail(
            "rider@example.com",
            "https://linewatch.example/reset-password?token=reset-token",
            Instant.parse("2026-06-05T15:00:00Z")
        );

        ArgumentCaptor<MimeMessage> messageCaptor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        MimeMessage message = messageCaptor.getValue();
        assertThat(message.getFrom()[0].toString()).isEqualTo("reset@linewatch.local");
        assertThat(message.getSubject()).isEqualTo("Reset your LineWatch TO password");
        assertThat(message.getAllRecipients()[0].toString()).isEqualTo("rider@example.com");

        List<String> bodies = new ArrayList<>();
        collectTextParts(message.getContent(), bodies);
        assertThat(bodies).anySatisfy(body -> {
            assertThat(body).contains("We received a request to reset your LineWatch TO password.");
            assertThat(body).contains("https://linewatch.example/reset-password?token=reset-token");
            assertThat(body).contains("2026-06-05T15:00:00Z");
        });
        assertThat(bodies).anySatisfy(body -> {
            assertThat(body).contains("<html");
            assertThat(body).contains("cid:linewatch-logo");
            assertThat(body).contains("Reset password");
        });
    }

    @Test
    void skipsEmailWhenDisabled() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        PasswordResetEmailSender sender = new PasswordResetEmailSender(mailSender, false, "reset@linewatch.local");

        sender.sendPasswordResetEmail(
            "rider@example.com",
            "https://linewatch.example/reset-password?token=reset-token",
            Instant.parse("2026-06-05T15:00:00Z")
        );

        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void skipsEmailWhenEnabledButNoMailSenderIsConfigured() {
        PasswordResetEmailSender sender = new PasswordResetEmailSender((JavaMailSender) null, true, "reset@linewatch.local");

        assertThatCode(() -> sender.sendPasswordResetEmail(
            "rider@example.com",
            "https://linewatch.example/reset-password?token=reset-token",
            Instant.parse("2026-06-05T15:00:00Z")
        )).doesNotThrowAnyException();
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
