package com.calebhabesh.linewatch.ingestion;

public class TtcAlertClientException extends RuntimeException {
    public TtcAlertClientException(String message) {
        super(message);
    }

    public TtcAlertClientException(String message, Throwable cause) {
        super(message, cause);
    }
}
