// Warn when editing a plot someone else touched in the last 5 minutes — a business
// trade-off pinned in spec/04, not a guessed number.
export const RECENT_EDIT_WARNING_MINUTES = 5;

export function isRecentlyEdited(updatedAt: string, now: Date): boolean {
  const ageMs = now.getTime() - new Date(updatedAt).getTime();
  return ageMs < RECENT_EDIT_WARNING_MINUTES * 60_000;
}
