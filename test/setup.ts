import '@testing-library/jest-dom/vitest';

/**
 * Node ≥ 22 exposes an experimental `localStorage` global that is `undefined` unless
 * `--localstorage-file` is set, and vitest's jsdom env does not override an existing global.
 * Provide a spec-shaped in-memory Storage so store/persistence tests behave like a browser.
 */
class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

const g = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage };
if (!g.localStorage || typeof g.localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
if (!g.sessionStorage || typeof g.sessionStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// jsdom does not implement scrolling; the wizard scrolls to top on step change.
if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
