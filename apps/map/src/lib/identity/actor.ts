// D-016 — actor identity is a client-supplied free-text string until M8 real auth
// ships. One name per device, persisted to localStorage, collected once by
// features/identity/NamePrompt.tsx.
const ACTOR_STORAGE_KEY = "colony-map:actor";

export function getStoredActor(): string | null {
  return localStorage.getItem(ACTOR_STORAGE_KEY);
}

export function setStoredActor(name: string): void {
  localStorage.setItem(ACTOR_STORAGE_KEY, name.trim());
}
