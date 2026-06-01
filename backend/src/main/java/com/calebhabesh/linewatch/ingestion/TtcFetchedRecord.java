package com.calebhabesh.linewatch.ingestion;

public record TtcFetchedRecord(TtcAlertRecord record, String rawPayload) {}
