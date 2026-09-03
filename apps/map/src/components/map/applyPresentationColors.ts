import { resolvePresentationConfig, type PresentationConfig } from "../../lib/colony/presentationConfig.ts";

// docs/plans/27.md: writes each status's colour, resolved from presentation.json, onto the
// CSS custom properties colonyTheme.ts's resolveColonyTheme() already reads (D-004) — this
// is the JSON→CSS wiring; colonyTheme.ts itself is unmodified. Call before
// resolveColonyTheme() on every colony mount/switch. Always sets all three explicitly
// (never a conditional/partial set) so a colony with no override never inherits a stale
// inline style left by a previously viewed colony.
//
// `config` defaults to resolving colonyId against the real presentation.json — it is a
// parameter (rather than always resolved internally) purely so a test can inject a fixture
// with a real statusColors override without needing a colony actually present in the
// checked-in JSON.
export function applyStatusColorOverrides(
  colonyId: string | undefined,
  root: Element = document.documentElement,
  config: PresentationConfig = resolvePresentationConfig(colonyId),
): void {
  const { statusColors } = config;
  const style = (root as HTMLElement).style;
  style.setProperty("--colony-status-available", statusColors.available);
  style.setProperty("--colony-status-booked", statusColors.booked);
  style.setProperty("--colony-status-registered", statusColors.registered);
}
