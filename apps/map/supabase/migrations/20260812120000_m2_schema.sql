-- M2 — colonies, plots, plot_history. Read-only from the app; a one-off import script
-- is the only writer until M4 (spec/00-rules.md's narrow exception for the initial load).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- colonies
-- ---------------------------------------------------------------------------

create table colonies (
  id text primary key,
  name text not null,
  verified boolean not null default false,
  source_file text,
  generated date,
  created_at timestamptz not null default now()
);

comment on column colonies.verified is
  'False until a human passes the pipeline verify page (D-108). The app must refuse false.';

-- ---------------------------------------------------------------------------
-- plots
-- ---------------------------------------------------------------------------

-- status is a text CHECK, not a Postgres enum: D-013's four words are explicitly
-- unconfirmed against the family's real vocabulary. A CHECK is a one-line migration to
-- change later; an enum ALTER TYPE is not.
create table plots (
  id uuid primary key default gen_random_uuid(),
  colony_id text not null references colonies(id) on delete cascade,
  svg_id text not null,
  block text not null,
  number text not null,
  area_sqft integer not null,
  facing text not null check (facing in (
    'north', 'north-east', 'east', 'south-east',
    'south', 'south-west', 'west', 'north-west'
  )),
  is_corner boolean not null,
  status text not null default 'available' check (status in (
    'available', 'booked', 'registered', 'hold'
  )),
  owner_name text,
  owner_phone text,
  broker_name text,
  rate_paise bigint,
  booking_amount_paise bigint,
  booking_date date,
  registry_date date,
  notes text,
  version integer not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (colony_id, svg_id)
);

comment on column plots.status is
  'Words per D-013 (provisional, unconfirmed against the real WhatsApp PDF). Legal
transitions live in docs/decisions/D-013-status-vocabulary.md, enforced in application
code by applyPlotTransition() (M4) — this CHECK only restricts to valid words, not
valid transitions between them.';
comment on column plots.version is
  'Optimistic concurrency (D-006). A write sends the version it last read; mismatch fails
loudly with the winner''s name. Not exercised until M4 — M2 has no write path.';
comment on column plots.rate_paise is 'Integer paise (D-010). Never a float.';
comment on column plots.booking_amount_paise is 'Integer paise (D-010). Never a float.';
comment on column plots.updated_by is
  'Not null (D-007) — attribution must never be a claim the UI has to invent a fallback
for. Every writer (scripts/import-seed.ts today, applyPlotTransition() from M4) sets it.';

-- ---------------------------------------------------------------------------
-- plot_history — append-only. The evidence that settles a commission dispute.
-- ---------------------------------------------------------------------------

create table plot_history (
  id uuid primary key default gen_random_uuid(),
  plot_id uuid not null references plots(id) on delete cascade,
  status text not null check (status in (
    'available', 'booked', 'registered', 'hold'
  )),
  changed_by text not null,
  changed_at timestamptz not null default now(),
  note text
);

create or replace function reject_plot_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'plot_history is append-only — % is not permitted', TG_OP;
end;
$$;

create trigger plot_history_no_update
  before update on plot_history
  for each row execute function reject_plot_history_mutation();

create trigger plot_history_no_delete
  before delete on plot_history
  for each row execute function reject_plot_history_mutation();

-- ---------------------------------------------------------------------------
-- RLS — permissive until M8 (D-011). The anon key gets full read/write. Do not deploy
-- to a public URL before M8 ships; .claude/hooks/guard.sh blocks the deploy command.
-- ---------------------------------------------------------------------------

alter table colonies enable row level security;
alter table plots enable row level security;
alter table plot_history enable row level security;

create policy "colonies_permissive_all" on colonies for all using (true) with check (true);
create policy "plots_permissive_all" on plots for all using (true) with check (true);
create policy "plot_history_permissive_all" on plot_history for all using (true) with check (true);

comment on policy "colonies_permissive_all" on colonies is
  'Permissive per D-011. Tighten at M8 — do not deploy publicly before then.';
comment on policy "plots_permissive_all" on plots is
  'Permissive per D-011. Tighten at M8 — do not deploy publicly before then.';
comment on policy "plot_history_permissive_all" on plot_history is
  'Permissive per D-011. Tighten at M8 — do not deploy publicly before then.';

-- RLS policies only apply once a role already has the underlying table grant — without
-- these, PostgREST's anon connection gets "permission denied" regardless of how
-- permissive the policies above are. No code path deletes a colony or a plot (nothing
-- in lib/db, import-seed.ts, or the planned applyPlotTransition() does), so delete is
-- withheld here too — least privilege, not just append-only enforcement on history.
-- plot_history gets no update/delete grant at all, so the append-only guarantee holds
-- at the privilege layer too, not just the trigger.
grant usage on schema public to anon, authenticated;
grant select, insert, update on colonies, plots to anon, authenticated;
grant select, insert on plot_history to anon, authenticated;
