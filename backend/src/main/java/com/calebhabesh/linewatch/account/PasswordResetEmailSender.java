package com.calebhabesh.linewatch.account;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
public class PasswordResetEmailSender {
    private static final Logger log = LoggerFactory.getLogger(PasswordResetEmailSender.class);
    private static final String LOGO_CONTENT_ID = "linewatch-logo";

    private final Supplier<JavaMailSender> mailSenderSupplier;
    private final boolean enabled;
    private final String fromAddress;
    private final Resource logoResource;

    @Autowired
    public PasswordResetEmailSender(
        ObjectProvider<JavaMailSender> mailSenderProvider,
        @Value("${linewatch.auth.password-reset.email.enabled:false}") boolean enabled,
        @Value("${linewatch.auth.password-reset.email.from:no-reply@linewatch.local}") String fromAddress,
        @Value("${linewatch.auth.password-reset.email.logo-resource:classpath:/email/linewatch-logo.png}") Resource logoResource
    ) {
        this(mailSenderProvider::getIfAvailable, enabled, fromAddress, logoResource);
    }

    PasswordResetEmailSender(JavaMailSender mailSender, boolean enabled, String fromAddress) {
        this(mailSender, enabled, fromAddress, new ClassPathResource("email/linewatch-logo.png"));
    }

    PasswordResetEmailSender(JavaMailSender mailSender, boolean enabled, String fromAddress, Resource logoResource) {
        this(() -> mailSender, enabled, fromAddress, logoResource);
    }

    private PasswordResetEmailSender(
        Supplier<JavaMailSender> mailSenderSupplier,
        boolean enabled,
        String fromAddress,
        Resource logoResource
    ) {
        this.mailSenderSupplier = mailSenderSupplier;
        this.enabled = enabled;
        this.fromAddress = fromAddress;
        this.logoResource = logoResource;
    }

    public void sendPasswordResetEmail(String recipientEmail, String resetUrl, Instant expiresAt) {
        if (!enabled) {
            return;
        }

        JavaMailSender mailSender = mailSenderSupplier.get();
        if (mailSender == null) {
            log.warn("Password reset email is enabled, but no SMTP mail sender is configured.");
            return;
        }

        try {
            String expiresText = DateTimeFormatter.ISO_INSTANT.format(expiresAt);
            boolean includeLogo = logoResource != null && logoResource.exists();
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(
                message,
                MimeMessageHelper.MULTIPART_MODE_RELATED,
                StandardCharsets.UTF_8.name()
            );
            helper.setFrom(fromAddress);
            helper.setTo(recipientEmail);
            helper.setSubject("Reset your LineWatchTO password");
            helper.setText(textBody(resetUrl, expiresText), htmlBody(resetUrl, expiresText, includeLogo));
            if (includeLogo) {
                helper.addInline(LOGO_CONTENT_ID, logoResource, "image/png");
            }
            mailSender.send(message);
        } catch (MailException | MessagingException ex) {
            log.warn("Password reset email delivery failed.", ex);
        }
    }

    private String textBody(String resetUrl, String expiresText) {
        return """
            We received a request to reset your LineWatchTO password.

            Open this link to choose a new password:
            %s

            This link expires at %s.

            If you did not request this, you can ignore this email.
            """.formatted(resetUrl, expiresText);
    }

    private String htmlBody(String resetUrl, String expiresText, boolean includeLogo) {
        String safeResetUrl = HtmlUtils.htmlEscape(resetUrl);
        String safeExpiresText = HtmlUtils.htmlEscape(expiresText);
        String logoHtml = includeLogo
            ? """
                <img src="cid:%s" width="96" height="96" alt="LineWatchTO" style="display:block;width:96px;height:96px;margin:0 auto 20px auto;border:0;" />
                """.formatted(LOGO_CONTENT_ID)
            : "";

        return """
            <!doctype html>
            <html lang="en">
              <body style="margin:0;background:#0b1020;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#e5edf7;">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #273449;border-radius:8px;">
                  <tr>
                    <td style="padding:32px 28px;text-align:left;">
                      %s
                      <p style="margin:0 0 8px 0;color:#8ea2bb;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">LineWatchTO</p>
                      <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:24px;line-height:1.25;">Reset your password</h1>
                      <p style="margin:0 0 22px 0;color:#cbd5e1;font-size:15px;line-height:1.6;">We received a request to reset your LineWatchTO password.</p>
                      <p style="margin:0 0 26px 0;">
                        <a href="%s" style="display:inline-block;background:#f8c302;color:#0b1020;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:6px;">Reset password</a>
                      </p>
                      <p style="margin:0 0 18px 0;color:#cbd5e1;font-size:14px;line-height:1.55;">This link expires at <strong style="color:#ffffff;">%s</strong>.</p>
                      <p style="margin:0 0 18px 0;color:#94a3b8;font-size:13px;line-height:1.55;">If the button does not work, copy and paste this link into your browser:</p>
                      <p style="margin:0 0 22px 0;color:#93c5fd;font-size:12px;line-height:1.55;word-break:break-all;">%s</p>
                      <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.55;">If you did not request this, you can ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
            """.formatted(logoHtml, safeResetUrl, safeExpiresText, safeResetUrl);
    }
}
