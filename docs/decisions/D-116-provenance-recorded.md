# D-116 — Source provenance recorded in every manifest

**Status:** accepted

## Decision

Every manifest carries a `source` block: file name, revision, plan date, and extraction
method.

```json
"source": { "file": "GreenValley-Ph2-Layout-RevF.dwg", "revision": "F",
            "plan_date": "2023-11-14", "method": "vector-pdf" }
```

## Reasoning

A large developer will have several revisions of the same layout, with plot lines genuinely
moved between them. Building a colony map from a superseded revision is a real and quiet
failure — everything renders correctly and the map simply contradicts the sale deeds.

Four fields make that answerable in seconds instead of being a forensic exercise. If someone
asks why the map disagrees with a registry document, `revision: F` and a plan date settle
it, and if the wrong revision was used, you know immediately which colonies need
regenerating.

`method` matters separately: a colony traced by hand from a phone photo warrants different
confidence than one extracted from a vector export, and nothing else in the output records
that difference.

## Rejected alternatives

- **Track it outside the manifest** (a spreadsheet, a filename convention) — drifts from the
  data it describes, which is exactly when you need it.
- **Skip it** — cheap now, unanswerable later.

## Blast radius

Very low. Additive fields, surfaced in the app's colony info.
