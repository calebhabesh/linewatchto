# Pre-Deploy Official Metrics, Redis Cache, And Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare LineWatch TO for deployment by replacing fixture reliability rows with official TTC.ca performance metrics, adding Redis-backed dashboard caching, cleaning release/documentation state, adding CI, and documenting/executing deployment.

**Architecture:** Spring Boot owns all external data ingestion, parsing, caching, and stale/fallback behavior. Next.js remains a typed consumer with fixture fallback. Redis caches current dashboard read models with bounded TTLs and fails open to database/live computation when unavailable.

**Tech Stack:** Java 21, Spring Boot 3.5, Maven, Spring Web `RestClient`, Spring Data Redis, PostgreSQL/PostGIS, Flyway, Next.js App Router, React, TypeScript, Node test runner, Playwright, GitHub Actions.

---

## Execution Rules For Gemini 3.5 Flash

- Work from repository root: `~/dev/ttc-reliability-navigator`.
- Before editing, run `git status --short --branch`.
- Preserve all existing local changes. At the time this plan was written, the worktree had dirty frontend files including `frontend/next-env.d.ts`, `LineWatchShell.tsx`, `SavedCommutesPanel.tsx`, and related tests. Review those diffs before modifying the same files.
- Do not claim LineWatch TO is an official TTC product.
- Do not claim live TTC status unless ingestion is enabled and the latest successful run is fresh.
- Do not claim real historical LineWatch reliability aggregation. This plan replaces the visible reliability panel with official TTC.ca current performance metrics.
- Do not add route review/edit, push/email commute notifications, accessibility-personalized commute matching, live station arrivals, production geospatial matching, or GTFS shape import.
- Commit after each task when tests pass. If the user prefers no commits, complete the task and report the exact files staged-ready instead.

## Target User-Facing Result

The deployed app should show:

- Real dashboard data when the backend is available, with fixture fallback when unavailable.
- Official TTC.ca performance metrics in the analytics panel, source-labeled and timestamped.
- Redis-backed dashboard caching that speeds current read models without serving stale live impacts.
- Auth and password reset configured safely for production.
- CI proving backend and frontend checks pass.
- Deployment documentation clear enough for portfolio reviewers and future agents.

## File Map

Backend official TTC performance metrics:

- Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceProperties.java`
- Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceResponses.java`
- Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceParser.java`
- Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceClient.java`
- Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceService.java`
- Create `backend/src/main/java/com/calebhabesh/linewatch/performance/PerformanceController.java`
- Create tests under `backend/src/test/java/com/calebhabesh/linewatch/performance/`
- Create fixture `backend/src/test/resources/fixtures/ttc-performance-homepage.html`
- Modify `backend/pom.xml` to add `org.jsoup:jsoup`
- Modify `backend/src/main/resources/application.yml`

Backend Redis cache:

- Create `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java`
- Create `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheService.java`
- Create tests under `backend/src/test/java/com/calebhabesh/linewatch/cache/`
- Modify `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionFreshness.java`
- Modify `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`
- Modify `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`
- Modify `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`
- Modify `backend/src/main/java/com/calebhabesh/linewatch/health/IngestionHealthController.java`
- Modify `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionService.java`
- Modify `backend/src/main/resources/application.yml`

Frontend metrics display:

- Modify `frontend/src/app/linewatch-data.ts`
- Modify `frontend/src/app/DataContext.tsx`
- Modify `frontend/src/app/dashboard-data.ts`
- Modify `frontend/src/components/ReliabilityPanel.tsx`
- Modify or add tests under `frontend/tests/`
- Modify `frontend/tests/smoke/api-stub.mjs`
- Modify `frontend/tests/smoke/dashboard.spec.ts`

CI and deployment:

- Create `.github/workflows/ci.yml`
- Create `backend/Dockerfile`
- Create `.dockerignore`
- Create `scripts/smoke-deploy.mjs`
- Modify `.env.example`
- Modify `README.md`
- Modify `AGENTS.md`
- Modify `GEMINI.md`

---

## Task 0: Release Hygiene Baseline

**Files:**
- Read: all dirty files from `git status --short`
- Modify only if the dirty changes are already intended release polish.

- [ ] **Step 1: Inspect current dirty state**

Run:

```bash
git status --short --branch
git diff -- frontend/next-env.d.ts frontend/src/components/LineWatchShell.tsx frontend/src/components/SavedCommutesPanel.tsx frontend/tests/account-ui-source.test.mjs frontend/tests/drawer-layout.test.mjs frontend/tests/smoke/dashboard.spec.ts
```

Expected: You see only local frontend/UI/test changes or generated Next type drift. If unrelated user work appears, do not modify it.

- [ ] **Step 2: Fix existing lint warnings in `LineWatchShell.tsx`**

Current known warnings:

- unused `refreshAccountState`
- `aria-pressed` on `role="menuitem"` buttons

Implementation guidance:

- If `refreshAccountState` is unused, remove the callback and any dead references.
- For menu buttons that are actually toggles, either remove `role="menuitem"` or remove `aria-pressed`. Prefer keeping menu keyboard behavior intact and changing the toggle role only if tests support it.

Run:

```bash
npm --prefix frontend run lint
```

Expected: `eslint` exits `0` with no warnings.

- [ ] **Step 3: Verify existing frontend tests**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: both commands pass.

- [ ] **Step 4: Commit release hygiene**

Run:

```bash
git add frontend/next-env.d.ts frontend/src/components/LineWatchShell.tsx frontend/src/components/SavedCommutesPanel.tsx frontend/tests/account-ui-source.test.mjs frontend/tests/drawer-layout.test.mjs frontend/tests/smoke/dashboard.spec.ts
git diff --cached --name-status
git commit -m "chore: clean frontend release state"
```

Expected: commit includes only reviewed frontend hygiene changes. If the user has asked not to commit, skip the commit and record the staged-ready files.

---

## Task 1: Backend Official TTC Performance Metrics

**Files:**
- Modify: `backend/pom.xml`
- Modify: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceResponses.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceParser.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceClient.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/performance/PerformanceController.java`
- Create: `backend/src/test/resources/fixtures/ttc-performance-homepage.html`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/performance/TtcPerformanceParserTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/performance/TtcPerformanceClientTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/performance/TtcPerformanceServiceTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/performance/PerformanceControllerTest.java`

- [ ] **Step 1: Add jsoup dependency**

Modify `backend/pom.xml` dependencies:

```xml
        <dependency>
            <groupId>org.jsoup</groupId>
            <artifactId>jsoup</artifactId>
            <version>1.18.3</version>
        </dependency>
```

Run:

```bash
mvn -f backend/pom.xml -DskipTests compile
```

Expected: compile succeeds. If Maven cannot download `jsoup` due to network restrictions, report the exact failure and ask the user whether to approve dependency download.

- [ ] **Step 2: Add performance properties**

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceProperties.java`:

```java
package com.calebhabesh.linewatch.performance;

import java.net.URI;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.performance.ttc")
public class TtcPerformanceProperties {
    private boolean enabled = true;
    private URI url = URI.create("https://www.ttc.ca/");
    private Duration connectTimeout = Duration.ofSeconds(3);
    private Duration readTimeout = Duration.ofSeconds(8);
    private Duration maxAge = Duration.ofHours(24);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public URI getUrl() { return url; }
    public void setUrl(URI url) { this.url = url; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
    public Duration getMaxAge() { return maxAge; }
    public void setMaxAge(Duration maxAge) { this.maxAge = maxAge; }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceConfiguration.java` to enable these properties:

```java
package com.calebhabesh.linewatch.performance;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(TtcPerformanceProperties.class)
public class TtcPerformanceConfiguration {}
```

Modify `backend/src/main/resources/application.yml`:

```yaml
linewatch:
  performance:
    ttc:
      enabled: ${LINEWATCH_PERFORMANCE_TTC_ENABLED:true}
      url: ${LINEWATCH_PERFORMANCE_TTC_URL:https://www.ttc.ca/}
      connect-timeout: ${LINEWATCH_PERFORMANCE_TTC_CONNECT_TIMEOUT:PT3S}
      read-timeout: ${LINEWATCH_PERFORMANCE_TTC_READ_TIMEOUT:PT8S}
      max-age: ${LINEWATCH_PERFORMANCE_TTC_MAX_AGE:PT24H}
```

Keep the existing `linewatch.auth` and `linewatch.ingestion` blocks; merge this into the existing `linewatch` tree rather than duplicating the top-level key.

- [ ] **Step 3: Define response records**

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceResponses.java`:

```java
package com.calebhabesh.linewatch.performance;

import java.time.OffsetDateTime;
import java.util.List;

public final class TtcPerformanceResponses {
    private TtcPerformanceResponses() {}

    public record SnapshotResponse(
        String status,
        String source,
        String sourceUrl,
        String title,
        String updatedLabel,
        OffsetDateTime fetchedAt,
        boolean stale,
        String message,
        List<MetricResponse> metrics
    ) {}

    public record MetricResponse(
        String id,
        String label,
        String category,
        Integer percentage,
        String valueLabel,
        String note
    ) {}
}
```

Status values:

- `available`
- `unavailable`
- `disabled`

Category values:

- `subway`
- `surface`
- `accessibility`
- `other`

- [ ] **Step 4: Create TTC homepage fixture**

Create `backend/src/test/resources/fixtures/ttc-performance-homepage.html`:

```html
<!doctype html>
<html lang="en">
  <body>
    <section id="performance">
      <h2>On-time performance and elevator/escalator status</h2>
      <p>Last updated: June 7, 2026 7:00 AM</p>
      <ul>
        <li>Line 1: 94%</li>
        <li>Line 2: 91%</li>
        <li>Line 4: 98%</li>
        <li>Bus: 87%</li>
        <li>Streetcar: 82%</li>
        <li>Wheel-Trans: 96%</li>
        <li>Elevators: 99%</li>
        <li>Escalators: 97%</li>
      </ul>
      <p>Line 5 and Line 6 on-time performance will be added later.</p>
    </section>
  </body>
</html>
```

- [ ] **Step 5: Write failing parser test**

Create `backend/src/test/java/com/calebhabesh/linewatch/performance/TtcPerformanceParserTest.java`:

```java
package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class TtcPerformanceParserTest {
    private final TtcPerformanceParser parser = new TtcPerformanceParser();

    @Test
    void parsesOfficialHomepagePerformanceBlock() throws Exception {
        String html = new String(
            getClass().getResourceAsStream("/fixtures/ttc-performance-homepage.html").readAllBytes(),
            StandardCharsets.UTF_8
        );

        TtcPerformanceResponses.SnapshotResponse snapshot = parser.parse(
            html,
            "https://www.ttc.ca/",
            java.time.OffsetDateTime.parse("2026-06-07T12:00:00Z")
        );

        assertThat(snapshot.status()).isEqualTo("available");
        assertThat(snapshot.source()).isEqualTo("TTC.ca");
        assertThat(snapshot.title()).isEqualTo("On-time performance and elevator/escalator status");
        assertThat(snapshot.updatedLabel()).isEqualTo("June 7, 2026 7:00 AM");
        assertThat(snapshot.metrics()).extracting("id")
            .containsExactly("line-1", "line-2", "line-4", "bus", "streetcar", "wheel-trans", "elevators", "escalators");
        assertThat(snapshot.metrics()).filteredOn(metric -> metric.id().equals("line-1"))
            .singleElement()
            .satisfies(metric -> {
                assertThat(metric.category()).isEqualTo("subway");
                assertThat(metric.percentage()).isEqualTo(94);
                assertThat(metric.valueLabel()).isEqualTo("94%");
            });
        assertThat(snapshot.metrics()).filteredOn(metric -> metric.id().equals("elevators"))
            .singleElement()
            .satisfies(metric -> assertThat(metric.category()).isEqualTo("accessibility"));
    }

    @Test
    void rejectsHomepageWithoutPerformanceBlock() {
        assertThatThrownBy(() -> parser.parse("<html><body>No metrics</body></html>", "https://www.ttc.ca/", java.time.OffsetDateTime.now()))
            .isInstanceOf(TtcPerformanceParser.TtcPerformanceParseException.class)
            .hasMessageContaining("performance");
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcPerformanceParserTest test
```

Expected: fails because `TtcPerformanceParser` does not exist.

- [ ] **Step 6: Implement parser**

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceParser.java`:

```java
package com.calebhabesh.linewatch.performance;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

@Component
public class TtcPerformanceParser {
    private static final String TITLE = "On-time performance and elevator/escalator status";
    private static final Pattern UPDATED_PATTERN = Pattern.compile("(?i)last\\s+updated\\s*:?\\s*([^\\n]+)");
    private static final Pattern METRIC_PATTERN = Pattern.compile("(?i)\\b(Line\\s+[124]|Bus|Streetcar|Wheel-Trans|Elevators|Escalators)\\b\\s*:?\\s*(\\d{1,3})\\s*%");

    public TtcPerformanceResponses.SnapshotResponse parse(String html, String sourceUrl, OffsetDateTime fetchedAt) {
        Document document = Jsoup.parse(html == null ? "" : html);
        Element section = findPerformanceSection(document);
        String text = section.text().replace('\u00a0', ' ').replaceAll("\\s+", " ").trim();
        String updatedLabel = updatedLabel(text);
        List<TtcPerformanceResponses.MetricResponse> metrics = metrics(text);
        if (metrics.isEmpty()) {
            throw new TtcPerformanceParseException("TTC performance block did not contain percentage metrics");
        }
        return new TtcPerformanceResponses.SnapshotResponse(
            "available",
            "TTC.ca",
            sourceUrl,
            TITLE,
            updatedLabel,
            fetchedAt,
            false,
            "Official TTC performance metrics loaded from TTC.ca.",
            metrics
        );
    }

    private Element findPerformanceSection(Document document) {
        Element heading = document.select("h1, h2, h3, h4, h5, h6").stream()
            .filter(element -> normalize(element.text()).contains(normalize(TITLE)))
            .findFirst()
            .orElseThrow(() -> new TtcPerformanceParseException("TTC performance heading was not found"));
        Element section = heading.closest("section");
        if (section != null) {
            return section;
        }
        Element parent = heading.parent();
        if (parent == null) {
            throw new TtcPerformanceParseException("TTC performance section was not found");
        }
        return parent;
    }

    private String updatedLabel(String text) {
        Matcher matcher = UPDATED_PATTERN.matcher(text);
        if (!matcher.find()) {
            return "Not provided";
        }
        return matcher.group(1).trim();
    }

    private List<TtcPerformanceResponses.MetricResponse> metrics(String text) {
        Map<String, TtcPerformanceResponses.MetricResponse> byId = new LinkedHashMap<>();
        Matcher matcher = METRIC_PATTERN.matcher(text);
        while (matcher.find()) {
            String label = canonicalLabel(matcher.group(1));
            int percentage = Integer.parseInt(matcher.group(2));
            if (percentage < 0 || percentage > 100) {
                continue;
            }
            String id = idFor(label);
            byId.putIfAbsent(id, new TtcPerformanceResponses.MetricResponse(
                id,
                label,
                categoryFor(id),
                percentage,
                percentage + "%",
                null
            ));
        }
        return List.copyOf(new ArrayList<>(byId.values()));
    }

    private String canonicalLabel(String raw) {
        String normalized = raw.trim().replaceAll("\\s+", " ");
        if (normalized.matches("(?i)line\\s+[124]")) {
            return "Line " + normalized.replaceAll("(?i)line\\s+", "");
        }
        if (normalized.equalsIgnoreCase("bus")) return "Bus";
        if (normalized.equalsIgnoreCase("streetcar")) return "Streetcar";
        if (normalized.equalsIgnoreCase("wheel-trans")) return "Wheel-Trans";
        if (normalized.equalsIgnoreCase("elevators")) return "Elevators";
        if (normalized.equalsIgnoreCase("escalators")) return "Escalators";
        return normalized;
    }

    private String idFor(String label) {
        return switch (label.toLowerCase(Locale.ROOT)) {
            case "line 1" -> "line-1";
            case "line 2" -> "line-2";
            case "line 4" -> "line-4";
            case "bus" -> "bus";
            case "streetcar" -> "streetcar";
            case "wheel-trans" -> "wheel-trans";
            case "elevators" -> "elevators";
            case "escalators" -> "escalators";
            default -> label.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        };
    }

    private String categoryFor(String id) {
        if (id.startsWith("line-")) return "subway";
        if (id.equals("bus") || id.equals("streetcar") || id.equals("wheel-trans")) return "surface";
        if (id.equals("elevators") || id.equals("escalators")) return "accessibility";
        return "other";
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    public static class TtcPerformanceParseException extends RuntimeException {
        public TtcPerformanceParseException(String message) {
            super(message);
        }
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcPerformanceParserTest test
```

Expected: parser tests pass.

- [ ] **Step 7: Write client test**

Create `backend/src/test/java/com/calebhabesh/linewatch/performance/TtcPerformanceClientTest.java`:

```java
package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class TtcPerformanceClientTest {
    private MockRestServiceServer server;
    private TtcPerformanceClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        TtcPerformanceProperties properties = new TtcPerformanceProperties();
        properties.setUrl(URI.create("https://www.ttc.ca/"));
        client = new TtcPerformanceClient(
            builder.build(),
            properties,
            new TtcPerformanceParser(),
            Clock.fixed(Instant.parse("2026-06-07T12:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void fetchesAndParsesHomepageMetrics() throws Exception {
        String html = new String(
            getClass().getResourceAsStream("/fixtures/ttc-performance-homepage.html").readAllBytes(),
            StandardCharsets.UTF_8
        );
        server.expect(requestTo("https://www.ttc.ca/"))
            .andRespond(withSuccess(html, MediaType.TEXT_HTML));

        TtcPerformanceResponses.SnapshotResponse snapshot = client.fetch();

        assertThat(snapshot.status()).isEqualTo("available");
        assertThat(snapshot.metrics()).hasSize(8);
        assertThat(snapshot.fetchedAt()).isEqualTo("2026-06-07T12:00Z");
        server.verify();
    }

    @Test
    void wrapsUpstreamFailures() {
        server.expect(requestTo("https://www.ttc.ca/"))
            .andRespond(withServerError());

        assertThatThrownBy(client::fetch)
            .isInstanceOf(TtcPerformanceClient.TtcPerformanceClientException.class)
            .hasMessageContaining("TTC.ca performance metrics");
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcPerformanceClientTest test
```

Expected: fails because `TtcPerformanceClient` does not exist.

- [ ] **Step 8: Implement client**

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceClient.java`:

```java
package com.calebhabesh.linewatch.performance;

import java.time.Clock;
import java.time.OffsetDateTime;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class TtcPerformanceClient {
    private final RestClient ttcPerformanceRestClient;
    private final TtcPerformanceProperties properties;
    private final TtcPerformanceParser parser;
    private final Clock clock;

    public TtcPerformanceClient(
        RestClient ttcPerformanceRestClient,
        TtcPerformanceProperties properties,
        TtcPerformanceParser parser,
        Clock clock
    ) {
        this.ttcPerformanceRestClient = ttcPerformanceRestClient;
        this.properties = properties;
        this.parser = parser;
        this.clock = clock;
    }

    public TtcPerformanceResponses.SnapshotResponse fetch() {
        try {
            String body = ttcPerformanceRestClient.get()
                .uri(properties.getUrl())
                .retrieve()
                .body(String.class);
            return parser.parse(body, properties.getUrl().toString(), OffsetDateTime.now(clock));
        } catch (TtcPerformanceClientException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", exception);
        }
    }

    public static class TtcPerformanceClientException extends RuntimeException {
        public TtcPerformanceClientException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
```

Add a `RestClient` bean by replacing `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceConfiguration.java` with:

```java
package com.calebhabesh.linewatch.performance;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(TtcPerformanceProperties.class)
public class TtcPerformanceConfiguration {
    @Bean
    RestClient ttcPerformanceRestClient(
        RestClient.Builder builder,
        TtcPerformanceProperties properties
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) properties.getConnectTimeout().toMillis());
        factory.setReadTimeout((int) properties.getReadTimeout().toMillis());
        return builder.requestFactory(factory).build();
    }
}
```

Do not define another `Clock` bean here; `AlertIngestionConfiguration` already provides one.

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcPerformanceClientTest,TtcPerformanceParserTest test
```

Expected: tests pass.

- [ ] **Step 9: Add service and controller tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/performance/TtcPerformanceServiceTest.java`:

```java
package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class TtcPerformanceServiceTest {
    private final TtcPerformanceClient client = mock(TtcPerformanceClient.class);
    private final TtcPerformanceProperties properties = new TtcPerformanceProperties();
    private final TtcPerformanceService service = new TtcPerformanceService(client, properties);

    @Test
    void returnsOfficialSnapshotWhenEnabled() {
        when(client.fetch()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "June 7, 2026 7:00 AM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-1", "Line 1", "subway", 94, "94%", null))
        ));

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("available");
        assertThat(response.metrics()).singleElement().satisfies(metric -> assertThat(metric.id()).isEqualTo("line-1"));
    }

    @Test
    void returnsDisabledSnapshotWhenPropertyDisabled() {
        properties.setEnabled(false);

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("disabled");
        assertThat(response.metrics()).isEmpty();
        assertThat(response.message()).contains("disabled");
    }

    @Test
    void returnsUnavailableSnapshotWhenFetchFails() {
        when(client.fetch()).thenThrow(new TtcPerformanceClient.TtcPerformanceClientException("Unable to fetch TTC.ca performance metrics", new RuntimeException("boom")));

        TtcPerformanceResponses.SnapshotResponse response = service.current();

        assertThat(response.status()).isEqualTo("unavailable");
        assertThat(response.metrics()).isEmpty();
        assertThat(response.message()).contains("temporarily unavailable");
    }
}
```

Create `backend/src/test/java/com/calebhabesh/linewatch/performance/PerformanceControllerTest.java`:

```java
package com.calebhabesh.linewatch.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class PerformanceControllerTest {
    private final TtcPerformanceService service = mock(TtcPerformanceService.class);
    private final PerformanceController controller = new PerformanceController(service);

    @Test
    void returnsCurrentOfficialPerformanceSnapshot() {
        when(service.current()).thenReturn(new TtcPerformanceResponses.SnapshotResponse(
            "available", "TTC.ca", "https://www.ttc.ca/", "On-time performance and elevator/escalator status",
            "June 7, 2026 7:00 AM", OffsetDateTime.parse("2026-06-07T12:00:00Z"), false,
            "Official TTC performance metrics loaded from TTC.ca.",
            List.of(new TtcPerformanceResponses.MetricResponse("line-2", "Line 2", "subway", 91, "91%", null))
        ));

        TtcPerformanceResponses.SnapshotResponse response = controller.performance();

        assertThat(response.status()).isEqualTo("available");
        assertThat(response.metrics()).singleElement().satisfies(metric -> assertThat(metric.valueLabel()).isEqualTo("91%"));
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcPerformanceServiceTest,PerformanceControllerTest test
```

Expected: fails because service and controller do not exist.

- [ ] **Step 10: Implement service and controller**

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/TtcPerformanceService.java`:

```java
package com.calebhabesh.linewatch.performance;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class TtcPerformanceService {
    private final TtcPerformanceClient client;
    private final TtcPerformanceProperties properties;

    public TtcPerformanceService(TtcPerformanceClient client, TtcPerformanceProperties properties) {
        this.client = client;
        this.properties = properties;
    }

    public TtcPerformanceResponses.SnapshotResponse current() {
        if (!properties.isEnabled()) {
            return new TtcPerformanceResponses.SnapshotResponse(
                "disabled",
                "TTC.ca",
                properties.getUrl().toString(),
                "On-time performance and elevator/escalator status",
                "Disabled",
                null,
                true,
                "Official TTC performance metrics are disabled in this environment.",
                List.of()
            );
        }

        try {
            return client.fetch();
        } catch (RuntimeException exception) {
            return new TtcPerformanceResponses.SnapshotResponse(
                "unavailable",
                "TTC.ca",
                properties.getUrl().toString(),
                "On-time performance and elevator/escalator status",
                "Unavailable",
                null,
                true,
                "Official TTC performance metrics are temporarily unavailable.",
                List.of()
            );
        }
    }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/performance/PerformanceController.java`:

```java
package com.calebhabesh.linewatch.performance;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/performance")
public class PerformanceController {
    private final TtcPerformanceService service;

    public PerformanceController(TtcPerformanceService service) {
        this.service = service;
    }

    @GetMapping
    public TtcPerformanceResponses.SnapshotResponse performance() {
        return service.current();
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=TtcPerformanceParserTest,TtcPerformanceClientTest,TtcPerformanceServiceTest,PerformanceControllerTest test
```

Expected: all performance tests pass.

- [ ] **Step 11: Run backend tests and commit**

Run:

```bash
mvn -f backend/pom.xml test
git add backend/pom.xml backend/src/main/resources/application.yml backend/src/main/java/com/calebhabesh/linewatch/performance backend/src/test/java/com/calebhabesh/linewatch/performance backend/src/test/resources/fixtures/ttc-performance-homepage.html
git diff --cached --name-status
git commit -m "feat: expose official TTC performance metrics"
```

Expected: Maven tests pass and commit includes only official metrics files.

---

## Task 2: Frontend Official Performance Panel

**Files:**
- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/app/DataContext.tsx`
- Modify: `frontend/src/app/dashboard-data.ts`
- Modify: `frontend/src/components/ReliabilityPanel.tsx`
- Modify: `frontend/tests/linewatch-data.test.mjs`
- Modify or create: `frontend/tests/dashboard-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add frontend performance types and fallback data**

In `frontend/src/app/linewatch-data.ts`, add:

```ts
export type TtcPerformanceMetric = {
  id: string;
  label: string;
  category: "subway" | "surface" | "accessibility" | "other";
  percentage: number | null;
  valueLabel: string;
  note?: string | null;
};

export type TtcPerformanceSnapshot = {
  status: "available" | "unavailable" | "disabled";
  source: string;
  sourceUrl: string;
  title: string;
  updatedLabel: string;
  fetchedAt?: string | null;
  stale: boolean;
  message: string;
  metrics: TtcPerformanceMetric[];
};

export const ttcPerformanceSnapshot: TtcPerformanceSnapshot = {
  status: "unavailable",
  source: "TTC.ca",
  sourceUrl: "https://www.ttc.ca/",
  title: "On-time performance and elevator/escalator status",
  updatedLabel: "Fixture mode",
  fetchedAt: null,
  stale: true,
  message: "Official TTC performance metrics are unavailable in fixture mode.",
  metrics: [],
};
```

Keep `reliabilitySummaries` until the component migration is complete, then remove it only if no tests/imports use it.

- [ ] **Step 2: Extend `DashboardData`**

In `frontend/src/app/DataContext.tsx`, import `TtcPerformanceSnapshot` and add:

```ts
  ttcPerformance: TtcPerformanceSnapshot;
```

Remove `reliabilitySummaries` from `DashboardData` after `ReliabilityPanel` no longer uses it.

- [ ] **Step 3: Fetch `/api/performance` without forcing full dashboard fallback**

Modify `frontend/src/app/dashboard-data.ts`:

- Import `ttcPerformanceSnapshot as fallbackPerformance`.
- Import `type TtcPerformanceSnapshot`.
- Add `fetchSafe<TtcPerformanceSnapshot>("/api/performance")` to the `Promise.all`.
- Do not include performance failure in `useFallback`.
- Use `ttcPerformance: performanceData ?? fallbackPerformance`.

Expected shape:

```ts
export async function loadDashboardInitialData(): Promise<DashboardData> {
  const [mapData, statusData, activeAlerts, delays, reducedSpeedZones, plannedClosures, performanceData] = await Promise.all([
    fetchSafe<MapApiResponse>("/api/map"),
    fetchSafe<StatusApiResponse>("/api/status"),
    fetchSafe<ActiveAlert[]>("/api/alerts"),
    fetchSafe<DelayAlert[]>("/api/alerts?type=delay"),
    fetchSafe<ReducedSpeedZone[]>("/api/alerts?type=slowdown"),
    fetchSafe<PlannedClosure[]>("/api/alerts?type=planned"),
    fetchSafe<TtcPerformanceSnapshot>("/api/performance")
  ]);

  const useFallback = !mapData || !statusData || !activeAlerts || !delays || !reducedSpeedZones || !plannedClosures;

  const initialData: DashboardData = {
    dataSource: useFallback ? "fallback" : "backend",
    networkSegments: useFallback ? fallbackSegments : mapData.segments,
    stations: useFallback ? fallbackStations : mapData.stations,
    lineStatuses: useFallback ? fallbackStatuses : statusData.lines,
    generatedAt: useFallback ? fallbackGeneratedAt : statusData.generatedAt,
    activeAlerts: useFallback ? fallbackAlerts : activeAlerts,
    delays: useFallback ? fallbackDelays : delays,
    reducedSpeedZones: useFallback ? fallbackReducedSpeedZones : reducedSpeedZones,
    plannedClosures: useFallback ? fallbackClosures : plannedClosures,
    stationNodeImpacts: useFallback ? fallbackStationNodeImpacts : mapData.stationNodeImpacts,
    commuteImpacts,
    ttcPerformance: performanceData ?? fallbackPerformance,
    ingestionHealth,
    mapAsset
  };
```

- [ ] **Step 4: Write source-level panel test**

Modify `frontend/tests/linewatch-data.test.mjs` to assert fixture honesty:

```js
it("labels TTC performance fallback as unavailable official metrics", () => {
  assert.equal(ttcPerformanceSnapshot.status, "unavailable");
  assert.equal(ttcPerformanceSnapshot.source, "TTC.ca");
  assert.equal(ttcPerformanceSnapshot.metrics.length, 0);
  assert.match(ttcPerformanceSnapshot.message, /unavailable/i);
});
```

Import `ttcPerformanceSnapshot` at the top.

Create or modify a source test for `ReliabilityPanel.tsx`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/ReliabilityPanel.tsx", import.meta.url), "utf8");

describe("official TTC performance panel source", () => {
  it("renders official TTC performance metrics instead of fake reliability scores", () => {
    assert.match(source, /ttcPerformance/);
    assert.match(source, /Official TTC Performance/);
    assert.match(source, /Source:/);
    assert.doesNotMatch(source, /Reliability Analytics \\(7-Day\\)/);
    assert.doesNotMatch(source, /incidents7d/);
    assert.doesNotMatch(source, /median delay/);
  });
});
```

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: fails until `ReliabilityPanel` is updated.

- [ ] **Step 5: Update `ReliabilityPanel` rendering**

Modify `frontend/src/components/ReliabilityPanel.tsx`:

- Rename the visible heading to `Official TTC Performance`.
- Read `const { ttcPerformance } = useDashboardData();`
- If `ttcPerformance.metrics.length === 0`, render one clear unavailable row with `ttcPerformance.message`.
- Otherwise render each metric with `label`, `category`, and `valueLabel`.
- Use a progress bar width only when `percentage !== null`.
- Show `Source: TTC.ca` and `Updated: {ttcPerformance.updatedLabel}`.

Implementation skeleton:

```tsx
export function ReliabilityPanel({ onBack, onClose }: ReliabilityProps = {}) {
  const { ttcPerformance } = useDashboardData();
  const metrics = ttcPerformance.metrics;

  return (
    <section className="analytics-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl" style={{ WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }}>
      <div className="panel-heading @container border-b border-black/10 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-3 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0" aria-label="Back">
              <ChevronLeft size={28} className="text-slate-700 dark:text-slate-300" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="text-[clamp(10px,3.5cqw,18px)] font-bold text-slate-900 dark:text-white flex items-center gap-1 sm:gap-2 whitespace-nowrap">
              <BarChart3 className="w-[16px] h-[16px] sm:w-[22px] sm:h-[22px] text-purple-500 shrink-0" />
              <span>Official TTC Performance</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Source: {ttcPerformance.source} · Updated: {ttcPerformance.updatedLabel}
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-3 sm:p-3.5 mr-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center" aria-label="Close">
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-300" />
          </button>
        )}
      </div>
      <div className="reliability-list min-w-0 p-3 flex flex-col gap-2">
        {metrics.length === 0 ? (
          <div className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5">
            <strong className="text-sm font-bold text-slate-800 dark:text-white">Official metrics unavailable</strong>
            <p className="text-xs text-slate-500 dark:text-slate-400">{ttcPerformance.message}</p>
          </div>
        ) : metrics.map((item) => (
          <div key={item.id} className="reliability-row min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex flex-col justify-between gap-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="reliability-copy min-w-0">
                <strong className="text-sm font-bold text-slate-800 dark:text-white whitespace-normal break-words">{item.label}</strong>
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-normal break-words">{categoryLabel(item.category)}</span>
              </div>
              <strong className="text-sm text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">{item.valueLabel}</strong>
            </div>
            {item.percentage !== null ? (
              <div className="score-track bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-amber-500 to-green-500 h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.percentage))}%` }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function categoryLabel(category: string) {
  switch (category) {
    case "subway":
      return "Subway on-time performance";
    case "surface":
      return "Surface service on-time performance";
    case "accessibility":
      return "Elevator/escalator availability";
    default:
      return "TTC performance metric";
  }
}
```

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: both pass after imports/types are aligned.

- [ ] **Step 6: Update smoke API stub**

Modify `frontend/tests/smoke/api-stub.mjs` so `GET /api/performance` returns:

```js
{
  status: "available",
  source: "TTC.ca",
  sourceUrl: "https://www.ttc.ca/",
  title: "On-time performance and elevator/escalator status",
  updatedLabel: "June 7, 2026 7:00 AM",
  fetchedAt: "2026-06-07T12:00:00Z",
  stale: false,
  message: "Official TTC performance metrics loaded from TTC.ca.",
  metrics: [
    { id: "line-1", label: "Line 1", category: "subway", percentage: 94, valueLabel: "94%", note: null },
    { id: "line-2", label: "Line 2", category: "subway", percentage: 91, valueLabel: "91%", note: null },
    { id: "elevators", label: "Elevators", category: "accessibility", percentage: 99, valueLabel: "99%", note: null }
  ]
}
```

- [ ] **Step 7: Add smoke assertion**

Modify `frontend/tests/smoke/dashboard.spec.ts` in an existing analytics/menu test or add a focused test:

```ts
test("shows official TTC performance metrics from backend", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("menuitem", { name: /analytics/i }).click();
  await expect(page.getByText("Official TTC Performance")).toBeVisible();
  await expect(page.getByText("Source: TTC.ca")).toBeVisible();
  await expect(page.getByText("Line 1")).toBeVisible();
  await expect(page.getByText("94%")).toBeVisible();
  await expect(page.getByText("Elevators")).toBeVisible();
});
```

Use the actual menu item accessible name in the current code if it differs. Do not weaken the assertion to only look for generic `Performance`.

- [ ] **Step 8: Run frontend verification and commit**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

For substantial UI changes, also run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: all commands pass. If Playwright Chromium is missing, run `npm --prefix frontend run test:smoke:install` only if the environment allows browser installation.

Commit:

```bash
git add frontend/src/app/linewatch-data.ts frontend/src/app/DataContext.tsx frontend/src/app/dashboard-data.ts frontend/src/components/ReliabilityPanel.tsx frontend/tests frontend/tests/smoke/api-stub.mjs
git diff --cached --name-status
git commit -m "feat: show official TTC performance metrics"
```

---

## Task 3: Redis Dashboard Cache

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheService.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/cache/DashboardCacheServiceTest.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionFreshness.java`

- [ ] **Step 1: Add cache properties**

Create `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheProperties.java`:

```java
package com.calebhabesh.linewatch.cache;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("linewatch.cache.dashboard")
public class DashboardCacheProperties {
    private boolean enabled = true;
    private Duration statusTtl = Duration.ofSeconds(30);
    private Duration mapTtl = Duration.ofSeconds(30);
    private Duration alertsTtl = Duration.ofSeconds(30);
    private Duration ingestionHealthTtl = Duration.ofSeconds(15);
    private Duration performanceTtl = Duration.ofMinutes(30);

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Duration getStatusTtl() { return statusTtl; }
    public void setStatusTtl(Duration statusTtl) { this.statusTtl = statusTtl; }
    public Duration getMapTtl() { return mapTtl; }
    public void setMapTtl(Duration mapTtl) { this.mapTtl = mapTtl; }
    public Duration getAlertsTtl() { return alertsTtl; }
    public void setAlertsTtl(Duration alertsTtl) { this.alertsTtl = alertsTtl; }
    public Duration getIngestionHealthTtl() { return ingestionHealthTtl; }
    public void setIngestionHealthTtl(Duration ingestionHealthTtl) { this.ingestionHealthTtl = ingestionHealthTtl; }
    public Duration getPerformanceTtl() { return performanceTtl; }
    public void setPerformanceTtl(Duration performanceTtl) { this.performanceTtl = performanceTtl; }
}
```

Create `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheConfiguration.java`:

```java
package com.calebhabesh.linewatch.cache;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(DashboardCacheProperties.class)
public class DashboardCacheConfiguration {}
```

Modify `backend/src/main/resources/application.yml` under `linewatch`:

```yaml
  cache:
    dashboard:
      enabled: ${LINEWATCH_CACHE_DASHBOARD_ENABLED:true}
      status-ttl: ${LINEWATCH_CACHE_DASHBOARD_STATUS_TTL:PT30S}
      map-ttl: ${LINEWATCH_CACHE_DASHBOARD_MAP_TTL:PT30S}
      alerts-ttl: ${LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL:PT30S}
      ingestion-health-ttl: ${LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL:PT15S}
      performance-ttl: ${LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL:PT30M}
```

- [ ] **Step 2: Add freshness remaining-time test**

Modify or create `backend/src/test/java/com/calebhabesh/linewatch/ingestion/IngestionFreshnessTest.java` test:

```java
@Test
void reportsRemainingDashboardFreshness() {
    AlertIngestionProperties properties = new AlertIngestionProperties();
    properties.setMaxDashboardAge(Duration.ofMinutes(10));
    IngestionRunStore store = mock(IngestionRunStore.class);
    Clock clock = Clock.fixed(Instant.parse("2026-06-07T12:05:00Z"), ZoneOffset.UTC);
    IngestionFreshness freshness = new IngestionFreshness(store, properties, clock);
    IngestionRunSnapshot run = new IngestionRunSnapshot(
        1L, "success",
        OffsetDateTime.parse("2026-06-07T11:59:00Z"),
        OffsetDateTime.parse("2026-06-07T12:00:00Z"),
        1, 1, 1, 0,
        OffsetDateTime.parse("2026-06-07T11:59:00Z"),
        null
    );

    assertThat(freshness.remainingFreshness(Optional.of(run))).hasValue(Duration.ofMinutes(5));
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=IngestionFreshnessTest test
```

Expected: fails because `remainingFreshness` does not exist.

- [ ] **Step 3: Implement `remainingFreshness`**

Modify `backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionFreshness.java`:

```java
public Optional<Duration> remainingFreshness(Optional<IngestionRunSnapshot> latestRun) {
    if (latestRun.isEmpty()) {
        return Optional.empty();
    }
    IngestionRunSnapshot run = latestRun.orElseThrow();
    if (!"success".equalsIgnoreCase(run.status()) || run.completedAt() == null) {
        return Optional.empty();
    }
    Duration maxAge = properties.getMaxDashboardAge();
    if (maxAge == null || maxAge.isNegative() || maxAge.isZero()) {
        return Optional.of(Duration.ofMinutes(5));
    }
    OffsetDateTime expiresAt = run.completedAt().plus(maxAge);
    Duration remaining = Duration.between(OffsetDateTime.now(clock), expiresAt);
    if (remaining.isNegative() || remaining.isZero()) {
        return Optional.empty();
    }
    return Optional.of(remaining);
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=IngestionFreshnessTest test
```

Expected: test passes.

- [ ] **Step 4: Write cache service test**

Create `backend/src/test/java/com/calebhabesh/linewatch/cache/DashboardCacheServiceTest.java`:

```java
package com.calebhabesh.linewatch.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

class DashboardCacheServiceTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final ValueOperations<String, String> values = mock(ValueOperations.class);
    private final DashboardCacheProperties properties = new DashboardCacheProperties();
    private final DashboardCacheService cache = new DashboardCacheService(redis, new ObjectMapper().findAndRegisterModules(), properties);

    @Test
    void returnsCachedValueOnHit() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn("[\"cached\"]");

        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("cached");
        verify(values, never()).set(eq("linewatch:dashboard:v1:test"), any(String.class), any(Duration.class));
    }

    @Test
    void computesAndStoresOnMiss() {
        when(redis.opsForValue()).thenReturn(values);
        when(values.get("linewatch:dashboard:v1:test")).thenReturn(null);

        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("computed");
        verify(values).set(eq("linewatch:dashboard:v1:test"), eq("[\"computed\"]"), eq(Duration.ofSeconds(30)));
    }

    @Test
    void failsOpenWhenRedisIsUnavailable() {
        when(redis.opsForValue()).thenThrow(new RedisConnectionFailureException("down"));
        AtomicInteger calls = new AtomicInteger();

        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> {
                calls.incrementAndGet();
                return List.of("computed");
            }
        );

        assertThat(result).containsExactly("computed");
        assertThat(calls).hasValue(1);
    }

    @Test
    void bypassesRedisWhenDisabled() {
        properties.setEnabled(false);
        List<String> result = cache.getOrCompute(
            "test",
            new TypeReference<List<String>>() {},
            Duration.ofSeconds(30),
            () -> List.of("computed")
        );

        assertThat(result).containsExactly("computed");
        verify(redis, never()).opsForValue();
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=DashboardCacheServiceTest test
```

Expected: fails because `DashboardCacheService` does not exist.

- [ ] **Step 5: Implement cache service**

Create `backend/src/main/java/com/calebhabesh/linewatch/cache/DashboardCacheService.java`:

```java
package com.calebhabesh.linewatch.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Set;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class DashboardCacheService {
    private static final Logger log = LoggerFactory.getLogger(DashboardCacheService.class);
    private static final String PREFIX = "linewatch:dashboard:v1:";

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final DashboardCacheProperties properties;

    public DashboardCacheService(
        StringRedisTemplate redis,
        ObjectMapper objectMapper,
        DashboardCacheProperties properties
    ) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public <T> T getOrCompute(String key, TypeReference<T> type, Duration ttl, Supplier<T> supplier) {
        if (!properties.isEnabled() || ttl == null || ttl.isNegative() || ttl.isZero()) {
            return supplier.get();
        }
        String redisKey = PREFIX + key;
        try {
            String cached = redis.opsForValue().get(redisKey);
            if (cached != null && !cached.isBlank()) {
                return objectMapper.readValue(cached, type);
            }
        } catch (Exception exception) {
            log.warn("Dashboard cache read failed for key {}", redisKey, exception);
            return supplier.get();
        }

        T computed = supplier.get();
        try {
            redis.opsForValue().set(redisKey, objectMapper.writeValueAsString(computed), ttl);
        } catch (Exception exception) {
            log.warn("Dashboard cache write failed for key {}", redisKey, exception);
        }
        return computed;
    }

    public void evictDashboard() {
        if (!properties.isEnabled()) {
            return;
        }
        try {
            Set<String> keys = redis.keys(PREFIX + "*");
            if (keys != null && !keys.isEmpty()) {
                redis.delete(keys);
            }
        } catch (Exception exception) {
            log.warn("Dashboard cache eviction failed", exception);
        }
    }
}
```

Run:

```bash
mvn -f backend/pom.xml -Dtest=DashboardCacheServiceTest,IngestionFreshnessTest test
```

Expected: tests pass.

- [ ] **Step 6: Commit cache primitives**

Run:

```bash
mvn -f backend/pom.xml test
git add backend/src/main/java/com/calebhabesh/linewatch/cache backend/src/test/java/com/calebhabesh/linewatch/cache backend/src/main/java/com/calebhabesh/linewatch/ingestion/IngestionFreshness.java backend/src/test/java/com/calebhabesh/linewatch/ingestion/IngestionFreshnessTest.java backend/src/main/resources/application.yml
git diff --cached --name-status
git commit -m "feat: add dashboard redis cache service"
```

Expected: backend tests pass.

---

## Task 4: Integrate Redis Cache Into Dashboard Endpoints

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/health/IngestionHealthController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/performance/PerformanceController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionService.java`
- Modify related controller tests.

- [ ] **Step 1: Cache `PerformanceController`**

Modify constructor:

```java
private final TtcPerformanceService service;
private final DashboardCacheService cache;
private final DashboardCacheProperties cacheProperties;

public PerformanceController(
    TtcPerformanceService service,
    DashboardCacheService cache,
    DashboardCacheProperties cacheProperties
) {
    this.service = service;
    this.cache = cache;
    this.cacheProperties = cacheProperties;
}
```

Modify endpoint:

```java
@GetMapping
public TtcPerformanceResponses.SnapshotResponse performance() {
    return cache.getOrCompute(
        "performance",
        new TypeReference<TtcPerformanceResponses.SnapshotResponse>() {},
        cacheProperties.getPerformanceTtl(),
        service::current
    );
}
```

Add imports:

```java
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
```

Update `PerformanceControllerTest` with mocked cache:

```java
private final DashboardCacheService cache = mock(DashboardCacheService.class);
private final DashboardCacheProperties cacheProperties = new DashboardCacheProperties();
private final PerformanceController controller = new PerformanceController(service, cache, cacheProperties);
```

Stub:

```java
when(cache.getOrCompute(any(), any(), any(), any())).thenAnswer(invocation -> {
    java.util.function.Supplier<?> supplier = invocation.getArgument(3);
    return supplier.get();
});
```

- [ ] **Step 2: Cache `StatusController` with freshness-bounded TTL**

Refactor current `getStatus()` body into `private StatusResponse buildStatus()`.

Inject:

```java
private final DashboardCacheService cache;
private final DashboardCacheProperties cacheProperties;
```

In `getStatus()`:

```java
@GetMapping
public StatusResponse getStatus() {
    Optional<IngestionRunSnapshot> latestRun = ingestionRunStore.findLatest();
    Duration ttl = ingestionFreshness.remainingFreshness(latestRun)
        .map(remaining -> remaining.compareTo(cacheProperties.getStatusTtl()) < 0 ? remaining : cacheProperties.getStatusTtl())
        .orElse(cacheProperties.getStatusTtl());
    return cache.getOrCompute(
        "status",
        new TypeReference<StatusResponse>() {},
        ttl,
        this::buildStatus
    );
}
```

Use the same `latestRun` lookup inside `buildStatus()` as the original method. This duplicates one cheap query on misses, but avoids changing status semantics.

Update `StatusControllerTest` to inject mocked cache and answer supplier as above.

- [ ] **Step 3: Cache `MapController` with freshness-bounded TTL**

Inject `DashboardCacheService`, `DashboardCacheProperties`, `IngestionFreshness`, and `IngestionRunStore`.

Refactor current `getMap()` body into `private MapResponse buildMap()`.

In `getMap()`:

```java
@GetMapping
public MapResponse getMap() {
    Duration ttl = ingestionFreshness.remainingFreshness(ingestionRunStore.findLatest())
        .map(remaining -> remaining.compareTo(cacheProperties.getMapTtl()) < 0 ? remaining : cacheProperties.getMapTtl())
        .orElse(cacheProperties.getMapTtl());
    return cache.getOrCompute(
        "map",
        new TypeReference<MapResponse>() {},
        ttl,
        this::buildMap
    );
}
```

Update `MapControllerTest` constructor arguments and cache supplier stubbing.

- [ ] **Step 4: Cache alert endpoint per type**

Modify `AlertController` to inject cache properties and service:

```java
private final AlertDashboardService dashboardService;
private final DashboardCacheService cache;
private final DashboardCacheProperties cacheProperties;

public AlertController(AlertDashboardService dashboardService, DashboardCacheService cache, DashboardCacheProperties cacheProperties) {
    this.dashboardService = dashboardService;
    this.cache = cache;
    this.cacheProperties = cacheProperties;
}
```

Change `getAlerts`:

```java
@GetMapping
public Object getAlerts(@RequestParam(required = false) String type) {
    if ("planned".equals(type)) {
        return cache.getOrCompute("alerts:planned", new TypeReference<java.util.List<AlertDashboardService.PlannedClosureDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::plannedClosures);
    }
    if ("delay".equals(type)) {
        return cache.getOrCompute("alerts:delay", new TypeReference<java.util.List<AlertDashboardService.DelayAlertDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::delays);
    }
    if ("slowdown".equals(type)) {
        return cache.getOrCompute("alerts:slowdown", new TypeReference<java.util.List<AlertDashboardService.ReducedSpeedZoneDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::reducedSpeedZones);
    }
    if ("raw".equals(type)) {
        return cache.getOrCompute("alerts:raw", new TypeReference<java.util.List<RawAlertDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::rawAlerts);
    }
    return cache.getOrCompute("alerts:active", new TypeReference<java.util.List<AlertDashboardService.ActiveAlertDto>>() {}, cacheProperties.getAlertsTtl(), dashboardService::activeAlerts);
}
```

Add these imports to `AlertController`:

```java
import com.calebhabesh.linewatch.cache.DashboardCacheProperties;
import com.calebhabesh.linewatch.cache.DashboardCacheService;
import com.fasterxml.jackson.core.type.TypeReference;
```

`RawAlertDto` is already in the `com.calebhabesh.linewatch.alert` package, so do not import it.

Update `AlertControllerTest` with mocked cache supplier stubbing.

- [ ] **Step 5: Cache ingestion health**

Inject cache into `IngestionHealthController`.

Refactor current `ingestion()` body into `private IngestionHealthResponse buildIngestion()`.

Endpoint:

```java
@GetMapping
public IngestionHealthResponse ingestion() {
    return cache.getOrCompute(
        "health:ingestion",
        new TypeReference<IngestionHealthResponse>() {},
        cacheProperties.getIngestionHealthTtl(),
        this::buildIngestion
    );
}
```

Update `IngestionHealthControllerTest` with mocked cache supplier stubbing.

- [ ] **Step 6: Evict cache after successful alert ingestion**

Modify `TtcAlertIngestionService` constructor to accept `DashboardCacheService cache`.

After `runService.succeed(...)`, call:

```java
cache.evictDashboard();
```

Do not evict on failure.

Update `TtcAlertIngestionServiceTest`:

- Verify `cache.evictDashboard()` is called after successful ingestion.
- Verify it is not called after client failure.

Expected Mockito assertions:

```java
verify(cache).evictDashboard();
verify(cache, never()).evictDashboard();
```

- [ ] **Step 7: Run backend tests and commit**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

Commit:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java backend/src/main/java/com/calebhabesh/linewatch/health/IngestionHealthController.java backend/src/main/java/com/calebhabesh/linewatch/performance/PerformanceController.java backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertIngestionService.java backend/src/test/java/com/calebhabesh/linewatch
git diff --cached --name-status
git commit -m "feat: cache dashboard read models in redis"
```

---

## Task 5: CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
          cache: maven

      - name: Test backend
        run: mvn -f backend/pom.xml test

  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: npm --prefix frontend ci

      - name: Fixture tests
        run: npm --prefix frontend run test:fixtures

      - name: Typecheck
        run: npm --prefix frontend run typecheck

      - name: Lint
        run: npm --prefix frontend run lint

      - name: Build
        run: npm --prefix frontend run build
        env:
          BACKEND_URL: http://127.0.0.1:8080
          NEXT_PUBLIC_LINEWATCH_API_BASE_URL: http://127.0.0.1:8080
```

- [ ] **Step 2: Verify workflow syntax locally**

Run:

```bash
test -f .github/workflows/ci.yml
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
mvn -f backend/pom.xml test
```

Expected: all commands pass. This does not run GitHub Actions locally; it verifies the same commands.

- [ ] **Step 3: Commit CI**

Run:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: verify backend and frontend"
```

---

## Task 6: Deployment Artifacts And Environment Documentation

**Files:**
- Create: `backend/Dockerfile`
- Create: `.dockerignore`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Add backend Dockerfile**

Create `backend/Dockerfile`:

```dockerfile
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
RUN mvn -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/target/linewatch-backend-0.0.1-SNAPSHOT.jar /app/app.jar
ENV SERVER_PORT=8080
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

Create `.dockerignore`:

```text
.git
.github
.env
.env.*
!.env.example
frontend/node_modules
frontend/.next
frontend/.vercel
frontend/out
backend/target
tmp
test-results
playwright-report
blob-report
```

- [ ] **Step 2: Update `.env.example`**

Replace or extend `.env.example` so it contains:

```text
POSTGRES_DB=linewatch
POSTGRES_USER=linewatch
POSTGRES_PASSWORD=linewatch_dev_password
POSTGRES_PORT=5434

REDIS_PORT=6380

SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5434/linewatch
SPRING_DATASOURCE_USERNAME=linewatch
SPRING_DATASOURCE_PASSWORD=linewatch_dev_password
SPRING_DATA_REDIS_HOST=127.0.0.1
SPRING_DATA_REDIS_PORT=6380

SERVER_PORT=8080

LINEWATCH_AUTH_SECURE_COOKIE=false
LINEWATCH_AUTH_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:4173
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=http://localhost:3000
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=false
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=no-reply@linewatch.local

LINEWATCH_INGESTION_ALERTS_ENABLED=false
LINEWATCH_INGESTION_ALERTS_URL=https://alerts.ttc.ca/api/alerts/live-alerts
LINEWATCH_INGESTION_ALERTS_FIXED_DELAY=PT2M
LINEWATCH_INGESTION_ALERTS_MAX_DASHBOARD_AGE=PT10M

LINEWATCH_PERFORMANCE_TTC_ENABLED=true
LINEWATCH_PERFORMANCE_TTC_URL=https://www.ttc.ca/
LINEWATCH_PERFORMANCE_TTC_CONNECT_TIMEOUT=PT3S
LINEWATCH_PERFORMANCE_TTC_READ_TIMEOUT=PT8S
LINEWATCH_PERFORMANCE_TTC_MAX_AGE=PT24H

LINEWATCH_CACHE_DASHBOARD_ENABLED=true
LINEWATCH_CACHE_DASHBOARD_STATUS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_MAP_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_ALERTS_TTL=PT30S
LINEWATCH_CACHE_DASHBOARD_INGESTION_HEALTH_TTL=PT15S
LINEWATCH_CACHE_DASHBOARD_PERFORMANCE_TTL=PT30M

BACKEND_URL=http://localhost:8080
NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://localhost:8080
```

Do not include SMTP username/password in `.env.example`. In README, document them as provider-specific Spring Boot mail variables:

- `SPRING_MAIL_HOST`
- `SPRING_MAIL_PORT`
- `SPRING_MAIL_USERNAME`
- `SPRING_MAIL_PASSWORD`
- `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH`
- `SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE`

- [ ] **Step 3: Update README current status**

Modify `README.md`:

- Move official TTC performance metrics into “Implemented now” after Task 2:

```text
- Official TTC.ca performance metrics panel for current on-time and elevator/escalator status, source-labeled with the TTC.ca updated timestamp and unavailable fallback.
```

- Move Redis cache into “Implemented now” after Task 4:

```text
- Redis-backed dashboard cache for status, map, alerts, ingestion health, and TTC performance reads, with database/live fallback when Redis is unavailable.
```

- Remove or revise stale roadmap lines that say saved commute impact matching is future work.
- Keep these explicit limitations:

```text
- Real historical LineWatch reliability aggregation remains unimplemented.
- GTFS shape import and production geospatial matching remain unimplemented.
- Redis cache improves current read performance; it does not make stale TTC alert data live.
```

- Add a deployment section with:

```text
Backend deployment requires Java 21, PostgreSQL/PostGIS, Redis, and the environment variables listed in `.env.example`.
Frontend deployment requires `BACKEND_URL` for server-side dashboard loading and `NEXT_PUBLIC_LINEWATCH_API_BASE_URL` for browser account requests.
For production auth, set `LINEWATCH_AUTH_SECURE_COOKIE=true`, set `LINEWATCH_AUTH_ALLOWED_ORIGINS` to the deployed frontend origin, and keep `LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false`.
```

- [ ] **Step 4: Update `AGENTS.md` and `GEMINI.md` together**

In both files:

- Add official TTC performance metrics to current reality.
- Add Redis-backed dashboard cache to current reality after implementation.
- Continue prohibiting claims of real historical reliability aggregation.
- Continue prohibiting claims of GTFS shapes/geospatial matching.
- Mention `GET /api/performance`.

Exact wording to add:

```text
- `/api/performance` exposes source-labeled official TTC.ca on-time and elevator/escalator status metrics with unavailable fallback when TTC.ca cannot be parsed or fetched.
- Redis-backed dashboard caching is implemented for current status, map, alerts, ingestion health, and performance reads. Cache misses and Redis outages fall back to live/database computation, and alert ingestion success evicts dashboard cache keys.
```

- [ ] **Step 5: Verify docs do not overclaim**

Run:

```bash
rg -n "real historical reliability|reliability aggregation|production geospatial|GTFS shape|official TTC product|live station arrivals|push/email commute" README.md AGENTS.md GEMINI.md
```

Expected:

- `real historical reliability` appears only as not implemented.
- `reliability aggregation` appears only as future/not implemented.
- `production geospatial` and `GTFS shape` appear only as future/not implemented.
- `official TTC product` appears only in disclaimers.
- `live station arrivals` appears only in guardrails/limitations.
- `push/email commute` appears only in limitations.

- [ ] **Step 6: Commit deployment docs/artifacts**

Run:

```bash
git add backend/Dockerfile .dockerignore .env.example README.md AGENTS.md GEMINI.md
git diff --cached --name-status
git commit -m "docs: prepare deployment configuration"
```

---

## Task 7: Deployment Smoke Script

**Files:**
- Create: `scripts/smoke-deploy.mjs`
- Modify: `README.md`

- [ ] **Step 1: Create smoke script**

Create `scripts/smoke-deploy.mjs`:

```js
#!/usr/bin/env node

const frontendUrl = process.env.LINEWATCH_DEPLOY_FRONTEND_URL;
const backendUrl = process.env.LINEWATCH_DEPLOY_BACKEND_URL;

if (!frontendUrl || !backendUrl) {
  console.error("Set LINEWATCH_DEPLOY_FRONTEND_URL and LINEWATCH_DEPLOY_BACKEND_URL before running deployment smoke checks.");
  process.exit(1);
}

async function checkJson(label, url, predicate) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!predicate(body)) {
    throw new Error(`${label} returned an unexpected response: ${JSON.stringify(body).slice(0, 500)}`);
  }
  console.log(`ok - ${label}`);
}

async function checkHtml(label, url, expectedText) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes(expectedText)) {
    throw new Error(`${label} did not include expected text: ${expectedText}`);
  }
  console.log(`ok - ${label}`);
}

await checkJson("backend health", `${backendUrl}/api/health`, body => body.status === "ok");
await checkJson("ingestion health", `${backendUrl}/api/health/ingestion`, body => typeof body.status === "string" && typeof body.dashboardLive === "boolean");
await checkJson("status", `${backendUrl}/api/status`, body => Array.isArray(body.lines) && body.generatedAt);
await checkJson("map", `${backendUrl}/api/map`, body => Array.isArray(body.stations) && Array.isArray(body.segments));
await checkJson("performance", `${backendUrl}/api/performance`, body => typeof body.status === "string" && body.source === "TTC.ca" && Array.isArray(body.metrics));
await checkHtml("frontend", frontendUrl, "LineWatch TO");
```

Make it executable:

```bash
chmod +x scripts/smoke-deploy.mjs
```

- [ ] **Step 2: Document smoke command**

Add to `README.md` deployment section:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://your-frontend.example \
LINEWATCH_DEPLOY_BACKEND_URL=https://your-backend.example \
node scripts/smoke-deploy.mjs
```

- [ ] **Step 3: Verify script syntax**

Run:

```bash
node --check scripts/smoke-deploy.mjs
```

Expected: no syntax errors.

- [ ] **Step 4: Commit smoke script**

Run:

```bash
git add scripts/smoke-deploy.mjs README.md
git commit -m "chore: add deployment smoke checks"
```

---

## Task 8: Full Local Verification Gate

**Files:** no planned source edits.

- [ ] **Step 1: Start local dependencies if backend integration needs them**

Run only if local backend/manual checks require services:

```bash
docker compose up -d postgres redis
```

Expected: Postgres and Redis become healthy. If Docker is unavailable, report the exact error.

- [ ] **Step 2: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 3: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: all commands pass with no lint warnings.

- [ ] **Step 4: Run smoke verification**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: Playwright smoke suite passes. If browser binaries are missing, run:

```bash
npm --prefix frontend run test:smoke:install
npm --prefix frontend run test:smoke
```

Only install browsers when network/external writes are allowed.

- [ ] **Step 5: Verify Git state**

Run:

```bash
git status --short
```

Expected: clean working tree, or only intentionally untracked local environment files ignored by `.gitignore`.

---

## Task 9: Manual Deployment Steps

**Files:** provider dashboards, GitHub repository settings, environment variables. Do not commit secrets.

This project can deploy several ways. The recommended portfolio path is:

- Frontend: Vercel or equivalent Next.js hosting.
- Backend: Docker-capable service such as Render, Fly.io, Railway, or a VPS.
- Database: managed PostgreSQL with PostGIS enabled.
- Cache: managed Redis.

- [ ] **Step 1: Provision PostgreSQL/PostGIS**

Create a production PostgreSQL database and enable PostGIS. If the provider does not enable PostGIS by default, run:

```sql
create extension if not exists postgis;
```

Set backend env:

```text
SPRING_DATASOURCE_URL=jdbc:postgresql://<host>:<port>/<database>
SPRING_DATASOURCE_USERNAME=<database-user>
SPRING_DATASOURCE_PASSWORD=<database-password>
```

Do not paste these values into Git.

- [ ] **Step 2: Provision Redis**

Create a managed Redis instance.

Set backend env:

```text
SPRING_DATA_REDIS_HOST=<redis-host>
SPRING_DATA_REDIS_PORT=<redis-port>
LINEWATCH_CACHE_DASHBOARD_ENABLED=true
```

If Redis requires TLS or password, add the provider-specific Spring Data Redis variables supported by Spring Boot. Keep credentials in the host dashboard, not in Git.

- [ ] **Step 3: Deploy backend**

Use `backend/Dockerfile` as the build file.

Set backend env:

```text
SERVER_PORT=8080
LINEWATCH_AUTH_SECURE_COOKIE=true
LINEWATCH_AUTH_ALLOWED_ORIGINS=https://<frontend-domain>
LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false
LINEWATCH_PASSWORD_RESET_FRONTEND_BASE_URL=https://<frontend-domain>
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=false
LINEWATCH_INGESTION_ALERTS_ENABLED=false
LINEWATCH_PERFORMANCE_TTC_ENABLED=true
LINEWATCH_PERFORMANCE_TTC_URL=https://www.ttc.ca/
```

For a live demo with TTC alerts, set:

```text
LINEWATCH_INGESTION_ALERTS_ENABLED=true
```

Use only one backend instance for scheduled polling unless a distributed scheduler/lock is added later.

- [ ] **Step 4: Optional SMTP setup**

If password reset email should work in production, set:

```text
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_ENABLED=true
LINEWATCH_AUTH_PASSWORD_RESET_EMAIL_FROM=<verified-sender>
SPRING_MAIL_HOST=<smtp-host>
SPRING_MAIL_PORT=<smtp-port>
SPRING_MAIL_USERNAME=<smtp-username>
SPRING_MAIL_PASSWORD=<smtp-password>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true
```

If SMTP is not configured, password reset request remains neutral but no email is delivered. Keep `LINEWATCH_AUTH_PASSWORD_RESET_DEV_LINKS=false` in production.

- [ ] **Step 5: Deploy frontend**

Set frontend env:

```text
BACKEND_URL=https://<backend-domain>
NEXT_PUBLIC_LINEWATCH_API_BASE_URL=https://<backend-domain>
```

Build command:

```bash
npm --prefix frontend run build
```

If the host runs commands from `frontend/`, use:

```bash
npm ci
npm run build
```

- [ ] **Step 6: Run deployment smoke checks**

After both deployments are live:

```bash
LINEWATCH_DEPLOY_FRONTEND_URL=https://<frontend-domain> \
LINEWATCH_DEPLOY_BACKEND_URL=https://<backend-domain> \
node scripts/smoke-deploy.mjs
```

Expected:

```text
ok - backend health
ok - ingestion health
ok - status
ok - map
ok - performance
ok - frontend
```

- [ ] **Step 7: Browser validation**

Open the deployed frontend and verify:

- First screen is the dashboard, not a landing page.
- Map renders.
- Menu opens.
- Official TTC Performance panel shows source-labeled metrics or an honest unavailable state.
- Station search opens and station detail shows accessibility rows.
- Demo account login works if intentionally kept available.
- Saved commute panel loads account-backed state after auth.
- Password reset request does not expose a dev token in production.
- Network tab shows browser account calls using the deployed backend domain.

- [ ] **Step 8: Update README with deployed URLs**

After successful smoke checks, add a short deployment section:

```text
Deployed demo:

- Frontend: https://<frontend-domain>
- Backend health: https://<backend-domain>/api/health

The app is unofficial and uses fixture fallback when backend reads are unavailable. TTC Live Alerts polling is enabled only when the deployed backend has a fresh successful ingestion run.
```

Commit:

```bash
git add README.md
git commit -m "docs: add deployed demo links"
```

---

## Task 10: Final Pre-Launch Review

**Files:** docs and deployed app.

- [ ] **Step 1: Run final source-claim audit**

Run:

```bash
rg -n "official TTC|live TTC|live station arrivals|real historical|reliability aggregation|Redis-backed|GTFS shape|production geospatial|push/email commute|route review/edit" README.md AGENTS.md GEMINI.md frontend/src backend/src
```

Expected:

- Official TTC wording refers to source-labeled metrics or public source attribution, not official product status.
- Live TTC wording is conditioned on fresh ingestion.
- Live station arrivals are not claimed.
- Real historical reliability aggregation remains future work.
- Redis-backed cache claims match implemented code.
- GTFS shape and production geospatial claims remain future work.
- Push/email commute and route review/edit remain future work.

- [ ] **Step 2: Run final local verification**

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: all pass.

- [ ] **Step 3: Check CI**

Push branch or open PR. Confirm GitHub Actions `Backend` and `Frontend` jobs pass.

If CI fails because it cannot download dependencies, read the exact log and fix the dependency/cache issue. Do not skip CI.

- [ ] **Step 4: Tag deployment-ready commit**

After local verification, deployment smoke checks, and CI all pass:

```bash
git tag predeploy-official-metrics-redis
git status --short
```

Expected: clean working tree.

Only push the tag if the user wants a release marker:

```bash
git push origin predeploy-official-metrics-redis
```

---

## Completion Criteria

This pre-deploy plan is complete only when all are true:

- Official TTC.ca performance metrics are exposed by `/api/performance`.
- The frontend analytics panel displays official TTC metrics with source and updated label.
- Performance fetch failures show an unavailable state, not fake reliability values.
- Redis caches status, map, alert, ingestion health, and performance reads.
- Redis outages do not break user-facing endpoints.
- Successful TTC alert ingestion evicts dashboard cache keys.
- Cached live alert data cannot outlive the configured dashboard freshness window.
- CI runs backend tests, frontend fixture tests, typecheck, lint, and build.
- Deployment env variables are documented.
- Backend can be deployed from `backend/Dockerfile`.
- Deployment smoke script passes against deployed URLs.
- README, AGENTS, and GEMINI claims match implemented code.
- Full local verification and CI pass before launch.
