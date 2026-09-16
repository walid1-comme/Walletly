import { storage } from './storage';

const KEY = 'walletly.history.v1';
const MAX = 800;

export interface Snapshot {
  /** epoch ms */
  t: number;
  /** total value in USD at that moment */
  v: number;
  /** value per wallet address at that moment */
  w?: Record<string, number>;
}

export function loadHistory(): Snapshot[] {
  try {
    const raw = storage.get(KEY);
    return raw ? (JSON.parse(raw) as Snapshot[]) : [];
  } catch {
    return [];
  }
}

/**
 * Records a reading. Readings inside the same minute are collapsed so live
 * mode does not flood the history with near-identical points.
 */
export function record(total: number, perWallet: Record<string, number>): Snapshot[] {
  const history = loadHistory();
  const now = Date.now();
  const last = history[history.length - 1];
  const point: Snapshot = { t: now, v: total, w: perWallet };

  if (last && now - last.t < 60_000) history[history.length - 1] = point;
  else history.push(point);

  const trimmed = thin(history).slice(-MAX);
  storage.set(KEY, JSON.stringify(trimmed));
  return trimmed;
}

/**
 * Keeps every reading from the last day, then roughly one per hour for the
 * last month, then one per day beyond that. A year of history stays small.
 */
function thin(history: Snapshot[]): Snapshot[] {
  const now = Date.now();
  const DAY = 86_400_000;
  const kept: Snapshot[] = [];
  let lastKept = 0;

  for (const s of history) {
    const age = now - s.t;
    const spacing = age < DAY ? 0 : age < 30 * DAY ? 3_600_000 : DAY;
    if (s.t - lastKept >= spacing) {
      kept.push(s);
      lastKept = s.t;
    }
  }
  if (history.length && kept[kept.length - 1] !== history[history.length - 1]) {
    kept.push(history[history.length - 1]);
  }
  return kept;
}

export function clearHistory(): void {
  storage.set(KEY, '[]');
}

function snapshotAt(history: Snapshot[], msAgo: number): Snapshot | null {
  const target = Date.now() - msAgo;
  let found: Snapshot | null = null;
  for (const s of history) {
    if (s.t <= target) found = s;
    else break;
  }
  return found;
}

export function valueAt(history: Snapshot[], msAgo: number): number | null {
  return snapshotAt(history, msAgo)?.v ?? null;
}

export function walletValueAt(history: Snapshot[], address: string, msAgo: number): number | null {
  const snap = snapshotAt(history, msAgo);
  if (!snap?.w) return null;
  return snap.w[address] ?? null;
}

/** How far back the history actually reaches, in ms. */
export function historySpan(history: Snapshot[]): number {
  if (history.length < 2) return 0;
  return Date.now() - history[0].t;
}

export const WINDOWS = [
  { id: '1D', ms: 86_400_000 },
  { id: '1W', ms: 7 * 86_400_000 },
  { id: '1M', ms: 30 * 86_400_000 },
  { id: '1Y', ms: 365 * 86_400_000 },
] as const;
