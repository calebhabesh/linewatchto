package com.calebhabesh.linewatch.push;

public record WebPushPayload(
    String title,
    String body,
    String url,
    String tag,
    String state,
    String timestamp
) {
    public static WebPushPayload fromEvent(PushNotificationEventEntity event) {
        return new WebPushPayload(
            event.getTitle(),
            event.getBody(),
            event.getUrl(),
            PushNotificationDisplayTags.forEvent(event),
            event.getNotificationState(),
            event.getCreatedAt().toString()
        );
    }

    public boolean highUrgency() {
        return !"CLEARED".equalsIgnoreCase(state);
    }

    public String toJson() {
        return "{"
            + "\"title\":" + jsonString(title)
            + ",\"body\":" + jsonString(body)
            + ",\"url\":" + jsonString(url)
            + ",\"tag\":" + jsonString(tag)
            + ",\"state\":" + jsonString(state)
            + ",\"timestamp\":" + jsonString(timestamp)
            + "}";
    }

    private static String jsonString(String value) {
        String safe = value == null ? "" : value;
        StringBuilder builder = new StringBuilder(safe.length() + 2);
        builder.append('"');
        for (int index = 0; index < safe.length(); index += 1) {
            char ch = safe.charAt(index);
            switch (ch) {
                case '"' -> builder.append("\\\"");
                case '\\' -> builder.append("\\\\");
                case '\b' -> builder.append("\\b");
                case '\f' -> builder.append("\\f");
                case '\n' -> builder.append("\\n");
                case '\r' -> builder.append("\\r");
                case '\t' -> builder.append("\\t");
                default -> {
                    if (ch < 0x20) {
                        builder.append(String.format("\\u%04x", (int) ch));
                    } else {
                        builder.append(ch);
                    }
                }
            }
        }
        builder.append('"');
        return builder.toString();
    }
}
