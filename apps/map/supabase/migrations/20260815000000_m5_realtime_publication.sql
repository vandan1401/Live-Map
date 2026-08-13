-- M5 — realtime subscription on plots (spec/05-map-realtime.md). Without this, a
-- postgres_changes subscription silently receives nothing. plot_history is deliberately
-- not added here — M5's acceptance criteria only cover status changes on the map.
alter publication supabase_realtime add table plots;
