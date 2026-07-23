// localStorage access that never throws: a full, restricted, or corrupt
// store degrades to the fallback instead of crashing the app

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

export function writeRaw(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.error(`Failed to write ${key} to storage:`, e);
  }
}
