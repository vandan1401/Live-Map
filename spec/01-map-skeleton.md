# M1 — Skeleton and colony render

**Tier 3.** No state writes, no database.

## Goal

Vite + React + TypeScript + Tailwind app that loads `fixtures/shree-vatika-2/colony.svg`
and renders it full-bleed with smooth pan and pinch-zoom on an iPhone. Every plot is
neutral — no status colours yet, because status comes from Postgres in M2.

## Build

- Scaffold with Vite (react-ts), add Tailwind and Framer Motion.
- Create the `apps/map/package.json` scripts named in `CLAUDE.md`: `typecheck`, `lint`, `test`,
  `build`, `dev`. Those exact names — `/start` inlines them and later skills call them.
- Leaflet in `CRS.Simple` mode as a pan/zoom container only. The SVG is a plain overlay.
  Do **not** route plot paths through Leaflet's vector layer — it writes inline styles and
  those beat the stylesheet (D-009).
- `apps/map/src/styles/colony-theme.css` holds every colour as a CSS variable. The four status
  rules exist and are unused until M2.
- Static decoration (`.road`, `.garden`, `.tree`, `.site-boundary`) gets
  `pointer-events: none`. Only `.plot` is interactive.
- No SVG filters anywhere — blur and drop-shadow force repaints on every zoom step in
  mobile Safari.
- Render the "Indicative layout — not to scale" note.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | Typecheck and lint pass | `make verify-map && cd apps/map && pnpm lint` |
| 2 | Production build succeeds | `pnpm build` |
| 3 | Fixture has 45 `.plot` paths and 45 unique ids | `grep -o 'class="plot"' fixtures/shree-vatika-2/colony.svg \| wc -l` |
| 4 | No styling attributes in the fixture | `grep -cE '(fill\|stroke\|style)=' fixtures/shree-vatika-2/colony.svg` returns 0 |
| 5 | Clicking a plot logs its id | Manual, in a real browser |
| 6 | Pinch-zoom is smooth on an actual iPhone | Manual. Emulator does not count. |

## Non-goals

Supabase, status colours, the detail sheet, auth, the service worker. None of it in M1.
