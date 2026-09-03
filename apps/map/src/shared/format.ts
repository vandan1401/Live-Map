// Pure formatters — no DOM, no network, nothing else in this repo (NAVIGATION.md's
// "Pure" layer). Rupees exist only here; every other layer moves integer paise (D-010).

export function formatRupees(paise: number | null | undefined): string {
  if (paise == null) return "—";
  // Whole rupees drop the decimal; a paise remainder always shows both digits —
  // "₹1,500.5" reads as a typo, not fifty paise.
  const hasFraction = paise % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

// India-only business (D-... none pinned, but the whole colony is one Indian site) —
// always render in IST regardless of the viewing device's own timezone, so a
// screenshot compared between two family members' phones never disagrees.
const TIME_ZONE = "Asia/Kolkata";

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function formatClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${hour}:${minute} ${dayPeriod.toLowerCase()}`;
}

// "Booked — updated by Vikas, 2:40pm today" (spec/03) is the line that resolves most
// of the confusion the WhatsApp PDF causes today — it needs to read at a glance.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const thenKey = dateKey(then);
  if (thenKey === dateKey(now)) return `${formatClock(then)} today`;

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (thenKey === dateKey(yesterday)) return `${formatClock(then)} yesterday`;

  const dateLabel = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: TIME_ZONE,
  }).format(then);
  return `${dateLabel}, ${formatClock(then)}`;
}

// `labels` (docs/plans/27.md) is a per-colony display-name override resolved from
// presentation.json by the caller — omitted or missing-for-this-status falls back to
// exactly the original hardcoded behaviour.
export function formatStatusLabel(status: string, labels?: Partial<Record<string, string>>): string {
  const override = labels?.[status];
  if (override !== undefined) return override;
  if (status === "registered") return "Registry done";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// A blockless plot (contract/SPEC.md, docs/plans/15.md) carries block: "" — show just the
// number rather than a leading "-".
export function formatPlotLabel(plot: { block: string; number: string }): string {
  return plot.block ? `${plot.block}-${plot.number}` : plot.number;
}

// scripts/import-seed.ts writes the literal "import" into updated_by/changed_by for
// every M2 seed row (docs/plans/09.md's "system user" convention); the RPC
// bulk_set_initial_plot_data (docs/plans/10.md) writes the literal "bulk_import" for the
// same reason — both are sentinels, never a real display name, so both need a label here
// or the UI would show the raw sentinel string as if it were someone's name.
export function formatActorName(actor: string): string {
  if (actor === "import") return "Imported";
  if (actor === "bulk_import") return "Bulk import";
  return actor;
}
