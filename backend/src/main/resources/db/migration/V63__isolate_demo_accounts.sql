-- Existing demo sessions all share one mutable principal. Invalidate that
-- legacy state before demo login begins issuing isolated disposable accounts.
delete from accounts where demo = true;
