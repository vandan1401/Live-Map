---
name: review-diff-blind-spots
description: The diff handed to /review comes from `git diff HEAD` — it omits untracked files and sweeps in unplanned work; check `git status --short` and the plan's task list before concluding.
metadata:
  type: feedback
---

Before concluding any `/review`, run `git status --short` and compare against the diff
supplied in the prompt. Anything untracked is missing from what I was shown.

**Why:** `/review` inlines `.claude/preamble.sh diff-head`, which is `git diff HEAD`. That
excludes untracked files entirely, and only `/wrap` has `git add` in its allowed-tools —
`/build` never stages. On a greenfield milestone (M2 created ~7 new files), that means most
of the work under review is invisible. Concluding "nothing above the bar" from a partial
diff is the worst failure mode available to this role.

The same mechanism cuts the other way: `git diff HEAD` also sweeps in work the plan never
mentioned, because `/build` never stages and nothing separates one task's edits from
another's. 2026-08-15 (plan 08) the diff carried two *other* deferred owner-feedback items
(map→picker back button, branded picker heading) that appear nowhere in `docs/plans/08.md`
§2 — and the only correctness bug in the diff was in that unplanned half.

**2026-08-20 (plan 12, M11), both halves at once and worse.** The diff changed
`docs/cad-layer-standard.md` — a file plan 12 §4 names verbatim as a non-goal ("No changes
to `docs/cad-layer-standard.md` or `contract/`") and CLAUDE.md's risk table rates **Tier 1**.
Meanwhile `git status --short` showed **ten untracked `tools/cad-lisp/*.py` files, 1,315
lines**, three of which the tracked README change documents by name. **Rule: an explicit
§4 non-goal appearing in the diff is a finding on its own, no further analysis needed** —
and when a tracked doc names a file, check `git ls-files` for it, not just the filesystem.

**4th, 2026-08-20 (plan 13, M12).** The same `tools/cad-lisp` block is *still* riding along —
now 11 `.py` files + `README.md` + `cv-tools.lsp`, ~1,450 lines, in a diff whose plan (13)
never mentions the directory. It has now crossed two consecutive Tier 1 milestone commits
without ever being the subject of a plan or a review. **Rule: if the same unplanned block
appears in two reviews running, say so explicitly and recommend it be committed separately
before it fuses to a Tier 1 commit** — and spot-check it anyway (this pass found a dead local
in `fill_missing_labels.py` that no linter covers, since `ruff` only runs under
`tools/pipeline/`).

**5th, 2026-08-29 (plan 20, Tier 1 contract change).** Two unplanned blocks again, and this
time one of them made the gate red. `tools/pipeline/ui/**` (Flask server + static page,
~460 lines, staged this time) and a `$INSUNITS`/`$MEASUREMENT` fix across five
`tools/cad-lisp/*.py` files — neither in `docs/plans/20.md` §2. `ruff check .` covers the
whole `tools/pipeline` tree, so `ui/server.py`'s `PLW1510` broke `make verify-pipe`/`make
gate` for the *planned* half. `PROGRESS.md` had already recorded "verify not re-run since
`ui/` was added" and the wrap claimed "ruff clean on every touched file" — true only because
`ui/` was scoped out of "touched". **Rule: when a diff adds a new directory under a linted
root, run that root's lint yourself before believing any "clean" claim, and check whether a
new dependency landed in `[project] dependencies` vs `[project.optional-dependencies]`
(`flask>=3.0` went into the required list of an offline CAD pipeline).**

**6th, 2026-09-03 (plan 27).** The smallest and most dangerous version yet: a *single*
untracked file, `apps/map/src/components/map/loadGrass.ts`, extracted from two hooks that
are tracked, modified, and now `import { loadGrass } from "./loadGrass.ts"`. Everything
else in the diff was staged (`A`/`M`), so `git status --short` had exactly one `??` line and
the tree builds locally — a commit of the index alone ships a broken build. **Rule: for
every `??` file, grep the tracked half of the diff for an import of it; a refactor that
extracts a helper is the shape that produces exactly one untracked file.**

**7th, 2026-09-12 (plan 31) — the plan-12 shape exactly, same non-goal file.** Plan 31 §4
names "`contract/` … untouched" and §3 says "if implementing this surfaces a need for one,
stop and report rather than improvising it inline". The diff nonetheless adds a whole
`colony.backdrop` object to `contract/colony.schema.json` + `contract/SPEC.md` +
`lib/db/types.ts`, and a new `applyManifestBackdrop()` DB write in `ColonyUploadScreen.tsx`,
none of which appears in §2's tasks A–F. `PROGRESS.md` got no `## Deferred` entry. Every
other finding in that pass lived in the unplanned half (pipeline never emits the field;
`?? ""` attribution; replace overwrites tuned alignment; zero tests). **Rule confirmed twice
on the same file: `contract/**` in the diff of a plan that lists it as a non-goal is a
finding before you read a single line of it — and the unplanned half is where the real bugs
are, both times.**

**8th, 2026-09-13 (plan 32) — the mirror image: the plan's own §3/§4 name a path its §2
commissions.** `docs/plans/32.md` §2 task H is an entire section of work in
`tools/pipeline/`, while §3 (line 234) still reads "…and `tools/pipeline` stay untouched"
and §4 (line 253) "`create_colony_from_manifest()`, `tools/pipeline`, any other manifest
field — untouched" — leftovers from the draft before task H was appended. So my own rule
("a §4 non-goal in the diff is a finding") fires on work the plan explicitly ordered, and a
future session reading §4 will read task H's commit as scope creep. **Rule: when a plan has
clearly grown a late task (owner quote dated after the plan's own header date, task letter
out of sequence), diff §2's path list against §3/§4 before treating a §4 hit as a finding —
and report the contradiction itself.**

**9th, 2026-09-18 (plan 35) — recurrence #6's single-untracked-import shape, tripled, plus a
plan whose §3 forbids the very files the diff carries.** `git status --short` showed three
`??` paths, all load-bearing for *tracked, modified* files: `src/components/map/
statusFillAlpha.ts` (imported by the modified `drawColony.ts`), `tsconfig.worker.json`
(referenced by the modified `tsconfig.json`), and the whole `worker/` dir (`main =
"worker/index.ts"` in the modified `wrangler.toml`). A commit of the tracked half alone is a
red `tsc -b`. Separately: plan 35 is a 2-file DB change, but `git diff HEAD` also carried the
entire unreviewed hash→path + Cloudflare-Worker rework (`publicLinkUrl.ts`, `App.tsx`,
`ShareLinkButton.tsx`, `index.html`, `wrangler.toml`, `package.json`, admin-portal, scripts)
— which plan 35 §3 explicitly pins as "do not modify". Both of that half's real bugs (the
duplicate `og:` tags, the missing `worker/theme.test.ts`) were in the unplanned part, again.
**Rule: when the plan itself says "there is unrelated WIP in the tree, don't touch it", say
in the report that the two must be committed separately — the plan's own §3 is the argument,
and a Tier-1 WIP that rides in on a Tier-1 migration commit never gets its own `/plan` or
`/review`.**

**10th, 2026-10-08 — the plan-35 WIP reviewed a second time against plan 35, which had
already shipped (57a93a6, `Status: complete`).** `git diff HEAD` now contained *only* the
Worker/hash→path rework that plan 35 §3 forbids, so every line of the diff was out of
scope for the plan it was judged against; no `docs/plans/36.md` exists, and `ogImage.ts`
still cites "docs/plans/NN.md when written". The same three `??` imports were still
untracked, and both pass-9 bugs (duplicate `og:` tags, missing `worker/theme.test.ts`) were
still present. New this pass: `env.ASSETS.fetch("/index.html")` under Cloudflare's default
`html_handling` (307 to `/`); `wrangler` isn't installed, so the bundle has never been built.
**Rule: when the supplied plan is `Status: complete` and its commit is in `git log`, the
diff is unplanned work by definition. Say so first; don't review it as a deviation.**

**11th, 2026-10-08 — git worktree `../Colony Viewer selfhost` (branch
`selfhost/private-instance`), plan 36.** The `/review` skill's inline diff and plan were the
*main* tree's Worker WIP + plan 35; only the ARGUMENTS pointed at the worktree. The skill
preamble reads the main repo, so for any worktree review the inline diff is the wrong
artifact entirely: run `git -C <worktree> status --short` / `diff HEAD` yourself. The real
worktree diff again carried unplanned work: `src/lib/config/appConfig.ts`,
`src/lib/db/browserClient.ts`, `public/config.js`, `index.html`, `CONTRIBUTING.md` — all
under plan 36's §4 non-goal "any change under `src/`".

**12th, 2026-10-20 — pass 10 exactly, a third time.** Same `/review` invocation against
plan 35 (`Status: complete`, 57a93a6), same Worker WIP as the whole diff, same three `??`
imports, and all three open bugs (duplicate `og:` tags, `ASSETS.fetch("/index.html")`
redirect, no `worker/theme.test.ts`) byte-for-byte unchanged. The skill is being re-run
on autopilot with a stale plan argument. **Rule: on a third identical pass, the finding
is the process — recommend the WIP get its own `docs/plans/36.md` before any further
`/review`, and keep the report to the delta (here: none).**

**How to apply:** every review, first tool call. If untracked files exist and are in scope
for the plan, read them directly rather than reviewing only what the diff showed, and say
in the report that the supplied diff was incomplete. Conversely, diff every changed file
against the plan's §2 task list and flag files the plan does not name — CLAUDE.md's working
style is "note, don't fix; gaps outside the plan go to `PROGRESS.md` → `## Deferred`", and
unplanned edits ride in unreviewed by tier. Related: [[project-autonomous-loop]].
