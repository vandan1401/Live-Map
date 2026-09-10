// Simple one-time-flag pattern.
const SEEN_STORAGE_KEY = "colony-map:install-instructions-seen";

export function hasSeenInstallInstructions(): boolean {
  return localStorage.getItem(SEEN_STORAGE_KEY) === "true";
}

export function markInstallInstructionsSeen(): void {
  localStorage.setItem(SEEN_STORAGE_KEY, "true");
}

// Moved from App.tsx (invariant 7's 250-line cap). A home-screen install is already the
// thing InstallInstructions teaches the user to do (/review finding #2) — showing it again
// on the installed app's first launch (a fresh context with no shared localStorage from
// Safari on iOS) would ask an already-installed user to install again.
export function isStandaloneDisplay(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}
