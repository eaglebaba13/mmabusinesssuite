alter table public.leads add column ad_name text;
create index leads_ad_name_idx on public.leads (ad_name) where ad_name is not null;