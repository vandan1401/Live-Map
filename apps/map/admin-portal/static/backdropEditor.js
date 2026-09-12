// docs/plans/29.md: the colony-backdrop editor UI, split out of portal.js (invariant 7,
// 250-line cap). Loaded before portal.js in index.html so buildBackdropRow exists by the
// time loadColonies() (portal.js) calls it. Uses the same globals portal.js defines (api,
// setStatus) — plain scripts, no build step, no module boundary (D-114's philosophy).

// docs/plans/29.md: the "in-app numeric nudge" — plain number/checkbox/text fields, no
// drag-to-align canvas (backlog text: "not necessarily a full redo of the offline tool").
// Called from portal.js (a separate, non-module script sharing this global scope, loaded
// after this file) — invisible to a single-file unused-vars check, hence the disable below.
// eslint-disable-next-line no-unused-vars
function buildBackdropRow(colony) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 4;
  td.className = "backdrop-editor";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg";
  const uploadButton = document.createElement("button");
  uploadButton.textContent = "Upload image";
  uploadButton.addEventListener("click", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      setStatus("choose a JPEG file first", true);
      return;
    }
    try {
      const { width, height } = await readImageDimensions(file);
      const imageBase64 = await readFileAsBase64(file);
      await api("POST", `/api/colonies/${colony.id}/backdrop-image`, {
        imageBase64,
        imageWidth: width,
        imageHeight: height,
      });
      setStatus(`uploaded backdrop for ${colony.name}`, false);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  // [formKey, colonies column name, label, kind] — an explicit table, not a name
  // transform, so there is no ambiguity between e.g. rotateDeg and backdrop_transform_x.
  const FIELD_SPECS = [
    ["x", "backdrop_transform_x", "x", "number"],
    ["y", "backdrop_transform_y", "y", "number"],
    ["scale", "backdrop_transform_scale", "scale", "number"],
    ["rotateDeg", "backdrop_transform_rotate_deg", "rotate (deg)", "number"],
    ["darkenAlpha", "backdrop_darken_alpha", "darken alpha", "number"],
    ["enabledOnAdmin", "backdrop_enabled_on_admin", "enabled on admin", "checkbox"],
    ["enabledOnPublic", "backdrop_enabled_on_public", "enabled on public", "checkbox"],
    // docs/plans/29.md /review: the ODbL/OpenStreetMap credit is a real attribution
    // obligation (public-colony.css), not decorative — it needs a write path like every
    // other alignment field, not just a value baked into the old checked-in JSON.
    ["attribution", "backdrop_attribution", "attribution", "text"],
  ];
  const fields = {};
  const fieldRow = document.createElement("div");
  for (const [formKey, column, label, kind] of FIELD_SPECS) {
    const wrapper = document.createElement("label");
    wrapper.textContent = `${label}: `;
    const input = document.createElement("input");
    input.type = kind;
    if (kind === "checkbox") input.checked = Boolean(colony[column]);
    else if (kind === "number") {
      input.step = "any";
      input.value = colony[column] ?? 0;
    } else {
      input.value = colony[column] ?? "";
    }
    fields[formKey] = input;
    wrapper.appendChild(input);
    fieldRow.appendChild(wrapper);
  }

  const saveButton = document.createElement("button");
  saveButton.textContent = "Save alignment";
  saveButton.addEventListener("click", async () => {
    try {
      await api("PATCH", `/api/colonies/${colony.id}/backdrop`, {
        x: Number(fields.x.value),
        y: Number(fields.y.value),
        scale: Number(fields.scale.value),
        rotateDeg: Number(fields.rotateDeg.value),
        darkenAlpha: Number(fields.darkenAlpha.value),
        enabledOnAdmin: fields.enabledOnAdmin.checked,
        enabledOnPublic: fields.enabledOnPublic.checked,
        attribution: fields.attribution.value,
      });
      setStatus(`saved backdrop alignment for ${colony.name}`, false);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  td.appendChild(fileInput);
  td.appendChild(uploadButton);
  td.appendChild(fieldRow);
  td.appendChild(saveButton);
  tr.appendChild(td);
  return tr;
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("could not read image dimensions"));
    };
    img.src = url;
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("could not read file"));
    reader.readAsDataURL(file);
  });
}
