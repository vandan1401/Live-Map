// Simple one-time-flag pattern.
const SEEN_STORAGE_KEY = "colony-map:install-instructions-seen";

export function hasSeenInstallInstructions(): boolean {
  return localStorage.getItem(SEEN_STORAGE_KEY) === "true";
}

export function markInstallInstructionsSeen(): void {
  localStorage.setItem(SEEN_STORAGE_KEY, "true");
}
