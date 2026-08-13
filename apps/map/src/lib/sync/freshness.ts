// Pure, DOM-free — spec/05's "Updated 2 min ago" / "Offline — last synced 3h ago".
// Deliberately not formatRelativeTime (shared/format.ts): that one renders an absolute
// clock time with day context, right for plot_history attribution, wrong for a
// genuinely relative freshness age.

const JUST_NOW_THRESHOLD_S = 60;
const HOUR_THRESHOLD_S = 3600;

function formatDuration(seconds: number): string {
  if (seconds < JUST_NOW_THRESHOLD_S) return "just now";
  if (seconds < HOUR_THRESHOLD_S) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / HOUR_THRESHOLD_S)}h ago`;
}

export function formatFreshnessLabel(lastSyncedAt: Date, now: Date, online: boolean): string {
  const seconds = Math.max(0, (now.getTime() - lastSyncedAt.getTime()) / 1000);
  const duration = formatDuration(seconds);
  return online ? `Updated ${duration}` : `Offline — last synced ${duration}`;
}
