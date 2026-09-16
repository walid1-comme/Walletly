import type { LocalList, Wallet } from '../types';
import { short } from './format';

export const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

/**
 * Pulls wallets out of anything pasted. One per line:
 *   0xabc...              -> name falls back to the short address
 *   0xabc..., main        -> name "main"
 *   0xabc..., main, cold  -> name "main", group "cold"
 */
export function parseWallets(text: string): Wallet[] {
  const seen = new Set<string>();
  const out: Wallet[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(ADDRESS_RE);
    if (!match) continue;
    const address = match[0].toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);

    const columns = line
      .replace(match[0], '')
      .split(/[,;\t]/)
      .map((s) => s.trim())
      .filter(Boolean);

    out.push({
      address,
      label: columns[0] || short(match[0]),
      group: columns[1] || '',
    });
  }
  return out;
}

/**
 * Parses an allowlist paste or CSV. Column order does not matter: the first
 * 0x on a line is the address, the first remaining column is the tier.
 */
export function parseList(name: string, text: string): LocalList | null {
  const entries = new Map<string, string>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(ADDRESS_RE);
    if (!match) continue;
    const rest = line
      .replace(match[0], '')
      .split(/[,;\t]/)
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    entries.set(match[0].toLowerCase(), rest[0] ?? '');
  }

  if (!entries.size) return null;
  return { name: name.trim() || 'Untitled list', entries };
}
