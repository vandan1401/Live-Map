interface Props {
  active: boolean;
  onToggle: () => void;
}

// Owner ask, 2026-09-10: a live status-visibility toggle, shared by ColonyMap.tsx (admin,
// always shown, defaults off) and PublicColonyView.tsx (public link, shown only when that
// colony's config/publicLink.json enables it, also defaults off — see publicLinkConfig.ts).
// Off is the resting state everywhere; the label names the action a tap takes, not just the
// current state (tier-3.md's copy rule — plain, not "Status: ON/OFF").
export function StatusToggle({ active, onToggle }: Props) {
  return (
    <button
      type="button"
      className={active ? "status-toggle-button is-active" : "status-toggle-button"}
      aria-pressed={active}
      onClick={onToggle}
    >
      {active ? "Hide status" : "Show status"}
    </button>
  );
}
