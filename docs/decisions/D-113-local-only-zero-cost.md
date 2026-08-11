# D-113 — Local only: no cloud OCR, no GPU, no hosted inference

**Status:** accepted

## Decision

Everything runs on a laptop CPU, offline. No API calls, no cloud services, no GPU
dependency. The guard hook blocks installing torch, tensorflow, segment-anything, and
ultralytics.

## Reasoning

The marginal cost per colony is zero, and it stays zero at ten colonies or a hundred. That
is not just cheap — it removes an entire category of operational concern: no account, no
key, no quota, no rate limit, no data leaving the machine. Given the input is ownership
data for a private business, the last of those matters on its own.

Cloud OCR would cost under one rupee per colony, which is not the objection. The objection
is setup, credentials, and a network dependency for something PaddleOCR does locally and
well on printed plan numbers.

The only recurring cost in either project is a domain name for the app.

## Rejected alternatives

- **Google Vision / AWS Textract** — better OCR on hard scans, roughly ₹130 per 1,000
  images. Rejected on setup burden and network dependency, not on price.
- **A GPU box for SAM** — would help on rendered masterplans with shading. Not worth a
  machine for a case that may never arise.

## Practical note

PaddleOCR's install is heavier than it looks and PaddlePaddle version conflicts on Windows
are a known annoyance. Use a virtual environment. If it fights, **EasyOCR** is lighter and
nearly as good on printed numerals. WSL2 makes the whole thing painless if Python setup on
Windows becomes a time sink.
