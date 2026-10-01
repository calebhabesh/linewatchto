package com.calebhabesh.linewatch.ingestion;

import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;
import java.time.OffsetDateTime;

public class TtcOffsetDateTimeDeserializer extends ValueDeserializer<OffsetDateTime> {
    @Override
    public OffsetDateTime deserialize(JsonParser p, DeserializationContext ctxt) {
        String text = p.getText();
        try {
            return TtcAlertTimes.parse(text);
        } catch (Exception e) {
            throw ctxt.weirdStringException(text, OffsetDateTime.class, "Failed to parse OffsetDateTime: " + text);
        }
    }
}
