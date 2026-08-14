// Same one-time-flag pattern as lib/identity/actor.ts's ACTOR_STORAGE_KEY.
const SEEN_STORAGE_KEY = "colony-map:install-instructions-seen";

export function hasSeenInstallInstructions(): boolean {
  return localStorage.getItem(SEEN_STORAGE_KEY) === "true";
}

export function markInstallInstructionsSeen(): void {
  localStorage.setItem(SEEN_STORAGE_KEY, "true");
}
