with ranked_enabled as (
    select id,
           row_number() over (partition by endpoint_hash order by updated_at desc, id desc) as ownership_rank
    from push_subscriptions
    where enabled = true
)
update push_subscriptions subscription
set enabled = false,
    disabled_at = coalesce(subscription.disabled_at, current_timestamp),
    disabled_reason = 'duplicate-endpoint-owner',
    updated_at = current_timestamp
from ranked_enabled ranked
where subscription.id = ranked.id
  and ranked.ownership_rank > 1;

create unique index idx_push_subscriptions_one_enabled_endpoint_owner
    on push_subscriptions(endpoint_hash)
    where enabled = true;

delete from push_notification_client_events
where delivery_id is null;

with ranked_events as (
    select id,
           row_number() over (partition by delivery_id, stage order by created_at desc, id desc) as event_rank
    from push_notification_client_events
)
delete from push_notification_client_events event
using ranked_events ranked
where event.id = ranked.id
  and ranked.event_rank > 1;

alter table push_notification_client_events
    drop constraint push_notification_client_events_delivery_id_fkey,
    add constraint push_notification_client_events_delivery_id_fkey
        foreign key (delivery_id) references push_notification_deliveries(id) on delete cascade;

create unique index idx_push_client_events_one_stage_per_delivery
    on push_notification_client_events(delivery_id, stage)
    where delivery_id is not null;
