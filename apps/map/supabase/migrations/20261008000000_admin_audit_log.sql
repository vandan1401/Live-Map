-- docs/plans/36.md (C4): the super-admin service's audit trail. Every action taken through
-- admin-portal (login, create/reset/deactivate/delete user, org and public-link changes,
-- backdrop writes) leaves rows here: an 'attempt' row written BEFORE the action (fail-closed:
-- if it cannot be written the action does not run), then an 'ok' or 'error' row after.
-- 'denied' marks a rejected login or a caller without the super_admin role.
--
-- Append-only, same shape as plot_history: update/delete rejected by trigger for every role,
-- truncate revoked. Only service_role can read or write; clients get no grant at all, and
-- RLS is on with no policies as a second lock. actor_id/target_id deliberately have no
-- foreign key to auth.users: the evidence must outlive a deleted account.

create table admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  action text not null,
  outcome text not null check (outcome in ('attempt', 'ok', 'error', 'denied')),
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  source_ip text
);

create index admin_audit_log_created_at_idx on admin_audit_log (created_at desc);

create or replace function reject_admin_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'admin_audit_log is append-only — % is not permitted', TG_OP;
end;
$$;

create trigger admin_audit_log_no_update
  before update on admin_audit_log
  for each row execute function reject_admin_audit_log_mutation();

create trigger admin_audit_log_no_delete
  before delete on admin_audit_log
  for each row execute function reject_admin_audit_log_mutation();

alter table admin_audit_log enable row level security;

-- Supabase default-grants every right to service_role; strip them all, then give back only
-- what the portal needs (no update/delete/truncate/references/trigger).
revoke all on admin_audit_log from anon, authenticated, service_role;
grant select, insert on admin_audit_log to service_role;

comment on table admin_audit_log is
  'docs/plans/36.md: append-only audit trail for admin-portal. service_role only; never in a Realtime publication.';
