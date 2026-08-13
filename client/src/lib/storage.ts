// localStorage access that never throws. A full, restricted or corrupt
// store degrades to the fallback instead of taking the app down.

// Set once, by wipeStorage below, and never cleared: the only thing that
// seals the store is a reset on its way to a reload.
let sealed = false;

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch (e) {
    console.error(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  if (sealed) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to write ${key} to storage:`, e);
  }
}

export function readBoolean(key: string, fallback: boolean): boolean {
  const saved = readJSON<unknown>(key, null);
  return typeof saved === 'boolean' ? saved : fallback;
}

export function readRaw(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (e) {
    console.error(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

// Wipes the given keys and stops anything writing again.
//
// Both halves matter, and the second one is the whole point: the reload
// that follows doesn't stop React, and the countdown ticks every 10ms, so
// between the wipe and the unload the persistence effects put the state
// straight back, a site RESET mid-run came back to the very run it was
// meant to erase. Every write in the app goes through this module, so one
// flag here closes all of them at once.
export function wipeStorage(keys: readonly string[]) {
  sealed = true;
  try {
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.error('Failed to clear storage:', e);
  }
}

export function writeRaw(key: string, value: string) {
  if (sealed) return;
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(`Failed to write ${key} to storage:`, e);
  }
}
