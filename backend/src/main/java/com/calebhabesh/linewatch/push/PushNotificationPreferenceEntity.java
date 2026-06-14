package com.calebhabesh.linewatch.push;

import com.calebhabesh.linewatch.account.AccountEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "push_notification_preferences")
public class PushNotificationPreferenceEntity {
    @Id
    @Column(name = "account_id")
    private String accountId;

    @Column(name = "saved_commute_current_enabled")
    private boolean savedCommuteCurrentEnabled = true;

    @Column(name = "saved_commute_planned_enabled")
    private boolean savedCommutePlannedEnabled = true;

    @Column(name = "saved_commute_suspension_enabled")
    private boolean savedCommuteSuspensionEnabled = true;

    @Column(name = "saved_commute_delay_enabled")
    private boolean savedCommuteDelayEnabled = true;

    @Column(name = "saved_commute_reduced_speed_zone_enabled")
    private boolean savedCommuteReducedSpeedZoneEnabled = true;

    @Column(name = "saved_commute_planned_closure_enabled")
    private boolean savedCommutePlannedClosureEnabled = true;

    @Column(name = "saved_commute_restored_enabled")
    private boolean savedCommuteRestoredEnabled = true;

    @Column(name = "line_suspension_enabled")
    private boolean lineSuspensionEnabled = true;

    @Column(name = "line_delay_enabled")
    private boolean lineDelayEnabled = true;

    @Column(name = "line_reduced_speed_zone_enabled")
    private boolean lineReducedSpeedZoneEnabled = false;

    @Column(name = "line_planned_closure_enabled")
    private boolean linePlannedClosureEnabled = true;

    @Column(name = "line_restored_enabled")
    private boolean lineRestoredEnabled = true;

    @Column(name = "reminder_on_change_enabled")
    private boolean reminderOnChangeEnabled = true;

    @Column(name = "reminder_closure_24h_enabled")
    private boolean reminderClosure24hEnabled = true;

    @Column(name = "reminder_closure_morning_enabled")
    private boolean reminderClosureMorningEnabled = true;

    @Column(name = "created_at")
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    protected PushNotificationPreferenceEntity() {}

    public static PushNotificationPreferenceEntity create(AccountEntity account, Instant now) {
        PushNotificationPreferenceEntity entity = new PushNotificationPreferenceEntity();
        entity.accountId = account.getId();
        entity.createdAt = now;
        entity.updatedAt = now;
        return entity;
    }

    public void updateFrom(PushRequests.UpdatePushPreferencesRequest request, Instant now) {
        this.updatedAt = now;

        // Compatibility aliases mapping:
        // commuteNotificationsEnabled -> savedCommutes.currentDisruptions
        // plannedClosureNotificationsEnabled -> savedCommutes.plannedClosureReminders
        if (request.commuteNotificationsEnabled() != null) {
            this.savedCommuteCurrentEnabled = request.commuteNotificationsEnabled();
        }
        if (request.plannedClosureNotificationsEnabled() != null) {
            this.savedCommutePlannedEnabled = request.plannedClosureNotificationsEnabled();
        }

        if (request.savedCommutes() != null) {
            var sc = request.savedCommutes();
            if (sc.currentDisruptions() != null) {
                this.savedCommuteCurrentEnabled = sc.currentDisruptions();
            }
            if (sc.plannedClosureReminders() != null) {
                this.savedCommutePlannedEnabled = sc.plannedClosureReminders();
            }
            if (sc.eventTypes() != null) {
                var et = sc.eventTypes();
                if (et.suspensions() != null) this.savedCommuteSuspensionEnabled = et.suspensions();
                if (et.delays() != null) this.savedCommuteDelayEnabled = et.delays();
                if (et.reducedSpeedZones() != null) this.savedCommuteReducedSpeedZoneEnabled = et.reducedSpeedZones();
                if (et.plannedClosures() != null) this.savedCommutePlannedClosureEnabled = et.plannedClosures();
                if (et.serviceRestored() != null) this.savedCommuteRestoredEnabled = et.serviceRestored();
            }
        }

        if (request.lineSubscriptions() != null) {
            var ls = request.lineSubscriptions();
            if (ls.eventTypes() != null) {
                var et = ls.eventTypes();
                if (et.suspensions() != null) this.lineSuspensionEnabled = et.suspensions();
                if (et.delays() != null) this.lineDelayEnabled = et.delays();
                if (et.reducedSpeedZones() != null) this.lineReducedSpeedZoneEnabled = et.reducedSpeedZones();
                if (et.plannedClosures() != null) this.linePlannedClosureEnabled = et.plannedClosures();
                if (et.serviceRestored() != null) this.lineRestoredEnabled = et.serviceRestored();
            }
        }

        if (request.reminderTiming() != null) {
            var rt = request.reminderTiming();
            if (rt.onChange() != null) this.reminderOnChangeEnabled = rt.onChange();
            if (rt.closure24h() != null) this.reminderClosure24hEnabled = rt.closure24h();
            if (rt.closureMorning() != null) this.reminderClosureMorningEnabled = rt.closureMorning();
        }
    }

    // Getters
    public String getAccountId() { return accountId; }
    public boolean isSavedCommuteCurrentEnabled() { return savedCommuteCurrentEnabled; }
    public boolean isSavedCommutePlannedEnabled() { return savedCommutePlannedEnabled; }
    public boolean isSavedCommuteSuspensionEnabled() { return savedCommuteSuspensionEnabled; }
    public boolean isSavedCommuteDelayEnabled() { return savedCommuteDelayEnabled; }
    public boolean isSavedCommuteReducedSpeedZoneEnabled() { return savedCommuteReducedSpeedZoneEnabled; }
    public boolean isSavedCommutePlannedClosureEnabled() { return savedCommutePlannedClosureEnabled; }
    public boolean isSavedCommuteRestoredEnabled() { return savedCommuteRestoredEnabled; }
    public boolean isLineSuspensionEnabled() { return lineSuspensionEnabled; }
    public boolean isLineDelayEnabled() { return lineDelayEnabled; }
    public boolean isLineReducedSpeedZoneEnabled() { return lineReducedSpeedZoneEnabled; }
    public boolean isLinePlannedClosureEnabled() { return linePlannedClosureEnabled; }
    public boolean isLineRestoredEnabled() { return lineRestoredEnabled; }
    public boolean isReminderOnChangeEnabled() { return reminderOnChangeEnabled; }
    public boolean isReminderClosure24hEnabled() { return reminderClosure24hEnabled; }
    public boolean isReminderClosureMorningEnabled() { return reminderClosureMorningEnabled; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
