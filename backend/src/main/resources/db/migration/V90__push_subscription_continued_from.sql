-- Plan 12 follow-up: a replacement endpoint names the endpoint whose
-- installation enablement it continued. Catch-up skips alerts that endpoint
-- (or any earlier link of the chain) already showed, even when the browser
-- reports a different installation id for the replacement.
alter table push_subscriptions
    add column continued_from_subscription_id varchar(80)
        references push_subscriptions(id) on delete set null;
