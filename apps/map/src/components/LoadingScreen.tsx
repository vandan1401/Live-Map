interface Props {
  message?: string;
}

// Branded splash shown wherever the app used to render a blank screen while waiting on a
// fetch (owner ask, 2026-09-10, "a loading screen... when the app is loaded" — the splash
// half of PROGRESS.md's spacer.land-referenced Backlog #3; the camera fly-in animation
// itself stays deferred, see that entry). Reused by App.tsx (session check, colony-list
// fetch) and PublicColonyView.tsx (get_public_colony() fetch) rather than each owning its
// own markup, so the brand mark only needs tuning in one place.
export function LoadingScreen({ message = "Loading…" }: Props) {
  return (
    <div className="loading-screen-overlay">
      <div className="loading-screen-mark" aria-hidden="true" />
      <p className="loading-screen-message">{message}</p>
    </div>
  );
}
