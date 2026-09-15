/** localStorage that degrades to memory when the browser blocks it. */
const memory = new Map<string, string>();

export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
};

/** Encodes wallets into the URL hash so a portfolio view is shareable. */
export function readHash(): string {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw || raw.includes('=')) return '';
  try {
    return decodeURIComponent(atob(raw));
  } catch {
    return '';
  }
}

export function writeHash(text: string): void {
  const encoded = text ? btoa(encodeURIComponent(text)) : '';
  const url = `${window.location.pathname}${window.location.search}${encoded ? `#${encoded}` : ''}`;
  window.history.replaceState(null, '', url);
}
