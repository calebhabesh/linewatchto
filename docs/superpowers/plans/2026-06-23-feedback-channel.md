# Feedback Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a viewing-only user feedback channel to LineWatch TO with a desktop main-menu entry, a mobile More entry, a text-box submission panel, backend email delivery to `feedback@linewatchto.ca`, and a quiet support link for independent development.

**Architecture:** The frontend owns the panel, navigation entries, validation, and submission state. The backend owns final validation, bot/rate-limit protection, and SMTP delivery through the existing Spring Mail dependency. Feedback is not persisted and does not collect a reply email; the only durable copy is the email delivered to the configured destination.

**Tech Stack:** Next.js App Router, React, TypeScript, plain CSS in `frontend/src/app/globals.css`, Node built-in test runner, Java 21, Spring Boot, Spring Mail, JUnit 5, Mockito, AssertJ.

---

## Product Decisions

- Destination address: `feedback@linewatchto.ca`.
- Monitoring model: route `feedback@linewatchto.ca` to the owner Gmail using Cloudflare Email Routing or the current domain email provider, then use a Gmail filter with `to:feedback@linewatchto.ca` to apply a `LineWatch TO / Feedback` label.
- Reply model: no reply field and no reply workflow in the app. User messages are for viewing and roadmap triage only.
- Support action text: use `Support LineWatch TO` as the button label and `Help keep independent transit tooling maintained.` as supporting copy. Do not mention donations, money, tips, coffee, or begging in the app.
- Support URL: read `NEXT_PUBLIC_LINEWATCH_SUPPORT_URL` from the frontend environment. Production should set it to the public Buy Me a Coffee profile URL. If it is blank, hide the support action instead of rendering a broken link.
- Privacy: do not email or persist IP address, account email, cookies, or user agent. Use the client IP only in memory for backend rate limiting.
- Failure behavior: if backend feedback delivery is unavailable, show an error and a `Open Email App` fallback link to `mailto:feedback@linewatchto.ca` with the typed message prefilled.

## File Structure

- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackConfiguration.java`: enables feedback configuration properties.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackProperties.java`: owns feature flag, email addresses, message limits, and rate-limit settings.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackException.java`: typed HTTP exception for validation, unavailable sender, and rate limit failures.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackErrorResponse.java`: JSON error shape.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackResponses.java`: request and response records.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackRateLimiter.java`: small in-memory per-IP limiter for public feedback submissions.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSender.java`: SMTP delivery component.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackService.java`: validation, honeypot, and send orchestration.
- Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackController.java`: public `POST /api/feedback` endpoint.
- Create backend tests under `backend/src/test/java/com/calebhabesh/linewatch/feedback/`.
- Create `frontend/src/app/feedback-data.ts`: frontend API adapter and error type.
- Create `frontend/src/components/FeedbackPanel.tsx`: reusable panel for desktop floating panel and mobile sheet.
- Modify `frontend/src/components/LineWatchShell.tsx`: add `feedback` active view, desktop menu item, panel rendering, and mobile More callback.
- Modify `frontend/src/components/MobileMoreSheet.tsx`: add a Tools row for feedback.
- Modify `frontend/src/app/globals.css`: add scoped feedback panel styles.
- Create `frontend/tests/feedback-data.test.mjs`: frontend adapter tests.
- Create `frontend/tests/feedback-ui.test.mjs`: static source tests for navigation, panel copy, support link gating, and styles.
- Modify `README.md`: document feedback email routing, SMTP settings, support URL configuration, and privacy behavior.

---

### Task 1: Backend Feedback Contract and Validation

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackResponses.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackException.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackErrorResponse.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackConfiguration.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackService.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackServiceTest.java`

- [ ] **Step 1: Write the failing service tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackServiceTest.java`:

```java
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackServiceTest test
```

Expected: compilation fails because `FeedbackService`, `FeedbackResponses`, `FeedbackException`, `FeedbackProperties`, and `FeedbackEmailSender` do not exist.

- [ ] **Step 3: Add the contract, properties, and service**

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackResponses.java`:

```java
package com.calebhabesh.linewatch.feedback;

public final class FeedbackResponses {
    private FeedbackResponses() {}

    public record SubmitFeedbackRequest(
        String message,
        String pageUrl,
        String appVersion,
        String dataSource,
        String viewport,
        String website
    ) {}

    public record SubmitFeedbackResponse(boolean accepted, String message) {}
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackException.java`:

```java
package com.calebhabesh.linewatch.feedback;

import org.springframework.http.HttpStatus;

public class FeedbackException extends RuntimeException {
    private final HttpStatus status;
    private final String error;

    public FeedbackException(HttpStatus status, String error, String message) {
        super(message);
        this.status = status;
        this.error = error;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getError() {
        return error;
    }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackErrorResponse.java`:

```java
package com.calebhabesh.linewatch.feedback;

public record FeedbackErrorResponse(String error, String message) {}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackProperties.java`:

```java
package com.calebhabesh.linewatch.feedback;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.feedback")
public class FeedbackProperties {
    private boolean enabled = false;
    private String from = "no-reply@linewatch.local";
    private String to = "feedback@linewatchto.ca";
    private int maxMessageLength = 2000;
    private RateLimit rateLimit = new RateLimit();

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = from;
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public int getMaxMessageLength() {
        return maxMessageLength;
    }

    public void setMaxMessageLength(int maxMessageLength) {
        this.maxMessageLength = maxMessageLength;
    }

    public RateLimit getRateLimit() {
        return rateLimit;
    }

    public void setRateLimit(RateLimit rateLimit) {
        this.rateLimit = rateLimit;
    }

    public static class RateLimit {
        private boolean enabled = true;
        private Duration window = Duration.ofMinutes(15);
        private int maxRequests = 5;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public Duration getWindow() {
            return window;
        }

        public void setWindow(Duration window) {
            this.window = window;
        }

        public int getMaxRequests() {
            return maxRequests;
        }

        public void setMaxRequests(int maxRequests) {
            this.maxRequests = maxRequests;
        }
    }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackConfiguration.java`:

```java
package com.calebhabesh.linewatch.feedback;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(FeedbackProperties.class)
public class FeedbackConfiguration {}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackService.java`:

```java
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
```

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSender.java` as a temporary compiling implementation. Task 2 replaces it with SMTP logic:

```java
package com.calebhabesh.linewatch.feedback;

import org.springframework.stereotype.Component;

@Component
public class FeedbackEmailSender {
    public boolean sendFeedback(FeedbackResponses.SubmitFeedbackRequest request) {
        return true;
    }
}
```

- [ ] **Step 4: Run the service tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackServiceTest test
```

Expected: `Tests run: 6, Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/feedback backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackServiceTest.java
git commit -m "feat: add feedback validation contract"
```

---

### Task 2: Backend SMTP Delivery

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSender.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSenderTest.java`

- [ ] **Step 1: Write the failing email sender tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSenderTest.java`:

```java
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
```

- [ ] **Step 2: Run the email sender test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackEmailSenderTest test
```

Expected: compilation fails because `FeedbackEmailSender` does not yet expose constructors matching the test, or assertions fail because the temporary sender does not send mail.

- [ ] **Step 3: Replace the temporary sender with SMTP delivery**

Replace `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSender.java` with:

```java
package com.calebhabesh.linewatch.feedback;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
            helper.setSubject("LineWatch TO feedback");
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
            LineWatch TO feedback

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
                      <p style="margin:0 0 8px 0;color:#8ea2bb;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">LineWatch TO</p>
                      <h1 style="margin:0 0 18px 0;color:#ffffff;font-size:22px;line-height:1.25;">LineWatch TO feedback</h1>
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
```

- [ ] **Step 4: Run the email sender tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackEmailSenderTest test
```

Expected: `Tests run: 4, Failures: 0, Errors: 0`.

- [ ] **Step 5: Run the existing service tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackServiceTest test
```

Expected: `Tests run: 6, Failures: 0, Errors: 0`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSender.java backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackEmailSenderTest.java
git commit -m "feat: send feedback by email"
```

---

### Task 3: Backend Controller and Rate Limit

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackRateLimiter.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackController.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackRateLimiterTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackControllerTest.java`

- [ ] **Step 1: Write the failing rate limiter test**

Create `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackRateLimiterTest.java`:

```java
package com.calebhabesh.linewatch.feedback;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class FeedbackRateLimiterTest {
    @Test
    void limitsFeedbackSubmissionsByClientAddress() {
        FeedbackProperties properties = new FeedbackProperties();
        properties.getRateLimit().setEnabled(true);
        properties.getRateLimit().setMaxRequests(2);
        properties.getRateLimit().setWindow(Duration.ofMinutes(15));
        FeedbackRateLimiter limiter = new FeedbackRateLimiter(
            properties,
            Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneOffset.UTC)
        );

        limiter.requireFeedbackAttempt("203.0.113.10");
        limiter.requireFeedbackAttempt("203.0.113.10");

        assertThatThrownBy(() -> limiter.requireFeedbackAttempt("203.0.113.10"))
            .isInstanceOf(FeedbackException.class)
            .satisfies(error -> {
                FeedbackException ex = (FeedbackException) error;
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
                assertThat(ex.getError()).isEqualTo("rate_limited");
                assertThat(ex.getMessage()).isEqualTo("Too many feedback submissions. Try again later.");
            });
    }
}
```

- [ ] **Step 2: Write the failing controller test**

Create `backend/src/test/java/com/calebhabesh/linewatch/feedback/FeedbackControllerTest.java`:

```java
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
```

- [ ] **Step 3: Run the controller/rate limiter tests and verify they fail**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackRateLimiterTest,FeedbackControllerTest test
```

Expected: compilation fails because `FeedbackRateLimiter` and `FeedbackController` do not exist.

- [ ] **Step 4: Implement rate limiting**

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackRateLimiter.java`:

```java
package com.calebhabesh.linewatch.feedback;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class FeedbackRateLimiter {
    private final FeedbackProperties properties;
    private final Clock clock;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public FeedbackRateLimiter(FeedbackProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public void requireFeedbackAttempt(String remoteAddress) {
        FeedbackProperties.RateLimit limit = properties.getRateLimit();
        if (!limit.isEnabled() || limit.getMaxRequests() <= 0) {
            return;
        }

        Instant now = clock.instant();
        String key = "feedback:" + normalizeAddress(remoteAddress);
        buckets.compute(key, (ignored, bucket) -> {
            if (bucket == null || !bucket.windowStart().plus(limit.getWindow()).isAfter(now)) {
                return new Bucket(now, 1);
            }
            if (bucket.count() >= limit.getMaxRequests()) {
                throw new FeedbackException(
                    HttpStatus.TOO_MANY_REQUESTS,
                    "rate_limited",
                    "Too many feedback submissions. Try again later."
                );
            }
            return new Bucket(bucket.windowStart(), bucket.count() + 1);
        });
    }

    private static String normalizeAddress(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? "unknown" : normalized;
    }

    private record Bucket(Instant windowStart, int count) {}
}
```

- [ ] **Step 5: Implement the controller**

Create `backend/src/main/java/com/calebhabesh/linewatch/feedback/FeedbackController.java`:

```java
package com.calebhabesh.linewatch.feedback;

import com.calebhabesh.linewatch.account.AccountRateLimiter;
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

    public FeedbackController(FeedbackService feedbackService, FeedbackRateLimiter rateLimiter) {
        this.feedbackService = feedbackService;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    public ResponseEntity<FeedbackResponses.SubmitFeedbackResponse> submit(
        @RequestBody FeedbackResponses.SubmitFeedbackRequest request,
        HttpServletRequest httpRequest
    ) {
        rateLimiter.requireFeedbackAttempt(AccountRateLimiter.clientAddress(httpRequest));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(feedbackService.submit(request));
    }

    @ExceptionHandler(FeedbackException.class)
    public ResponseEntity<FeedbackErrorResponse> handleFeedbackException(FeedbackException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new FeedbackErrorResponse(ex.getError(), ex.getMessage()));
    }
}
```

- [ ] **Step 6: Run the backend feedback tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=FeedbackServiceTest,FeedbackEmailSenderTest,FeedbackRateLimiterTest,FeedbackControllerTest test
```

Expected: all feedback tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/feedback backend/src/test/java/com/calebhabesh/linewatch/feedback
git commit -m "feat: expose feedback submission endpoint"
```

---

### Task 4: Frontend Feedback API Adapter

**Files:**
- Create: `frontend/src/app/feedback-data.ts`
- Test: `frontend/tests/feedback-data.test.mjs`

- [ ] **Step 1: Write the failing adapter tests**

Create `frontend/tests/feedback-data.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FeedbackRequestError,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  buildFeedbackMailtoUrl,
  submitFeedback,
} from "../src/app/feedback-data.ts";

describe("feedback data adapter", () => {
  it("posts feedback to the same-origin backend endpoint", async () => {
    const requests = [];
    const response = await submitFeedback(
      {
        message: "Please make weekend closures easier to scan.",
        pageUrl: "/?panel=closures",
        appVersion: "0.1.0-dev",
        dataSource: "backend",
        viewport: "390x844",
        website: "",
      },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(JSON.stringify({ accepted: true, message: "Feedback received." }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );

    assert.deepEqual(response, { accepted: true, message: "Feedback received." });
    assert.equal(requests[0].input, "/api/feedback");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      message: "Please make weekend closures easier to scan.",
      pageUrl: "/?panel=closures",
      appVersion: "0.1.0-dev",
      dataSource: "backend",
      viewport: "390x844",
      website: "",
    });
  });

  it("surfaces backend feedback errors", async () => {
    await assert.rejects(
      () =>
        submitFeedback(
          {
            message: "x".repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 1),
            pageUrl: "/",
            appVersion: "0.1.0-dev",
            dataSource: "fixture",
            viewport: "1280x720",
            website: "",
          },
          {
            fetcher: async () =>
              new Response(JSON.stringify({ error: "feedback_too_long", message: "Feedback must be 2000 characters or less." }), {
                status: 400,
                headers: { "content-type": "application/json" },
              }),
          },
        ),
      (error) =>
        error instanceof FeedbackRequestError &&
        error.status === 400 &&
        error.errorCode === "feedback_too_long" &&
        error.message === "Feedback must be 2000 characters or less.",
    );
  });

  it("builds a mailto fallback with the typed message and page context", () => {
    const url = buildFeedbackMailtoUrl({
      message: "Could you make Line 2 delays more visible?",
      pageUrl: "/?panel=delays",
      appVersion: "0.1.0-dev",
      dataSource: "fixture",
      viewport: "1280x720",
      website: "",
    });

    assert.match(url, /^mailto:feedback@linewatchto\.ca\?/);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("subject"), "LineWatch TO feedback");
    assert.match(parsed.searchParams.get("body"), /Could you make Line 2 delays more visible\?/);
    assert.match(parsed.searchParams.get("body"), /Page: \/\?panel=delays/);
    assert.match(parsed.searchParams.get("body"), /App version: 0\.1\.0-dev/);
  });
});
```

- [ ] **Step 2: Run the adapter test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "feedback data adapter"
```

Expected: fails because `frontend/src/app/feedback-data.ts` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `frontend/src/app/feedback-data.ts`:

```ts
import { apiUrl as buildApiUrl } from "./api-client.ts";

type Fetcher = typeof fetch;

type AdapterOptions = {
  fetcher?: Fetcher;
  apiBaseUrl?: string;
};

export const MAX_FEEDBACK_MESSAGE_LENGTH = 2000;
export const FEEDBACK_DESTINATION_EMAIL = "feedback@linewatchto.ca";

export type SubmitFeedbackInput = {
  message: string;
  pageUrl: string;
  appVersion: string;
  dataSource: "backend" | "fixture" | "unavailable" | string;
  viewport: string;
  website: string;
};

export type SubmitFeedbackResponse = {
  accepted: boolean;
  message: string;
};

export class FeedbackRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.name = "FeedbackRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export async function submitFeedback(input: SubmitFeedbackInput, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl("/api/feedback", options), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const error = await readFeedbackError(response);
    throw new FeedbackRequestError(response.status, error.message, error.errorCode);
  }
  return (await response.json()) as SubmitFeedbackResponse;
}

export function buildFeedbackMailtoUrl(input: SubmitFeedbackInput) {
  const body = [
    input.message.trim(),
    "",
    `Page: ${input.pageUrl || "/"}`,
    `App version: ${input.appVersion || "unknown"}`,
    `Data source: ${input.dataSource || "unknown"}`,
    `Viewport: ${input.viewport || "unknown"}`,
  ].join("\n");
  const params = new URLSearchParams({
    subject: "LineWatch TO feedback",
    body,
  });
  return `mailto:${FEEDBACK_DESTINATION_EMAIL}?${params.toString()}`;
}

function apiUrl(path: string, options: AdapterOptions = {}) {
  return buildApiUrl(path, options.apiBaseUrl);
}

async function readFeedbackError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return {
      errorCode: body.error ?? null,
      message: body.message || `Feedback request failed with ${response.status}`,
    };
  } catch {
    return {
      errorCode: null,
      message: `Feedback request failed with ${response.status}`,
    };
  }
}
```

- [ ] **Step 4: Run the adapter test and verify it passes**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "feedback data adapter"
```

Expected: the feedback adapter tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/feedback-data.ts frontend/tests/feedback-data.test.mjs
git commit -m "feat: add feedback frontend adapter"
```

---

### Task 5: Feedback Panel UI

**Files:**
- Create: `frontend/src/components/FeedbackPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/feedback-ui.test.mjs`

- [ ] **Step 1: Write the failing panel source test**

Create `frontend/tests/feedback-ui.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const panelUrl = new URL("../src/components/FeedbackPanel.tsx", import.meta.url);
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("feedback panel UI", () => {
  it("renders a focused improvement textbox without reply collection", () => {
    assert.equal(existsSync(panelUrl), true);
    const panelSource = readFileSync(panelUrl, "utf8");
    assert.match(panelSource, /export function FeedbackPanel/);
    assert.match(panelSource, /Suggest an Improvement/);
    assert.match(panelSource, /What could LineWatch TO make clearer or easier to use\?/);
    assert.match(panelSource, /textarea/);
    assert.match(panelSource, /MAX_FEEDBACK_MESSAGE_LENGTH/);
    assert.match(panelSource, /submitFeedback/);
    assert.match(panelSource, /buildFeedbackMailtoUrl/);
    assert.doesNotMatch(panelSource, /replyEmail|email address|Reply email/i);
  });

  it("includes quiet independent development support copy", () => {
    const panelSource = readFileSync(panelUrl, "utf8");
    assert.match(panelSource, /Support LineWatch TO/);
    assert.match(panelSource, /Help keep independent transit tooling maintained\./);
    assert.match(panelSource, /supportUrl/);
    assert.doesNotMatch(panelSource, /Buy Me a Coffee|coffee|donat|tip|money/i);
  });

  it("adds scoped feedback styles", () => {
    assert.match(globalCss, /\.feedback-panel/);
    assert.match(globalCss, /\.feedback-textarea/);
    assert.match(globalCss, /\.feedback-support-card/);
    assert.match(globalCss, /\.feedback-honeypot/);
  });
});
```

- [ ] **Step 2: Run the UI source test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "feedback panel UI"
```

Expected: fails because `FeedbackPanel.tsx` and feedback CSS do not exist.

- [ ] **Step 3: Implement `FeedbackPanel.tsx`**

Create `frontend/src/components/FeedbackPanel.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Send, X } from "lucide-react";
import { lineWatchAppVersionLabel } from "../app/app-build";
import {
  FeedbackRequestError,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  buildFeedbackMailtoUrl,
  submitFeedback,
  type SubmitFeedbackInput,
} from "../app/feedback-data";

type Props = {
  dataSource: string;
  supportUrl: string;
  onBack: () => void;
  onClose: () => void;
};

export function FeedbackPanel({ dataSource, supportUrl, onBack, onClose }: Props) {
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo<SubmitFeedbackInput>(() => ({
    message,
    pageUrl: typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}` || "/",
    appVersion: lineWatchAppVersionLabel,
    dataSource,
    viewport: typeof window === "undefined" ? "unknown" : `${window.innerWidth}x${window.innerHeight}`,
    website,
  }), [dataSource, message, website]);

  const remaining = MAX_FEEDBACK_MESSAGE_LENGTH - message.length;
  const canSubmit = message.trim().length > 0 && message.length <= MAX_FEEDBACK_MESSAGE_LENGTH && !busy;
  const mailtoUrl = buildFeedbackMailtoUrl(context);
  const trimmedSupportUrl = supportUrl.trim();

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError(message.trim().length === 0 ? "Enter a suggestion before sending feedback." : `Feedback must be ${MAX_FEEDBACK_MESSAGE_LENGTH} characters or less.`);
      setStatus(null);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await submitFeedback(context);
      setStatus(response.message);
      setMessage("");
    } catch (submitError) {
      if (submitError instanceof FeedbackRequestError) {
        setError(submitError.message);
      } else {
        setError("Feedback could not be sent.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="feedback-panel panel" aria-label="Suggest an improvement">
      <div className="panel-heading">
        <button type="button" onClick={onBack} className="panel-back-button" aria-label="Back to menu">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="panel-kicker">LineWatch TO</p>
          <h2>Suggest an Improvement</h2>
        </div>
        <button type="button" onClick={onClose} className="panel-close-button" aria-label="Close feedback">
          <X size={18} />
        </button>
      </div>

      <div className="feedback-content">
        <label className="feedback-field">
          <span>What could LineWatch TO make clearer or easier to use?</span>
          <textarea
            className="feedback-textarea"
            value={message}
            maxLength={MAX_FEEDBACK_MESSAGE_LENGTH}
            onChange={(event) => {
              setMessage(event.target.value);
              setError(null);
              setStatus(null);
            }}
            rows={7}
          />
        </label>
        <label className="feedback-honeypot" aria-hidden="true">
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
        <div className="feedback-actions">
          <span className={remaining < 0 ? "feedback-count feedback-count-error" : "feedback-count"}>
            {remaining} characters remaining
          </span>
          <button type="button" className="account-primary-button feedback-submit-button" disabled={!canSubmit} onClick={handleSubmit}>
            <Send size={16} />
            {busy ? "Sending" : "Send Feedback"}
          </button>
        </div>
        {status ? <p className="feedback-status" role="status">{status}</p> : null}
        {error ? (
          <p className="feedback-error" role="alert">
            {error} <a href={mailtoUrl}>Open Email App</a>
          </p>
        ) : null}
        {trimmedSupportUrl ? (
          <div className="feedback-support-card">
            <div>
              <strong>Support LineWatch TO</strong>
              <span>Help keep independent transit tooling maintained.</span>
            </div>
            <a href={trimmedSupportUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add scoped CSS**

Append to `frontend/src/app/globals.css` near the account/notification panel styles:

```css
.feedback-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.feedback-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.feedback-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feedback-field span,
.feedback-count,
.feedback-support-card span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.dark .feedback-field span,
.dark .feedback-count,
.dark .feedback-support-card span,
.high-contrast .feedback-field span,
.high-contrast .feedback-count,
.high-contrast .feedback-support-card span {
  color: #94a3b8;
}

.feedback-textarea {
  min-height: 152px;
  resize: vertical;
  border-radius: 8px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  background: rgba(255, 255, 255, 0.86);
  color: #0f172a;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  padding: 12px;
  outline: none;
}

.feedback-textarea:focus-visible {
  border-color: rgba(37, 99, 235, 0.7);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
}

.dark .feedback-textarea,
.high-contrast .feedback-textarea {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.86);
  color: #f8fafc;
}

.feedback-honeypot {
  position: absolute;
  left: -10000px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.feedback-actions {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.feedback-count-error,
.feedback-error {
  color: #dc2626;
}

.dark .feedback-error,
.high-contrast .feedback-error {
  color: #fca5a5;
}

.feedback-submit-button {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  justify-content: center;
  min-width: 148px;
}

.feedback-status {
  border: 1px solid rgba(16, 185, 129, 0.24);
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.1);
  color: #047857;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  padding: 10px 12px;
}

.dark .feedback-status,
.high-contrast .feedback-status {
  color: #86efac;
}

.feedback-error {
  border: 1px solid rgba(220, 38, 38, 0.24);
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.08);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  padding: 10px 12px;
}

.feedback-error a {
  color: inherit;
  text-decoration: underline;
}

.feedback-support-card {
  align-items: center;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.86);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 12px;
}

.feedback-support-card div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.feedback-support-card strong {
  color: #0f172a;
  font-size: 13px;
  line-height: 1.3;
}

.feedback-support-card a {
  align-items: center;
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 8px;
  color: #1d4ed8;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 800;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  text-decoration: none;
}

.dark .feedback-support-card,
.high-contrast .feedback-support-card {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(15, 23, 42, 0.78);
}

.dark .feedback-support-card strong,
.high-contrast .feedback-support-card strong {
  color: #f8fafc;
}

.dark .feedback-support-card a,
.high-contrast .feedback-support-card a {
  border-color: rgba(96, 165, 250, 0.34);
  color: #93c5fd;
}
```

- [ ] **Step 5: Run the panel UI test and verify it passes**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "feedback panel UI"
```

Expected: the feedback panel UI tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FeedbackPanel.tsx frontend/src/app/globals.css frontend/tests/feedback-ui.test.mjs
git commit -m "feat: add feedback panel"
```

---

### Task 6: Navigation Integration

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/MobileMoreSheet.tsx`
- Modify: `frontend/tests/feedback-ui.test.mjs`

- [ ] **Step 1: Extend the source test for navigation**

Append this test to `frontend/tests/feedback-ui.test.mjs`:

```js
describe("feedback navigation", () => {
  const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
  const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

  it("adds feedback to the desktop menu and mobile More sheet", () => {
    assert.match(shellSource, /"feedback"/);
    assert.match(shellSource, /FeedbackPanel/);
    assert.match(shellSource, /NEXT_PUBLIC_LINEWATCH_SUPPORT_URL/);
    assert.match(shellSource, /Suggest Improvement/);
    assert.match(shellSource, /setActiveView\("feedback"\)/);
    assert.match(moreSheetSource, /onOpenFeedback/);
    assert.match(moreSheetSource, /Suggest Improvement/);
  });
});
```

- [ ] **Step 2: Run the navigation test and verify it fails**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "feedback navigation"
```

Expected: fails because `feedback` is not integrated in `LineWatchShell.tsx` or `MobileMoreSheet.tsx`.

- [ ] **Step 3: Modify `MobileMoreSheet.tsx`**

In `frontend/src/components/MobileMoreSheet.tsx`, update the lucide import:

```ts
import { BarChart3, Bell, LogIn, LogOut, MessageSquareText, RefreshCcw, Contrast, Pause, UserPlus, UserRound, X, History } from "lucide-react";
```

Add `onOpenFeedback` to `Props`:

```ts
  onOpenFeedback: () => void;
```

Add it to the function parameters:

```ts
  onOpenFeedback,
```

In the Tools section, add the row immediately before `Reliability Analytics`:

```tsx
          <button type="button" className="mobile-more-row" onClick={onOpenFeedback}>
            <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" />
            Suggest Improvement
          </button>
```

- [ ] **Step 4: Modify `LineWatchShell.tsx` imports and active view type**

In `frontend/src/components/LineWatchShell.tsx`, add the component import:

```ts
import { FeedbackPanel } from "./FeedbackPanel";
```

Update the lucide import to include `MessageSquareText`:

```ts
import { Menu, X, Map as MapIcon, AlertTriangle, Calendar, Navigation, ShieldCheck, BarChart3, Bell, Construction, Search, LogIn, LogOut, UserPlus, UserRound, Sun, Moon, Bus, Mail, Contrast, Pause, History, MessageSquareText } from "lucide-react";
```

Update `ActiveView` to include `"feedback"`:

```ts
type ActiveView = "map" | "menu" | "search" | "status" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "notifications" | "analytics" | "more" | "accessibility-outages" | "surface-notices" | "alert-history" | "feedback";
```

Add a support URL constant inside `LineWatchShell` after `pushSettings`:

```ts
  const supportUrl = process.env.NEXT_PUBLIC_LINEWATCH_SUPPORT_URL?.trim() ?? "";
```

- [ ] **Step 5: Add mobile panel handling in `LineWatchShell.tsx`**

Update `mobileNavKey` so feedback maps to More:

```ts
    if (activeView === "notifications" || activeView === "more" || activeView === "analytics" || activeView === "alert-history" || activeView === "feedback") return "more";
```

Update `isMobilePanel` to include feedback:

```ts
    activeView === "feedback" ||
```

Update `getMobileSheetLabel`:

```ts
      case "feedback": return "Suggest Improvement";
```

Add the `feedback` case in `renderPanelContent`:

```tsx
      case "feedback":
        return (
          <FeedbackPanel
            dataSource={displayData.dataSource}
            supportUrl={supportUrl}
            onBack={() => setActiveView(isMobile ? "more" : "menu")}
            onClose={() => { setActiveView("map"); setSelection(null); }}
          />
        );
```

Pass `onOpenFeedback` into both `MobileMoreSheet` render sites:

```tsx
            onOpenFeedback={() => setActiveView("feedback")}
```

- [ ] **Step 6: Add the desktop floating panel branch**

In the `activeFloatingPanel` chain in `LineWatchShell.tsx`, add the `feedback` branch before the `analytics` branch:

```tsx
    ) : activeView === "feedback" ? (
      <FloatingPanelShell panel="feedback" mobileSheetLabel="Suggest Improvement">
        <FeedbackPanel
          dataSource={displayData.dataSource}
          supportUrl={supportUrl}
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
```

- [ ] **Step 7: Add the desktop menu row**

In the desktop menu nav links in `LineWatchShell.tsx`, add this row after `Alert History` and before `Reliability Analytics`:

```tsx
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => setActiveView("feedback")}
                   aria-current={activeView === "feedback" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" /> Suggest Improvement
                 </button>
```

- [ ] **Step 8: Run the navigation test and verify it passes**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "feedback navigation"
```

Expected: the feedback navigation test passes.

- [ ] **Step 9: Run broader frontend static tests affected by menu changes**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern "floating menu layout|mobile bottom sheet UX|feedback"
```

Expected: all selected tests pass. If `drawer-layout.test.mjs` has an exact `ActiveView` regex, update that regex to include `feedback` in the same union position used in the code, then rerun this command.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/src/components/MobileMoreSheet.tsx frontend/tests/feedback-ui.test.mjs frontend/tests/drawer-layout.test.mjs
git commit -m "feat: add feedback navigation"
```

---

### Task 7: Documentation and Environment Configuration

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add README documentation**

In `README.md`, add a subsection near the existing password-reset email configuration:

````markdown
### Feedback Channel

LineWatch TO can accept viewing-only product feedback through `POST /api/feedback`.
The form does not collect a reply email and the backend does not persist feedback in the database.
When feedback email delivery is unavailable, the frontend offers a prefilled email-app fallback to `feedback@linewatchto.ca`.

Recommended inbox setup:

1. Route `feedback@linewatchto.ca` to the owner Gmail inbox with Cloudflare Email Routing or the current domain email provider.
2. In Gmail, create a filter for `to:feedback@linewatchto.ca`.
3. Apply a label such as `LineWatch TO / Feedback`.
4. Keep early feedback in the inbox until volume justifies archiving it automatically.

Backend feedback email settings:

```bash
LINEWATCH_FEEDBACK_ENABLED=true
LINEWATCH_FEEDBACK_FROM=no-reply@linewatchto.ca
LINEWATCH_FEEDBACK_TO=feedback@linewatchto.ca
LINEWATCH_FEEDBACK_RATE_LIMIT_MAX_REQUESTS=5
LINEWATCH_FEEDBACK_RATE_LIMIT_WINDOW=PT15M
```

These settings use the same Spring Mail SMTP configuration described for password reset email.
Use a LineWatch-owned sender such as `no-reply@linewatchto.ca` or `no-reply@mail.linewatchto.ca`.
Do not commit SMTP usernames, passwords, API keys, app passwords, or Gmail credentials.

Frontend support-link setting:

```bash
NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=https://buymeacoffee.com/linewatchto
```

Set this to the public Buy Me a Coffee profile URL for the project account.
If the value is blank, the feedback panel hides the support action.
The in-app button is labeled `Support LineWatch TO` and avoids donation, money, tip, or coffee wording.
````

If `linewatchto` is not the actual Buy Me a Coffee handle, replace only the example URL with the real public profile URL before deploying.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document feedback channel setup"
```

---

### Task 8: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: all frontend fixture tests pass.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: TypeScript exits successfully.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: lint exits successfully.

- [ ] **Step 5: Run frontend build because this touches client navigation and env wiring**

Run:

```bash
npm --prefix frontend run build
```

Expected: Next.js build exits successfully.

- [ ] **Step 6: Review the diff**

Run:

```bash
git status --short
git diff --stat
git diff -- backend/src/main/java/com/calebhabesh/linewatch/feedback frontend/src/app/feedback-data.ts frontend/src/components/FeedbackPanel.tsx frontend/src/components/LineWatchShell.tsx frontend/src/components/MobileMoreSheet.tsx frontend/src/app/globals.css README.md
```

Expected:
- Feedback endpoint is public but rate-limited.
- Feedback form has no reply-email field.
- Honeypot field is hidden and non-focusable.
- Error state includes mailto fallback.
- Support action is hidden when `NEXT_PUBLIC_LINEWATCH_SUPPORT_URL` is blank.
- App copy does not mention donation, money, tip, coffee, or begging.

- [ ] **Step 7: Final commit**

If Task 8 produced fixes, commit them:

```bash
git add backend frontend README.md
git commit -m "chore: verify feedback channel"
```

Skip this commit if there are no changes after verification.

---

## Deployment Notes

- Create or verify the inbound route `feedback@linewatchto.ca` before turning on `LINEWATCH_FEEDBACK_ENABLED=true`.
- Confirm Gmail receives a manual test email to `feedback@linewatchto.ca`.
- Confirm the Gmail filter applies the `LineWatch TO / Feedback` label.
- Configure SMTP using the existing Spring Mail variables already documented for password resets.
- Configure `NEXT_PUBLIC_LINEWATCH_SUPPORT_URL` in frontend production/staging environments.
- Submit one feedback message in staging and verify that the email arrives with message, page, app version, data source, and viewport.
- Submit six quick feedback messages from the same client in staging and verify the sixth returns a rate-limit error.
- Leave `LINEWATCH_FEEDBACK_ENABLED=false` in any environment where SMTP is not configured.

## Self-Review

- Spec coverage: The plan covers desktop menu entry, mobile More entry, text-box feedback submission, viewing-only email delivery to `feedback@linewatchto.ca`, support link copy, no reply workflow, rate limiting, honeypot protection, fallback mailto, docs, and verification.
- Placeholder scan: The plan contains no deferred implementation markers. The only replaceable deployment value is the documented support URL example, and the code reads the real value from `NEXT_PUBLIC_LINEWATCH_SUPPORT_URL`.
- Type consistency: Backend request fields are `message`, `pageUrl`, `appVersion`, `dataSource`, `viewport`, and `website` across service, sender, controller, and frontend adapter. Frontend active view is consistently named `feedback`.
