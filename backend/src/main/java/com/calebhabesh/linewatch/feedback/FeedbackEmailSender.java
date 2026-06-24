package com.calebhabesh.linewatch.feedback;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
public class FeedbackEmailSender {
    private static final Logger log = LoggerFactory.getLogger(FeedbackEmailSender.class);

    private final Supplier<JavaMailSender> mailSenderSupplier;
    private final FeedbackProperties properties;

    @Autowired
    public FeedbackEmailSender(ObjectProvider<JavaMailSender> mailSenderProvider, FeedbackProperties properties) {
        this(mailSenderProvider::getIfAvailable, properties);
    }

    FeedbackEmailSender(JavaMailSender mailSender, FeedbackProperties properties) {
        this(() -> mailSender, properties);
    }

    private FeedbackEmailSender(Supplier<JavaMailSender> mailSenderSupplier, FeedbackProperties properties) {
        this.mailSenderSupplier = mailSenderSupplier;
        this.properties = properties;
    }

    public boolean sendFeedback(FeedbackResponses.SubmitFeedbackRequest request) {
        JavaMailSender mailSender = mailSenderSupplier.get();
        if (mailSender == null) {
            log.warn("Feedback email is enabled, but no SMTP mail sender is configured.");
            return false;
        }

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(
                message,
                MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED,
                StandardCharsets.UTF_8.name()
            );
            helper.setFrom(properties.getFrom());
            helper.setTo(properties.getTo());
            helper.setSubject("LineWatchTO feedback");
            helper.setText(textBody(request), htmlBody(request));
            mailSender.send(message);
            return true;
        } catch (IllegalStateException | MailException | MessagingException ex) {
            log.warn("Feedback email delivery failed.", ex);
            return false;
        }
    }

    private String textBody(FeedbackResponses.SubmitFeedbackRequest request) {
        return """
            LineWatchTO feedback

            Message:
            %s

            Page: %s
            App version: %s
            Data source: %s
            Viewport: %s
            """.formatted(
            clean(request.message()),
            clean(request.pageUrl()),
            clean(request.appVersion()),
            clean(request.dataSource()),
            clean(request.viewport())
        );
    }

    private String htmlBody(FeedbackResponses.SubmitFeedbackRequest request) {
        String safeMessage = HtmlUtils.htmlEscape(clean(request.message())).replace("\n", "<br />");
        String safePage = HtmlUtils.htmlEscape(clean(request.pageUrl()));
        String safeVersion = HtmlUtils.htmlEscape(clean(request.appVersion()));
        String safeDataSource = HtmlUtils.htmlEscape(clean(request.dataSource()));
        String safeViewport = HtmlUtils.htmlEscape(clean(request.viewport()));

        return """
            <!doctype html>
            <html lang="en">
              <body style="margin:0;background:#0b1020;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#e5edf7;">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#111827;border:1px solid #273449;border-radius:8px;">
                  <tr>
                    <td style="padding:28px;text-align:left;">
                      <p style="margin:0 0 8px 0;color:#8ea2bb;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">LineWatchTO</p>
                      <h1 style="margin:0 0 18px 0;color:#ffffff;font-size:22px;line-height:1.25;">LineWatchTO feedback</h1>
                      <div style="margin:0 0 22px 0;color:#e5edf7;font-size:15px;line-height:1.6;">%s</div>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%%;border-collapse:collapse;color:#cbd5e1;font-size:13px;">
                        <tr><td style="padding:6px 0;color:#8ea2bb;width:120px;">Page</td><td style="padding:6px 0;">%s</td></tr>
                        <tr><td style="padding:6px 0;color:#8ea2bb;">App version</td><td style="padding:6px 0;">%s</td></tr>
                        <tr><td style="padding:6px 0;color:#8ea2bb;">Data source</td><td style="padding:6px 0;">%s</td></tr>
                        <tr><td style="padding:6px 0;color:#8ea2bb;">Viewport</td><td style="padding:6px 0;">%s</td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
            """.formatted(safeMessage, safePage, safeVersion, safeDataSource, safeViewport);
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
