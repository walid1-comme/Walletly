import type { AllowlistMatch, Chain, PortfolioResponse } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  if (!json) throw new Error('Empty response from the API.');
  return json;
}

export async function getChains(): Promise<Chain[]> {
  const res = await fetch(`${BASE}/api/chains`);
  if (!res.ok) throw new Error('Could not load the chain list.');
  return (await res.json()) as Chain[];
}

/**
 * One wallet on one chain. Small enough to stay well inside Cloudflare's
 * 50-subrequest limit per worker invocation, which is why the browser fans
 * out rather than sending one large request.
 */
export function fetchPair(address: string, chain: string, fresh = false): Promise<PortfolioResponse> {
  return post<PortfolioResponse>('/api/portfolio', {
    addresses: [address],
    chains: [chain],
    fresh,
  });
}

export function checkRegistry(
  addresses: string[],
): Promise<{ matches: AllowlistMatch[]; registry: boolean }> {
  return post<{ matches: AllowlistMatch[]; registry: boolean }>('/api/allowlist/check', { addresses });
}

export interface Pair {
  address: string;
  chain: string;
}

/**
 * Runs every wallet/chain pair with bounded concurrency and hands each result
 * back the moment it lands, so the page fills in progressively instead of
 * blocking on the slowest chain.
 */
export async function scanPairs(
  pairs: Pair[],
  limit: number,
  onResult: (pair: Pair, result: PortfolioResponse | null, error?: string) => void,
  fresh = false,
): Promise<void> {
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, pairs.length) }, async () => {
    while (cursor < pairs.length) {
      const pair = pairs[cursor++];
      try {
        onResult(pair, await fetchPair(pair.address, pair.chain, fresh));
      } catch (err) {
        onResult(pair, null, err instanceof Error ? err.message : 'Request failed');
      }
    }
  });

  await Promise.all(workers);
}

export interface CollectionRef {
  chain: string;
  contract: string;
}

/** Resolves contracts to real OpenSea collection URLs, 20 at a time. */
export async function resolveCollectionLinks(
  items: CollectionRef[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};

  for (let i = 0; i < items.length; i += 20) {
    const batch = items.slice(i, i + 20);
    try {
      const res = await post<{ links: Record<string, string | null>; enabled: boolean }>(
        '/api/collections/links',
        { items: batch },
      );
      if (!res.enabled) return out;
      Object.assign(out, res.links);
    } catch {
      // A failed batch just means those buttons stay hidden.
    }
  }
  return out;
}
