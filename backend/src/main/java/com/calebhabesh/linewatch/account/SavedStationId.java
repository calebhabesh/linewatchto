package com.calebhabesh.linewatch.account;

import java.io.Serializable;
import java.util.Objects;

public class SavedStationId implements Serializable {
    private String accountId;
    private String stationId;

    public SavedStationId() {
    }

    public SavedStationId(String accountId, String stationId) {
        this.accountId = accountId;
        this.stationId = stationId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof SavedStationId that)) {
            return false;
        }
        return Objects.equals(accountId, that.accountId) && Objects.equals(stationId, that.stationId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(accountId, stationId);
    }
}
