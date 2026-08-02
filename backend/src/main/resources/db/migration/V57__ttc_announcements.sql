create table ttc_announcements (
  id varchar(180) primary key,
  source_id varchar(150) not null unique,
  scope varchar(20) not null,
  title varchar(500) not null,
  description text not null,
  url varchar(700),
  active_period_start timestamp with time zone,
  active_period_end timestamp with time zone,
  source_updated_at timestamp with time zone,
  active boolean not null default true,
  raw_payload text not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  check (scope in ('site-wide', 'general'))
);

create index idx_ttc_announcements_active_updated
  on ttc_announcements(active, source_updated_at desc);
