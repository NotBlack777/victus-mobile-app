/**
 * Minimal browser shims so the localStorage/window-backed services can be
 * exercised under Bun's built-in test runner without adding dependencies.
 *
 * Import this module *before* any service module so the globals exist by the
 * time the services touch them.
 */

class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

type StorageListener = (event: { key: string | null }) => void;

const storageListeners = new Set<StorageListener>();

/** URLs pushed through window.open(), for assertions. */
export const openCalls: string[] = [];

const win = {
  addEventListener(type: string, listener: StorageListener) {
    if (type === 'storage') storageListeners.add(listener);
  },
  removeEventListener(type: string, listener: StorageListener) {
    if (type === 'storage') storageListeners.delete(listener);
  },
  open(url: string) {
    openCalls.push(url);
  },
};

function defineGlobal(name: string, value: unknown) {
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  } catch {
    try {
      (globalThis as unknown as Record<string, unknown>)[name] = value;
    } catch {
      // Nothing else we can do; the tests will fail loudly if this matters.
    }
  }
}

export const storage = new MemoryStorage();

defineGlobal('localStorage', storage);
defineGlobal('sessionStorage', new MemoryStorage());
defineGlobal('window', win);

/** Wipe all persisted state between tests. */
export function resetStorage(): void {
  storage.clear();
  openCalls.length = 0;
}

export function seedItem(key: string, value: string): void {
  storage.setItem(key, value);
}

export function removeItem(key: string): void {
  storage.removeItem(key);
}

/** Simulate the same storage mutation arriving from another tab. */
export function fireStorageEvent(key: string | null): void {
  storageListeners.forEach((listener) => listener({ key }));
}
