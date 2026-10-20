package com.calebhabesh.linewatch.push;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Builds the tap target carried by a push notification. The app resolves the target against
 * current data when tapped, so these params describe what was notified, not where to land.
 */
final class PushNotificationTargetUrls {
    static final String TARGET_LINE_PARAM = "targetLine";
    static final String TRIP_CHANGE_PARAM = "tripChangeId";
    static final String STATE_PARAM = "state";
    static final String CLEARED_STATE = "cleared";

    // Added after update fingerprints already included the URL; strip them so existing
    // observations keep matching and a deploy does not re-send every active alert.
    private static final Set<String> TARGET_ONLY_PARAMS = Set.of(TARGET_LINE_PARAM, TRIP_CHANGE_PARAM, STATE_PARAM);

    private PushNotificationTargetUrls() {}

    static String withParam(String url, String name, String value) {
        if (value == null || value.isBlank()) {
            return url;
        }
        String base = url == null || url.isBlank() ? "/" : url;
        String separator = base.contains("?") ? "&" : "?";
        return base + separator + name + "=" + URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    static String withTargetLine(String url, String lineId) {
        return withParam(url, TARGET_LINE_PARAM, lineId);
    }

    static String cleared(String activeUrl) {
        if (activeUrl == null || activeUrl.isBlank() || "/".equals(activeUrl.trim())) {
            return "/";
        }
        return withParam(withoutParams(activeUrl, Set.of(STATE_PARAM)), STATE_PARAM, CLEARED_STATE);
    }

    static String withoutTargetParams(String url) {
        return withoutParams(url, TARGET_ONLY_PARAMS);
    }

    private static String withoutParams(String url, Set<String> names) {
        if (url == null) {
            return null;
        }
        int queryStart = url.indexOf('?');
        if (queryStart < 0) {
            return url;
        }
        String query = Arrays.stream(url.substring(queryStart + 1).split("&"))
            .filter(part -> !part.isEmpty() && !names.contains(part.split("=", 2)[0]))
            .collect(Collectors.joining("&"));
        return query.isEmpty() ? url.substring(0, queryStart) : url.substring(0, queryStart + 1) + query;
    }
}
