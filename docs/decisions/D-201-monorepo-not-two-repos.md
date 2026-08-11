# D-201 — One repo, not two

**Status:** accepted — supersedes the original two-repo split

## Decision

`apps/map` and `tools/pipeline` live in one repository with one `.claude/`, one Makefile,
one shared `contract/`, and one copy of the fixtures.

## Reasoning

The original split was argued on keeping the contract honest between two independent
codebases. That argument assumes a team boundary that does not exist here: one person builds
both halves.

The split had already produced real drift within a single sitting:

- The `verified` flag check was written into the pipeline and had to be **hand-patched** into
  the app afterwards. In one repo that is one commit.
- The demo colony geometry was **duplicated** into both repos. Two copies of a fixture that
  must stay identical is precisely the thing that silently diverges.

One repo makes the contract stronger rather than weaker. `contract/colony.schema.json` is a
single machine-checkable artifact that both halves validate against, so a change that lands
on one side only **fails a test**. Two repos could only mirror the contract as prose in two
places, where divergence is invisible until the app renders an empty map with no error.

## The objections, and why they dissolved

| Objection | Resolution |
|---|---|
| Different runners (pnpm vs make/pytest) | Root Makefile dispatches; `allowed-tools` covers both |
| Different guard commands | The hook takes the union — blocking `wrangler` in the Python half is harmless |
| Different file-size extensions | Union: `*.ts *.tsx *.js *.jsx *.py` |
| Different tier globs | One rule file per tier with both halves' paths. Path-scoped rules load only when you touch that area — the mechanism working as designed |
| `CLAUDE.md` bloat | Domain detail moved into path-scoped rules, which is what the scaffold prescribes anyway. Root file is 79 lines |

## Rejected alternatives

- **Two repos** — right for two teams shipping on separate cadences, or if the pipeline were
  ever published separately. Neither applies.
- **One repo, one merged half** — collapsing the Python tool into the TypeScript app. Wrong:
  the geometry work genuinely needs shapely and OpenCV, and the tool must run offline with no
  Node toolchain.

## Blast radius

Structural but early. Splitting later is `git subtree split` plus duplicating `.claude/`, and
would be worth doing only if someone else took over one half.
