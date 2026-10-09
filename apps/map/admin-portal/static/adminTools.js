// docs/plans/36.md: the "All users" and "Audit log" panels. Plain DOM, textContent only (a
// display name or an audit detail is free text, never innerHTML). Uses the same fetch wrapper
// as the rest of the portal (auth.js adds the token).

async function toolsApi(method, path, body) {
  const options = { method };
  if (method !== "GET") options.headers = { "Content-Type": "application/json" };
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetch(path, options);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `request to ${path} failed`);
  return json;
}

function toolsStatus(message, isError) {
  const line = document.getElementById("status-line");
  line.textContent = message;
  line.style.color = isError ? "#b00020" : "#444";
}

function actionButton(label, handler) {
  const button = document.createElement("button");
  button.textContent = label;
  button.addEventListener("click", async () => {
    try {
      await handler();
      await loadAllUsers();
      await loadAuditLog();
    } catch (err) {
      toolsStatus(err.message, true);
    }
  });
  return button;
}

async function loadAllUsers() {
  const { users } = await toolsApi("GET", "/api/users");
  const tbody = document.querySelector("#all-users-table tbody");
  tbody.innerHTML = "";
  for (const user of users) {
    const tr = document.createElement("tr");
    for (const text of [user.displayName || "", user.email, user.isSuperAdmin ? "super admin" : user.deactivated ? "deactivated" : "active"]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    const actions = document.createElement("td");
    if (!user.isSuperAdmin) {
      actions.appendChild(
        actionButton("Reset password", async () => {
          const password = prompt(`New password for ${user.email} (min 8 characters):`);
          if (!password) return;
          await toolsApi("POST", `/api/users/${user.id}/password`, { password });
          toolsStatus("Password reset.", false);
        }),
      );
      actions.appendChild(
        actionButton(user.deactivated ? "Reactivate" : "Deactivate", async () => {
          await toolsApi("POST", `/api/users/${user.id}/active`, { active: !!user.deactivated });
          toolsStatus(user.deactivated ? "Reactivated." : "Deactivated.", false);
        }),
      );
      actions.appendChild(
        actionButton("Delete", async () => {
          const typed = prompt(`Type the username to permanently delete ${user.email}:`);
          if (!typed) return;
          await toolsApi("POST", `/api/users/${user.id}/delete`, { confirmUsername: typed });
          toolsStatus("User deleted.", false);
        }),
      );
    }
    tr.appendChild(actions);
    tbody.appendChild(tr);
  }
}

async function loadAuditLog() {
  const { rows } = await toolsApi("GET", "/api/audit-log?limit=50");
  const tbody = document.querySelector("#audit-table tbody");
  tbody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const target = [row.target_type, row.target_id].filter(Boolean).join(" ");
    for (const text of [new Date(row.created_at).toLocaleString(), row.actor_name || "-", row.action, row.outcome, target, row.source_ip || ""]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

if (sessionStorage.getItem("admin-portal-token")) {
  loadAllUsers().catch((err) => toolsStatus(err.message, true));
  loadAuditLog().catch((err) => toolsStatus(err.message, true));
}
