create table surface_service_notices (
  id varchar(160) primary key,
  source_id varchar(120) not null unique,
  category varchar(40) not null,
  route_type varchar(80),
  title varchar(500) not null,
  description text not null,
  header_text varchar(700),
  url varchar(700),
  effect varchar(80),
  effect_description varchar(160),
  cause varchar(80),
  cause_description varchar(160),
  active_period_start timestamp with time zone,
  active_period_end timestamp with time zone,
  source_updated_at timestamp with time zone,
  active boolean not null default true,
  raw_payload text not null,
  created_at timestamp with time zone not null,
  updated_at timestamp with time zone not null,
  check (category in ('service-change', 'bypass', 'detour', 'no-service', 'notice'))
);

create table surface_service_notice_routes (
  notice_id varchar(160) not null references surface_service_notices(id) on delete cascade,
  route_id varchar(32) not null,
  sort_order integer not null,
  primary key (notice_id, route_id)
);

create table surface_service_notice_stops (
  notice_id varchar(160) not null references surface_service_notices(id) on delete cascade,
  stop_id varchar(80) not null,
  stop_name varchar(220),
  sort_order integer not null,
  primary key (notice_id, stop_id, sort_order)
);

create index idx_ssn_active_category on surface_service_notices(active, category);
create index idx_ssnr_route_id on surface_service_notice_routes(route_id);
create index idx_ssns_stop_id on surface_service_notice_stops(stop_id);
