// Client for tools/pipeline/ui/server.py. No build step, same philosophy as
// tools/pipeline/verify/verify.js (D-114) -- this is a local owner tool, not app code.
"use strict";

const state = { current: null, history: [] };

function baseName(path) {
  return path.split(/[\\/]/).pop();
}

function setCurrent(path, label) {
  state.current = path;
  state.history.push({ path, label });
  document.getElementById("current-file").hidden = false;
  document.getElementById("current-file-name").textContent = label;
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = "";
  for (const entry of state.history) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = entry.label;
    btn.className = entry.path === state.current ? "pu-history-btn is-current" : "pu-history-btn";
    btn.addEventListener("click", () => {
      state.current = entry.path;
      document.getElementById("current-file-name").textContent = entry.label;
      renderHistory();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function showOutput(el, result) {
  el.textContent = result.output || result.error || (result.ok ? "done, no output" : "failed");
  el.className = `pu-output ${result.ok ? "is-ok" : "is-bad"}`;
}

async function uploadFile(file) {
  const form = new FormData();
  form.append("dxf", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const result = await res.json();
  if (!result.ok) {
    alert(result.error || "upload failed");
    return;
  }
  setCurrent(result.path, file.name);
}

async function runStage(stage) {
  if (!state.current) {
    alert("upload a DXF first");
    return;
  }
  const out = document.getElementById("stage-output");
  out.textContent = "running…";
  out.className = "pu-output";
  const result = await postJson(`/api/run/${stage}`, { dxf: state.current });
  showOutput(out, result);
  if (result.ok && result.out_path) {
    setCurrent(result.out_path, baseName(result.out_path));
  }
}

async function runExport() {
  const colony = document.getElementById("colony-id").value.trim();
  if (!colony) {
    alert("enter a colony id");
    return;
  }
  if (!state.current) {
    alert("upload a DXF first");
    return;
  }
  const allowIdChange = document.getElementById("allow-id-change").checked;
  const out = document.getElementById("export-output");
  const success = document.getElementById("export-success");
  success.hidden = true;
  out.textContent = "running…";
  out.className = "pu-output";
  const result = await postJson("/api/run/export", {
    colony,
    dxf: state.current,
    allow_id_change: allowIdChange,
  });
  if (result.ok) {
    out.textContent = "";
    success.hidden = false;
    success.innerHTML =
      `Wrote colony.svg + colony.json. ` +
      `<a href="${result.preview_url}" target="_blank" rel="noopener">Open in verify preview</a>`;
  } else {
    showOutput(out, result);
  }
}

function init() {
  document.getElementById("dxf-upload").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) uploadFile(file);
  });
  document.querySelectorAll(".pu-stage-btn").forEach((btn) => {
    btn.addEventListener("click", () => runStage(btn.dataset.stage));
  });
  document.getElementById("export-btn").addEventListener("click", runExport);
}

init();
