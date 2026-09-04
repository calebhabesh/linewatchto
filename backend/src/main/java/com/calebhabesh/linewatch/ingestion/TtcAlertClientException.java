package com.calebhabesh.linewatch.ingestion;

public class TtcAlertClientException extends RuntimeException {
    private final TtcSourceFetchStatus fetchStatus;
    private final Integer httpStatus;

    public TtcAlertClientException(String message) {
        this(message, null, TtcSourceFetchStatus.REQUEST_ERROR, null);
    }

    public TtcAlertClientException(String message, Throwable cause) {
        this(message, cause, TtcSourceFetchStatus.REQUEST_ERROR, null);
    }

    public TtcAlertClientException(
        String message,
        Throwable cause,
        TtcSourceFetchStatus fetchStatus,
        Integer httpStatus
    ) {
        super(message, cause);
        this.fetchStatus = fetchStatus;
        this.httpStatus = httpStatus;
    }

    public static TtcAlertClientException invalidResponse(String message) {
        return new TtcAlertClientException(
            message,
            null,
            TtcSourceFetchStatus.INVALID_RESPONSE,
            null
        );
    }

    public static TtcAlertClientException invalidResponse(String message, Throwable cause) {
        return new TtcAlertClientException(
            message,
            cause,
            TtcSourceFetchStatus.INVALID_RESPONSE,
            null
        );
    }

    public TtcSourceFetchStatus fetchStatus() {
        return fetchStatus;
    }

    public Integer httpStatus() {
        return httpStatus;
    }
}
