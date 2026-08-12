-- Three-status vocabulary (D-013 amended again — hold removed) and plot dimensions
-- (D-012 amended — length_ft/breadth_ft added). Additive/corrective; does not touch M2's
-- or M4's migrations. See docs/plans/03.md.

-- Defensive: makes the CHECK swap below succeed even against a non-reset DB that still
-- has status = 'hold' rows. plot_history is append-only by trigger and is deliberately
-- NOT touched here — a historical 'hold' row is evidence of what actually happened, and
-- the CHECK constraint only validates rows written from now on, never rewrites history.
update plots set status = 'available' where status = 'hold';

alter table plots drop constraint plots_status_check;
alter table plots add constraint plots_status_check
  check (status in ('available', 'booked', 'registered'));

alter table plot_history drop constraint plot_history_status_check;
alter table plot_history add constraint plot_history_status_check
  check (status in ('available', 'booked', 'registered'));

comment on column plots.status is
  'Words per D-013 (amended twice: registered is not terminal; hold removed, three
statuses only). Legal transitions live in docs/decisions/D-013-status-vocabulary.md,
enforced in application code by applyPlotTransition() — this CHECK only restricts to
valid words, not valid transitions between them.';

-- numeric, not integer — frontage/depth aren't always whole feet. A temporary default
-- of 0 lets this apply to a table that already has rows (49 in the local dev DB right
-- now); the default is dropped immediately after so no future writer can rely on it —
-- scripts/import-seed.ts, the only writer, sets both on every row.
alter table plots
  add column length_ft numeric not null default 0,
  add column breadth_ft numeric not null default 0;
alter table plots
  alter column length_ft drop default,
  alter column breadth_ft drop default;

comment on column plots.length_ft is 'Frontage in feet (D-012 amended). Shown on the plot detail sheet.';
comment on column plots.breadth_ft is 'Depth in feet (D-012 amended). Shown on the plot detail sheet.';
