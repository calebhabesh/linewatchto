package com.calebhabesh.linewatch.push;

import java.util.ArrayList;
import java.util.List;

final class PushNotificationDisplayTags {
    private static final String ACTIVE_SUFFIX = "|active";
    private static final String CLEARED_SUFFIX = "|cleared";

    private PushNotificationDisplayTags() {}

    static String active(String notificationKey) {
        String normalized = normalize(notificationKey);
        return normalized.isEmpty() ? "" : normalized + ACTIVE_SUFFIX;
    }

    static String cleared(String notificationKey) {
        String normalized = normalize(notificationKey);
        return normalized.isEmpty() ? "" : normalized + CLEARED_SUFFIX;
    }

    static String forState(String notificationKey, String state) {
        return "CLEARED".equalsIgnoreCase(normalize(state))
            ? cleared(notificationKey)
            : active(notificationKey);
    }

    static String forEvent(PushNotificationEventEntity event) {
        if (event == null) {
            return "";
        }
        return forState(event.getNotificationKey(), event.getNotificationState());
    }

    static List<String> retainedTagsForClearedLifecycleKey(String notificationKey) {
        String normalized = normalize(notificationKey);
        if (normalized.isEmpty()) {
            return List.of();
        }
        return List.of(active(normalized), cleared(normalized), normalized);
    }

    static List<String> distinctNonBlank(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String tag : tags) {
            String normalized = normalize(tag);
            if (!normalized.isEmpty() && !result.contains(normalized)) {
                result.add(normalized);
            }
        }
        return result;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
