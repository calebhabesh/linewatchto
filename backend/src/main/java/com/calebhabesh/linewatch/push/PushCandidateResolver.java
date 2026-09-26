package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.SavedCommuteEntity;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Resolves push notification candidates for saved commutes and subscribed lines,
 * centralizing policy routing, network line partitioning, and candidate ordering
 * across dispatch and active-notification queries.
 */
@Component
public class PushCandidateResolver {
    private final SavedCommutePushPlanner savedCommutePushPlanner;
    private final LineSubscriptionPushPlanner lineSubscriptionPushPlanner;
    private final RegionalLineSubscriptionPushPlanner regionalLineSubscriptionPushPlanner;

    @Autowired
    public PushCandidateResolver(
        SavedCommutePushPlanner savedCommutePushPlanner,
        LineSubscriptionPushPlanner lineSubscriptionPushPlanner,
        RegionalLineSubscriptionPushPlanner regionalLineSubscriptionPushPlanner
    ) {
        this.savedCommutePushPlanner = Objects.requireNonNull(savedCommutePushPlanner, "savedCommutePushPlanner");
        this.lineSubscriptionPushPlanner = Objects.requireNonNull(lineSubscriptionPushPlanner, "lineSubscriptionPushPlanner");
        this.regionalLineSubscriptionPushPlanner = Objects.requireNonNull(regionalLineSubscriptionPushPlanner, "regionalLineSubscriptionPushPlanner");
    }

    public static boolean isRegionalLine(String lineId) {
        return lineId != null && lineId.startsWith("regional-");
    }

    public List<PushNotificationCandidate> resolveCommuteCandidates(
        SavedCommuteEntity commute,
        PlannedClosureFollowUpPolicy policy
    ) {
        if (commute == null) {
            return List.of();
        }
        return policy == null
            ? savedCommutePushPlanner.candidatesFor(commute)
            : savedCommutePushPlanner.candidatesFor(commute, policy);
    }

    public List<PushNotificationCandidate> resolveCommuteCandidates(
        SavedCommuteEntity commute,
        PushNotificationPreferenceEntity preferences
    ) {
        return resolveCommuteCandidates(
            commute,
            preferences != null ? preferences.getPlannedClosureFollowUpPolicy() : null
        );
    }

    public List<PushNotificationCandidate> candidatesFor(
        SavedCommuteEntity commute,
        PlannedClosureFollowUpPolicy policy
    ) {
        return resolveCommuteCandidates(commute, policy);
    }

    public List<PushNotificationCandidate> candidatesFor(
        SavedCommuteEntity commute,
        PushNotificationPreferenceEntity preferences
    ) {
        return resolveCommuteCandidates(commute, preferences);
    }

    public List<PushNotificationCandidate> resolveLineCandidates(
        String accountId,
        List<String> subscribedLineIds,
        PlannedClosureFollowUpPolicy policy
    ) {
        if (subscribedLineIds == null || subscribedLineIds.isEmpty()) {
            return List.of();
        }

        List<String> ttcLineIds = subscribedLineIds.stream()
            .filter(lineId -> !isRegionalLine(lineId))
            .toList();

        List<PushNotificationCandidate> candidates = new ArrayList<>();
        if (!ttcLineIds.isEmpty()) {
            candidates.addAll(policy == null
                ? lineSubscriptionPushPlanner.candidatesFor(accountId, ttcLineIds)
                : lineSubscriptionPushPlanner.candidatesFor(accountId, ttcLineIds, policy));
        }

        List<String> regionalLineIds = subscribedLineIds.stream()
            .filter(PushCandidateResolver::isRegionalLine)
            .toList();
        if (!regionalLineIds.isEmpty()) {
            candidates.addAll(regionalLineSubscriptionPushPlanner.candidatesFor(
                accountId,
                regionalLineIds,
                policy == null ? PlannedClosureFollowUpPolicy.SMART : policy
            ));
        }

        return List.copyOf(candidates);
    }

    public List<PushNotificationCandidate> resolveLineCandidates(
        String accountId,
        List<String> subscribedLineIds,
        PushNotificationPreferenceEntity preferences
    ) {
        return resolveLineCandidates(
            accountId,
            subscribedLineIds,
            preferences != null ? preferences.getPlannedClosureFollowUpPolicy() : null
        );
    }

    public List<PushNotificationCandidate> candidatesFor(
        String accountId,
        List<String> subscribedLineIds,
        PlannedClosureFollowUpPolicy policy
    ) {
        return resolveLineCandidates(accountId, subscribedLineIds, policy);
    }

    public List<PushNotificationCandidate> candidatesFor(
        String accountId,
        List<String> subscribedLineIds,
        PushNotificationPreferenceEntity preferences
    ) {
        return resolveLineCandidates(accountId, subscribedLineIds, preferences);
    }
}
