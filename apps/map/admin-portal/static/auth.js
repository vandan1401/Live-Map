// docs/plans/36.md: sign-in for the admin portal. Loaded before portal.js so every same-origin
// /api/ request carries the access token without touching portal.js/backdropEditor.js. The
// token lives in sessionStorage only (gone when the tab closes); a 401 sends the user back
// to the sign-in form.

(function () {
  const KEY = "admin-portal-token";
  const nativeFetch = window.fetch.bind(window);

  function getToken() {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) sessionStorage.setItem(KEY, token);
      else sessionStorage.removeItem(KEY);
    } catch {
      // sessionStorage blocked: sign-in would not survive a reload, which is acceptable.
    }
  }

  function showLogin(message) {
    let overlay = document.getElementById("login-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "login-overlay";
      overlay.innerHTML =
        '<form id="login-form"><h2>Admin sign-in</h2>' +
        '<input id="login-username" placeholder="username" autocomplete="username" required />' +
        '<input id="login-password" type="password" placeholder="password" autocomplete="current-password" required />' +
        '<button type="submit">Sign in</button><p id="login-error"></p></form>';
      document.body.appendChild(overlay);
      document.getElementById("login-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const res = await nativeFetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: document.getElementById("login-username").value,
            password: document.getElementById("login-password").value,
          }),
        });
        const json = await res.json();
        if (json.ok) {
          setToken(json.accessToken);
          location.reload();
        } else {
          document.getElementById("login-error").textContent = json.error || "Sign-in failed.";
        }
      });
    }
    if (message) document.getElementById("login-error").textContent = message;
  }

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const isApi = url.startsWith("/api/") && url !== "/api/login";
    if (!isApi) return nativeFetch(input, init);
    const headers = new Headers((init && init.headers) || {});
    const token = getToken();
    if (token) headers.set("Authorization", "Bearer " + token);
    const res = await nativeFetch(input, { ...init, headers });
    if (res.status === 401) {
      setToken(null);
      showLogin("Please sign in.");
    }
    return res;
  };

  window.adminSignOut = function () {
    setToken(null);
    location.reload();
  };

  if (!getToken()) {
    document.addEventListener("DOMContentLoaded", () => showLogin(""));
  }
})();
