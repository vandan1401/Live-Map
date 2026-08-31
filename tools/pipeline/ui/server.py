"""Local UI wrapping the DXF-in-hand half of the pipeline: the standalone
tools/cad-lisp/*.py pre-normalisation scripts, then pipeline.export.run.orchestrate_export
-- one page so the owner can run the whole DXF -> colony.svg/colony.json workflow without a
terminal, even out of Claude tokens. Owner-run, not Claude (CLAUDE.md's guard.sh: "long-
running servers are mine"). Binds to 127.0.0.1 only -- never a public host (D-011).

Everything from DWG -> DXF still happens by hand in AutoCAD (D-118) -- this page starts
after DXFOUT.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from pipeline.derive import DeriveError
from pipeline.export import ExportError
from pipeline.export.run import orchestrate_export
from pipeline.extract.dxf import DxfConformanceError
from pipeline.geom import GeomError
from pipeline.matching import MatchingError

_UI_DIR = Path(__file__).resolve().parent
_PIPELINE_DIR = _UI_DIR.parent
_REPO_ROOT = _PIPELINE_DIR.parents[1]
_CAD_LISP_DIR = _REPO_ROOT / "tools" / "cad-lisp"
_UPLOADS_DIR = (_UI_DIR / "uploads").resolve()
_COLONIES_DIR = _PIPELINE_DIR / "colonies"
_OUT_DIR = _PIPELINE_DIR / "out"

_COLONY_ID_RE = re.compile(r"^[a-z0-9-]+$")

# script + the suffix its --out gets, for every pre-normalisation stage except
# check-layers (read-only, no output file -- handled separately in run_stage).
_STAGE_SCRIPTS = {
    "close-polygons": ("close_polygons.py", "plot-draft"),
    "derive-site": ("derive_site.py", "site-draft"),
    "fill-labels": ("fill_missing_labels.py", "labels-draft"),
    "fix-dashes": ("fix_plot_label_dashes.py", "dashfix"),
}

app = Flask(__name__)


def _safe_dxf_path(raw: str) -> Path:
    """Resolves a client-supplied path, refusing anything outside _UPLOADS_DIR -- every
    stage's --out lands back in there too, so a chain of stages always stays contained."""
    path = Path(raw).resolve()
    if not path.is_relative_to(_UPLOADS_DIR):
        raise ValueError("that file is outside the uploads directory")
    if not path.is_file():
        raise ValueError("that file no longer exists on the server")
    return path


def _run_script(script: str, argv: list[str]) -> dict[str, Any]:
    result = subprocess.run(
        [sys.executable, script, *argv],
        cwd=_CAD_LISP_DIR,
        capture_output=True,
        text=True,
        check=False,  # non-zero exit is a real, expected outcome here -- returncode is
        # inspected below to build {"ok": False, ...}, not something to raise on
    )
    output = (result.stdout + result.stderr).strip()
    return {"ok": result.returncode == 0, "output": output}


@app.post("/api/upload")
def upload() -> Any:
    file = request.files.get("dxf")
    if file is None or not file.filename:
        return jsonify({"ok": False, "error": "no file supplied"}), 400
    name = secure_filename(file.filename)
    if not name.lower().endswith(".dxf"):
        return jsonify({"ok": False, "error": "only .dxf files are accepted"}), 400
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest = _UPLOADS_DIR / name
    file.save(dest)
    return jsonify({"ok": True, "path": str(dest)})


@app.post("/api/run/<stage>")
def run_stage(stage: str) -> Any:
    body = request.get_json(force=True) or {}
    try:
        dxf = _safe_dxf_path(str(body.get("dxf", "")))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    if stage == "check-layers":
        return jsonify(_run_script("check_layers.py", [str(dxf)]))

    stage_script = _STAGE_SCRIPTS.get(stage)
    if stage_script is None:
        return jsonify({"ok": False, "error": f"unknown stage '{stage}'"}), 404
    script, suffix = stage_script
    out_path = dxf.with_name(f"{dxf.stem}-{suffix}.dxf")
    result = _run_script(script, [str(dxf), "--out", str(out_path)])
    if result["ok"]:
        result["out_path"] = str(out_path)
    return jsonify(result)


@app.post("/api/run/export")
def run_export() -> Any:
    body = request.get_json(force=True) or {}
    colony = str(body.get("colony", "")).strip()
    if not _COLONY_ID_RE.fullmatch(colony):
        return jsonify(
            {"ok": False, "error": "colony id must be lowercase letters, digits, hyphens only"}
        ), 400
    try:
        dxf = _safe_dxf_path(str(body.get("dxf", "")))
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    out_dir = _OUT_DIR / colony
    try:
        orchestrate_export(colony, dxf, _COLONIES_DIR, out_dir, bool(body.get("allow_id_change")))
    except (DxfConformanceError, GeomError, MatchingError, DeriveError, ExportError) as exc:
        # Tier-3 rule: errors reach the owner as a sentence naming the problem, not a
        # traceback -- these exception messages already name the offending layer/entity.
        return jsonify({"ok": False, "error": str(exc)})

    return jsonify(
        {
            "ok": True,
            "svg_path": str(out_dir / "colony.svg"),
            "json_path": str(out_dir / "colony.json"),
            "preview_url": f"/tools/pipeline/verify/index.html?colony={colony}",
        }
    )


@app.get("/")
def home() -> Response:
    return send_from_directory(_UI_DIR / "static", "index.html")


@app.get("/<path:filepath>")
def static_files(filepath: str) -> Response:
    # Serves the whole repo, same as `make serve` -- verify/'s relative fetches
    # (../out/, ../colonies/) and this page's own ui.js/ui.css resolve the same way.
    return send_from_directory(_REPO_ROOT, filepath)


def main() -> None:
    app.run(host="127.0.0.1", port=5001, debug=False)


if __name__ == "__main__":
    main()
