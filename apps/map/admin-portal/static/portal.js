// docs/plans/23.md phase 3: plain vanilla JS, no build step, no framework — same "verify
// page is three files, not one" philosophy (D-114) this admin portal borrows from
// tools/pipeline/ui/. Talks only to this server's own /api/* routes.

let organizations = [];
let selectedOrgId = null;

const statusLine = document.getElementById("status-line");

function setStatus(message, isError) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? "#b00020" : "#444";
}

async function api(method, path, body) {
  const options = { method };
  // server.ts requires Content-Type: application/json on every non-GET request, even a
  // body-less one (generate-link/revoke-link) — the CSRF check added by /review 2026-08-31
  // runs before any route dispatches, so this header must always be sent, not only when
  // there's a body to serialize (a real bug: the generate/revoke buttons had no body and
  // were getting rejected with 415 until this was fixed live against production).
  if (method !== "GET") {
    options.headers = { "Content-Type": "application/json" };
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `request to ${path} failed`);
  return json;
}

function populateOrgOptions(select, selectedId) {
  select.innerHTML = "";
  for (const org of organizations) {
    const option = document.createElement("option");
    option.value = org.id;
    option.textContent = org.name; // never innerHTML — an org name is free text (task A)
    if (org.id === selectedId) option.selected = true;
    select.appendChild(option);
  }
}

async function loadOrganizations() {
  const { organizations: orgs } = await api("GET", "/api/organizations");
  organizations = orgs;
  const tbody = document.querySelector("#org-table tbody");
  tbody.innerHTML = "";
  for (const org of organizations) {
    const tr = document.createElement("tr");
    if (org.id === selectedOrgId) tr.classList.add("selected");
    const nameTd = document.createElement("td");
    nameTd.textContent = org.name; // never innerHTML — an org name is free text (task A)
    const idTd = document.createElement("td");
    idTd.textContent = org.id;
    const createdTd = document.createElement("td");
    createdTd.textContent = new Date(org.created_at).toLocaleDateString();
    tr.appendChild(nameTd);
    tr.appendChild(idTd);
    tr.appendChild(createdTd);
    tr.addEventListener("click", () => selectOrg(org.id, org.name));
    tbody.appendChild(tr);
  }
}

async function selectOrg(orgId, orgName) {
  selectedOrgId = orgId;
  document.getElementById("selected-org-name").textContent = orgName;
  await Promise.all([loadUsers(), loadColonies()]);
  await loadOrganizations(); // re-render to highlight the selected row
}

async function loadUsers() {
  if (!selectedOrgId) return;
  const { users } = await api("GET", `/api/organizations/${selectedOrgId}/users`);
  const tbody = document.querySelector("#user-table tbody");
  tbody.innerHTML = "";
  for (const user of users) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.textContent = user.displayName ?? "(no name)";
    const emailTd = document.createElement("td");
    emailTd.textContent = user.email;
    const reassignTd = document.createElement("td");
    const select = document.createElement("select");
    populateOrgOptions(select, selectedOrgId);
    const button = document.createElement("button");
    button.textContent = "Reassign";
    button.addEventListener("click", async () => {
      try {
        await api("PATCH", `/api/users/${user.id}`, { orgId: select.value });
        setStatus(`reassigned ${user.email} to ${select.options[select.selectedIndex].text}`, false);
        await loadUsers();
      } catch (err) {
        setStatus(err.message, true);
      }
    });
    reassignTd.appendChild(select);
    reassignTd.appendChild(button);
    tr.appendChild(td);
    tr.appendChild(emailTd);
    tr.appendChild(reassignTd);
    tbody.appendChild(tr);
  }
}

async function loadColonies() {
  if (!selectedOrgId) return;
  const { colonies } = await api("GET", `/api/organizations/${selectedOrgId}/colonies`);
  const tbody = document.querySelector("#colony-table tbody");
  tbody.innerHTML = "";
  for (const colony of colonies) {
    const tr = document.createElement("tr");
    const nameTd = document.createElement("td");
    nameTd.textContent = colony.name;
    const verifiedTd = document.createElement("td");
    verifiedTd.textContent = colony.verified ? "yes" : "no";
    const linkTd = document.createElement("td");
    linkTd.textContent = colony.public_token ? `#/public/${colony.public_token}` : "(none)";
    const actionsTd = document.createElement("td");
    const genButton = document.createElement("button");
    genButton.textContent = "Generate link";
    genButton.addEventListener("click", async () => {
      try {
        const { token } = await api("POST", `/api/colonies/${colony.id}/public-link`);
        setStatus(`new link for ${colony.name}: #/public/${token}`, false);
        await loadColonies();
      } catch (err) {
        setStatus(err.message, true);
      }
    });
    const revokeButton = document.createElement("button");
    revokeButton.textContent = "Revoke link";
    revokeButton.addEventListener("click", async () => {
      try {
        await api("DELETE", `/api/colonies/${colony.id}/public-link`);
        setStatus(`revoked link for ${colony.name}`, false);
        await loadColonies();
      } catch (err) {
        setStatus(err.message, true);
      }
    });
    actionsTd.appendChild(genButton);
    actionsTd.appendChild(revokeButton);
    tr.appendChild(nameTd);
    tr.appendChild(verifiedTd);
    tr.appendChild(linkTd);
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  }
}

document.getElementById("create-org-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("new-org-name");
  try {
    await api("POST", "/api/organizations", { name: input.value });
    input.value = "";
    setStatus("organization created", false);
    await loadOrganizations();
  } catch (err) {
    setStatus(err.message, true);
  }
});

document.getElementById("create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedOrgId) {
    setStatus("select an organization first", true);
    return;
  }
  const username = document.getElementById("new-username");
  const password = document.getElementById("new-password");
  const displayName = document.getElementById("new-display-name");
  try {
    await api("POST", "/api/users", {
      username: username.value,
      password: password.value,
      displayName: displayName.value,
      orgId: selectedOrgId,
    });
    username.value = "";
    password.value = "";
    displayName.value = "";
    setStatus("user created", false);
    await loadUsers();
  } catch (err) {
    setStatus(err.message, true);
  }
});

loadOrganizations().catch((err) => setStatus(err.message, true));
