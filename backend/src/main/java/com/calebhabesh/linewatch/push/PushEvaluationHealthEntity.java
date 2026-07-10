package com.calebhabesh.linewatch.push;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "push_evaluation_health")
public class PushEvaluationHealthEntity {
    @Id private String id;
    private Instant lastStartedAt;
    private Instant lastSucceededAt;
    private Instant lastFailedAt;
    private int consecutiveFailures;
    private int lastAccountsEvaluated;
    private int lastAccountsFailed;
    private String lastError;
    private Instant updatedAt;

    protected PushEvaluationHealthEntity() {}

    static PushEvaluationHealthEntity current(Instant now) {
        PushEvaluationHealthEntity health = new PushEvaluationHealthEntity();
        health.id = "current";
        health.updatedAt = now;
        return health;
    }

    void record(PushNotificationDispatchService.PushEvaluationResult result, Instant now) {
        lastStartedAt = now;
        lastAccountsEvaluated = result.accountsEvaluated();
        lastAccountsFailed = result.accountsFailed();
        updatedAt = now;
        if (result.accountsFailed() == 0) {
            lastSucceededAt = now;
            consecutiveFailures = 0;
            lastError = null;
        } else {
            lastFailedAt = now;
            consecutiveFailures++;
            lastError = result.lastError();
        }
    }

    public Instant getLastStartedAt() { return lastStartedAt; }
    public Instant getLastSucceededAt() { return lastSucceededAt; }
    public Instant getLastFailedAt() { return lastFailedAt; }
    public int getConsecutiveFailures() { return consecutiveFailures; }
    public int getLastAccountsEvaluated() { return lastAccountsEvaluated; }
    public int getLastAccountsFailed() { return lastAccountsFailed; }
    public String getLastError() { return lastError; }
}
