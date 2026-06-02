package com.calebhabesh.linewatch.ingestion;

public enum AlertImpactKind {
    SUSPENSION("suspension"),
    DELAY("delay"),
    REDUCED_SPEED_ZONE("reduced-speed-zone"),
    PLANNED_CLOSURE("planned-closure");

    private final String wireValue;

    AlertImpactKind(String wireValue) {
        this.wireValue = wireValue;
    }

    public String wireValue() {
        return wireValue;
    }
}
