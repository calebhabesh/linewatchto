package com.calebhabesh.linewatch.health;

import com.calebhabesh.linewatch.push.PushEvaluationHealthEntity;
import com.calebhabesh.linewatch.push.PushEvaluationHealthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health/push")
public class PushHealthController {
    private final PushEvaluationHealthService healthService;

    public PushHealthController(PushEvaluationHealthService healthService) {
        this.healthService = healthService;
    }

    @GetMapping
    public PushHealthResponse push() {
        PushEvaluationHealthEntity health = healthService.current();
        if (health == null) return new PushHealthResponse("not-run", null, null, null, 0, 0, 0, null);
        String status = health.getConsecutiveFailures() > 0 ? "failed" : "healthy";
        return new PushHealthResponse(status, health.getLastStartedAt(), health.getLastSucceededAt(),
            health.getLastFailedAt(), health.getConsecutiveFailures(), health.getLastAccountsEvaluated(),
            health.getLastAccountsFailed(), health.getLastError());
    }

    public record PushHealthResponse(
        String status,
        java.time.Instant lastStartedAt,
        java.time.Instant lastSucceededAt,
        java.time.Instant lastFailedAt,
        int consecutiveFailures,
        int accountsEvaluated,
        int accountsFailed,
        String lastError
    ) {}
}
