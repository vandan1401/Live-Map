# M10 — DXF ingest

**Tier 2** (`tools/pipeline/pipeline/extract/dxf.py`).

Rewritten under D-118. This milestone used to be "vector extraction" from a PDF; the input
is now a DXF the owner normalised in AutoCAD to `docs/cad-layer-standard.md`.

## Goal

Read a conforming DXF into the neutral intermediate structure, and **refuse a
non-conforming one with an error a human can act on in AutoCAD.**

## Build

- `ezdxf` only. Read the modelspace, group entities by layer, keep nothing else.
- Emit the same neutral intermediate structure every downstream module already expects:
  a list of rings tagged with their source layer, plus a list of
  `(text, insertion_point, layer)`. No `ezdxf` type crosses this boundary — the import test
  in M11 enforces it.
- `LWPOLYLINE` vertices come out in drawing coordinates, unmodified. No snapping, no
  polygonizing, no dedupe — a closed polyline is already a ring, which is the entire reason
  D-118 deletes most of the old M11.
- **Strictness is the feature.** Every rejection names the layer and the entity handle, so
  the owner can `SELECT` it directly. The reader never repairs, never guesses, never falls
  back. Reject:
  - a `COL-PLOT` / `COL-SITE` / `COL-GARDEN` / `COL-AMENITY` / `COL-WATER` entity that is
    not a closed `LWPOLYLINE`
  - `COL-SITE` with a count other than exactly 1, same for `COL-NORTH`
  - any entity type on a geometry layer other than `LWPOLYLINE`
- Layers outside the standard are ignored silently. Title blocks and dimension layers are
  expected to be present and are not an error.
- `MTEXT` formatting codes stripped, whitespace trimmed. Nothing else normalised — the raw
  label string is what reaches M12, which owns block resolution and padding.
- `north_deg` from the `COL-NORTH` line's bearing, tail to head. The layer is optional: fall
  back to `north_deg` in the colony config, error if neither is present, and error if both
  are present and disagree by more than 1°.
- Load the colony config (`tools/pipeline/colonies/<id>.json`) here and carry `units`,
  `expected_plots`, `blocks`, and `number_width` forward — M12 and M14 need them.

### Contingency, decide against the first real DWG

Plot numbers are specified as `TEXT` / `MTEXT`. If the owner's drawings turn out to carry
them as block attributes (`INSERT` + `ATTRIB`) instead, read those too rather than making
the owner explode every block — it is a few lines in `ezdxf` and explode is a lossy,
300-plot manual step. **Do not build this speculatively.** Check the first real DXF and
decide; if it is unnecessary, delete this section.

## Acceptance criteria

| # | Criterion | Command |
|---|---|---|
| 1 | `fixtures/shree-vatika-2/colony.dxf` yields exactly 26 closed rings on `COL-PLOT` | `pytest tests/test_dxf.py -q` |
| 2 | Same file yields 26 labels on `COL-PLOT-NO` | Same |
| 3 | An open polyline on `COL-PLOT` is rejected, and the message contains its handle | Synthetic test asserting non-zero exit |
| 4 | A `CIRCLE` on `COL-PLOT` is rejected | Synthetic test |
| 5 | Two entities on `COL-SITE` are rejected | Synthetic test |
| 6 | A dimension layer and a title block are ignored without error | Synthetic test |
| 7 | The intermediate structure carries no `ezdxf` types | Import test — `pipeline/geom` must not need `ezdxf` |
| 8 | `north_deg` from a line drawn 30° east of vertical reads 30 | Unit test |
| 9 | No `COL-NORTH` and no config `north_deg` is an error; either one alone succeeds | Synthetic test |
| 10 | A `COL-NORTH` line disagreeing with config `north_deg` by 5° is an error | Synthetic test |
| 11 | Full gate passes | `make gate` |

## Depends on

`fixtures/shree-vatika-2/colony.dxf` does not exist yet. The owner produces it by
normalising the real Shree Vatika DWG per `docs/cad-layer-standard.md`. Until it exists,
criteria 1 and 2 cannot run — this is the first blocking task of the CAD-first path, and it
also settles the stale 45-plot golden target recorded in `PROGRESS.md`.

## Non-goals

Deciding which ring is a plot — that is M12, and under D-118 it is mostly a layer lookup.
