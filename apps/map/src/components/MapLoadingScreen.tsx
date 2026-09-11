import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MAP_OPEN_HOLD_MS, MAP_OPEN_ZOOM_MS, MAP_OPEN_ZOOM_EASE } from "../lib/colony/mapOpenZoomTiming";

interface Props {
  // null while still unknown (PublicColonyView.tsx, before its fetch resolves) — the
  // colony-name card shows a placeholder until this arrives.
  colonyName: string | null;
  colonyId: string | null;
  // True once the real map is safe to reveal (App.tsx: always true, the admin colony is
  // already loaded; PublicColonyView.tsx: true only once its fetch resolves). The zoom
  // still runs on its own fixed clock either way — this only controls whether the final
  // held frame fades out the moment the clock finishes, or waits for data first.
  ready: boolean;
  // Fires the moment this scene starts scaling up (after the hold), so the caller can start
  // the real map's own matching zoom-in on the same tick rather than re-deriving
  // MAP_OPEN_HOLD_MS itself. App.tsx/PublicColonyView.tsx both use this.
  onZoomStart: () => void;
  onFinish: () => void;
}

// Fixed-duration zoom-in loading screen for opening a colony's map (owner ask, 2026-09-10,
// reference design pasted verbatim then adapted: real colony name in place of the
// reference's placeholder, contact footer kept exactly as given). Runs on a fixed clock
// rather than real load progress (owner's explicit choice) — ColonyMap/PublicColonyView are
// already mounted underneath for the entire animation.
//
// Reworked 2026-09-10 after the first two attempts both missed the actual ask: everything
// you see — ring, needle, wordmark, colony card, footer, AND the needle-shaped hole that
// reveals the real map — lives in ONE element, .map-loading-scene, under ONE `transform:
// scale()`. There is no separate fade/scale for the text and no separate animation for the
// hole; scaling one rigid picture that happens to have a transparent needle cut into it is
// what makes the hole widen in lockstep with everything else, and is also why nothing needs
// its own opacity transition to "clear out of the way" — scaling something that large,
// anchored at the needle, carries it off past the frame on its own.
//
// Reworked again 2026-09-10 (owner's third round): the needle used to be transparent from
// the very first frame; now it starts solid and the hole opens up from the needle's own
// centre over the hold, via `opened` below and .map-loading-scene's own clip-path transition
// (see that CSS for the "closed" vs "open" polygons). HOLD_MS/ZOOM_MS moved into
// mapOpenZoomTiming.ts, shared with ColonyMap.tsx/PublicColonyView.tsx so the real map's own
// zoom-in lands at the same moment this one finishes.
const FADE_MS = 200; // not a visible step — see onFinish below

export function MapLoadingScreen({ colonyName, colonyId, ready, onZoomStart, onFinish }: Props) {
  const [opened, setOpened] = useState(false);
  const [zooming, setZooming] = useState(false);
  const [zoomDone, setZoomDone] = useState(false);
  const [fading, setFading] = useState(false);
  // Guards the fade-start effect below against running twice — a ref, not `fading` itself,
  // because `fading` used to BE that effect's own dependency: setFading(true) changed it,
  // which re-ran the very effect that just set it, whose cleanup cancelled the onFinish
  // timeout it had just scheduled, and whose second pass then saw fading===true and quit
  // before rescheduling one. onFinish never fired, the overlay never unmounted, and — since
  // it's position:fixed covering the viewport with no pointer-events:none — it sat there
  // invisible (opacity 0 from --fading) eating every click forever. Deterministic, on every
  // single colony open, confirmed live 2026-09-11. A ref sidesteps this because writing to
  // it doesn't trigger a re-render, so the effect has nothing of its own left to react to.
  const fadeStartedRef = useRef(false);
  // Read once — a mid-animation prefers-reduced-motion flip is not worth tracking. The
  // `matchMedia` guard isn't optional here the way the `window` one might look — jsdom (the
  // test environment PublicColonyView.test.tsx mounts this into) doesn't implement
  // `window.matchMedia` at all, so calling it unconditionally threw and failed that test
  // (`make gate`, 2026-09-11) — this component is the one thing on that render path that
  // touches it.
  const reducedMotion = useRef(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  ).current;

  useEffect(() => {
    if (reducedMotion) {
      setOpened(true);
      setZooming(true);
      onZoomStart();
      setZoomDone(true);
      return;
    }
    // The tiny delay isn't a design choice, just mechanics: `opened` needs to start false on
    // the very first paint (the closed needle) and only then flip, so the clip-path actually
    // has a "before" state to transition away from instead of mounting already-open.
    const open = setTimeout(() => setOpened(true), 30);
    const startZoom = setTimeout(() => {
      setZooming(true);
      onZoomStart();
    }, MAP_OPEN_HOLD_MS);
    const finishZoom = setTimeout(() => setZoomDone(true), MAP_OPEN_HOLD_MS + MAP_OPEN_ZOOM_MS);
    return () => {
      clearTimeout(open);
      clearTimeout(startZoom);
      clearTimeout(finishZoom);
    };
  }, [reducedMotion, onZoomStart]);

  useEffect(() => {
    if (!zoomDone || !ready || fadeStartedRef.current) return;
    fadeStartedRef.current = true;
    setFading(true);
    // FADE_MS is not a visible beat of the animation — the zoom has already fully revealed
    // the real map underneath by the time this fires. It exists only in case the two never
    // line up in exactly the same pixels (a sub-pixel gap between where the clip-path's
    // huge outer bound ends and the viewport edge, say); a plain opacity fade this short
    // papers over that without reading as a second, separate transition.
    const finish = setTimeout(onFinish, reducedMotion ? 0 : FADE_MS);
    return () => clearTimeout(finish);
  }, [zoomDone, ready, onFinish, reducedMotion]);

  return (
    <div
      className={`map-loading-overlay${fading ? " map-loading-overlay--fading" : ""}`}
      style={{ "--fade-ms": `${FADE_MS}ms` } as CSSProperties}
    >
      {/* Everything — ring, needle, wordmark, colony card, footer, and the needle-shaped hole
          itself — is one element under one transform. See the file-level comment for why:
          in short, this is what makes the hole widen in step with the rest of the zoom
          rather than as a second, separately-timed animation, and why the decoration doesn't
          need its own fade to "clear away" — it's carried off past the frame by the same
          scale that's growing the hole. transform-origin is pinned at the needle's own
          centre (50% 36%, matching .map-loading-compass below), not the viewport's, so that
          point is what stays fixed while everything grows around it. `opened` runs first,
          on its own clip-path transition — the needle dissolving open from solid — and only
          once that's finished does `zooming` start the scale. */}
      <div
        className={`map-loading-scene${opened ? " map-loading-scene--opened" : ""}${zooming ? " map-loading-scene--zoom" : ""}`}
        style={
          {
            "--hold-ms": `${MAP_OPEN_HOLD_MS}ms`,
            "--zoom-ms": `${MAP_OPEN_ZOOM_MS}ms`,
            "--zoom-ease": MAP_OPEN_ZOOM_EASE,
          } as CSSProperties
        }
      >
        <header className="map-loading-topbar">
          <span className="map-loading-chip">GRID: 23°15'N 77°24'E</span>
          <span className="map-loading-chip map-loading-chip--status">
            <i className="map-loading-status-dot" aria-hidden="true" />
            SURVEY SYS-ACTIVE
          </span>
        </header>

        <div className="map-loading-compass" aria-hidden="true">
          <svg className="map-loading-compass-svg" viewBox="0 0 200 200" fill="none">
            <path d="M 96 15 A 85 85 0 0 0 15 96" stroke="url(#mapLoadingGold)" strokeWidth="20" />
            <path d="M 15 104 A 85 85 0 0 0 96 185" stroke="url(#mapLoadingGold)" strokeWidth="20" />
            <path d="M 104 185 A 85 85 0 0 0 185 104" stroke="url(#mapLoadingGold)" strokeWidth="20" />
            <path d="M 185 96 A 85 85 0 0 0 104 15" stroke="url(#mapLoadingGold)" strokeWidth="20" />
            {/* An outline, not a fill — .map-loading-scene's own clip-path (see its CSS) is
                what makes the needle transparent; a filled needle here would just paint back
                over the hole it's meant to frame. The two are drawn from the exact same
                numbers (this polygon's own points, converted to the clip-path's rem/%
                units), not independently eyeballed to roughly match, so this outline sits
                exactly on the hole's edge at every viewport size. */}
            <polygon
              points="100,24 116,100 100,176 84,100"
              fill="none"
              stroke="url(#mapLoadingGold)"
              strokeWidth="2"
            />
            <circle className="map-loading-needle-pivot" cx="100" cy="100" r="5" fill="#F3E5AB" />
            <defs>
              <linearGradient id="mapLoadingGold" x1="15" y1="15" x2="185" y2="185">
                <stop offset="0%" stopColor="#FFF5D1" />
                <stop offset="35%" stopColor="#D4AF37" />
                <stop offset="70%" stopColor="#C5A059" />
                <stop offset="100%" stopColor="#8C6F32" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* One flex-stacked group below the compass, gapped by flow rather than by
            individually-guessed offsets — a colony name long enough to wrap, or any other
            block changing height, just pushes the next one down instead of overlapping it. */}
        <div className="map-loading-below-compass">
          <div className="map-loading-brand">
            <h1 className="map-loading-wordmark">NAKSHA</h1>
            <div className="map-loading-divider">
              <span />
              <em>VIEW</em>
              <span />
            </div>
          </div>

          <div className="map-loading-colony-card">
            <p className="map-loading-eyebrow">Opening colony</p>
            <h2 className="map-loading-colony-name">{colonyName ?? "…"}</h2>
            <p className="map-loading-colony-sub">Live cadastral spatial layout</p>
          </div>

          <p className="map-loading-telemetry-line">
            <i className="map-loading-status-dot" aria-hidden="true" />
            SYNCHRONIZING CADASTRAL VIEW{colonyId ? ` • ${colonyId.slice(0, 8).toUpperCase()}` : ""}
          </p>
        </div>

        <footer className="map-loading-footer">
          <p className="map-loading-footer-line">Create this web view live colonies for you</p>
          <p className="map-loading-footer-contact">
            <span>Contact Vandan Moonat</span>
            <a href="tel:8959945554">8959945554</a>
            <a href="mailto:moonatvandan@gmail.com">moonatvandan@gmail.com</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
