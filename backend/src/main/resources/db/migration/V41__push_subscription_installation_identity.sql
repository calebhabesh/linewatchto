alter table push_subscriptions
    add column installation_id varchar(80),
    add column registration_reason varchar(80),
    add column disabled_reason varchar(80);

update push_subscriptions
set registration_reason = coalesce(
    (
        select lifecycle.reason
        from push_subscription_lifecycle_events lifecycle
        where lifecycle.subscription_id = push_subscriptions.id
          and lifecycle.event_type in ('registered', 'refreshed')
        order by lifecycle.occurred_at desc
        limit 1
    ),
    'legacy'
)
where registration_reason is null;

update push_subscriptions subscription
set enabled = false,
    disabled_at = coalesce(subscription.disabled_at, current_timestamp),
    updated_at = current_timestamp,
    disabled_reason = 'historical-push-service-gone'
where subscription.enabled = true
  and exists (
      select 1
      from push_notification_deliveries delivery
      where delivery.subscription_id = subscription.id
        and delivery.status = 'gone'
  );

alter table push_subscriptions
    alter column registration_reason set not null;

create index idx_push_subscriptions_account_installation
    on push_subscriptions(account_id, installation_id, updated_at desc);
