package com.calebhabesh.linewatch.ingestion;

import org.springframework.core.NestedExceptionUtils;

/**
 * A provider record the run set aside because normalizing or writing it failed. The run keeps
 * the rest of the feed; {@code message} stays server-side (it can quote the raw payload).
 */
public record QuarantinedRecord(String kind, String sourceId, String message) {
    private static final int MAX_MESSAGE_LENGTH = 300;

    public static QuarantinedRecord of(String kind, String sourceId, Throwable failure) {
        Throwable cause = NestedExceptionUtils.getMostSpecificCause(failure);
        String message = cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage();
        message = message.replaceAll("\\s+", " ").strip();
        if (message.length() > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH) + "…";
        }
        return new QuarantinedRecord(kind, sourceId == null || sourceId.isBlank() ? "unknown" : sourceId, message);
    }

    /** Public, payload-free label for health responses. */
    public String label() {
        return kind + ":" + sourceId;
    }
}
