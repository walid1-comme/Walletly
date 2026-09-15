import { CHAIN_BY_ID, type Chain } from './chains';
import type { Env, TokenHolding } from './types';

const CG = 'https://api.coingecko.com/api/v3';
const PRICE_TTL = 30; // seconds
const BATCH = 60; // contracts per request

interface PriceEntry {
  usd?: number;
  usd_24h_change?: number;
}

function headers(env: Env): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json' };
  if (env.COINGECKO_API_KEY) h['x-cg-demo-api-key'] = env.COINGECKO_API_KEY;
  return h;
}

async function cgFetch<T>(env: Env, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${CG}${path}`, { headers: headers(env) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function nativePrices(
  env: Env,
  chains: Chain[],
  fresh = false,
): Promise<Record<string, PriceEntry>> {
  const ids = [...new Set(chains.map((c) => c.nativeCgId))];
  if (!ids.length) return {};

  const cacheKey = `px:native:${ids.sort().join(',')}`;
  if (!fresh) {
    const hit = await env.CACHE?.get(cacheKey, 'json').catch(() => null);
    if (hit) return hit as Record<string, PriceEntry>;
  }

  const data =
    (await cgFetch<Record<string, PriceEntry>>(
      env,
      `/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`,
    )) ?? {};

  await env.CACHE?.put(cacheKey, JSON.stringify(data), { expirationTtl: PRICE_TTL })
    .catch(() => undefined);
  return data;
}

async function tokenPrices(
  env: Env,
  platform: string,
  contracts: string[],
): Promise<Record<string, PriceEntry>> {
  const out: Record<string, PriceEntry> = {};
  const unique = [...new Set(contracts)];

  for (let i = 0; i < unique.length; i += BATCH) {
    const slice = unique.slice(i, i + BATCH);
    const cacheKey = `px:${platform}:${slice[0]}:${slice.length}`;
    const hit = (await env.CACHE?.get(cacheKey, 'json').catch(() => null)) as Record<string, PriceEntry> | null;

    if (hit) {
      Object.assign(out, hit);
      continue;
    }

    const data =
      (await cgFetch<Record<string, PriceEntry>>(
        env,
        `/simple/token_price/${platform}?contract_addresses=${slice.join(',')}&vs_currencies=usd&include_24hr_change=true`,
      )) ?? {};

    const lowered: Record<string, PriceEntry> = {};
    for (const [k, v] of Object.entries(data)) lowered[k.toLowerCase()] = v;

    Object.assign(out, lowered);
    await env.CACHE?.put(cacheKey, JSON.stringify(lowered), { expirationTtl: PRICE_TTL })
      .catch(() => undefined);
  }
  return out;
}

/**
 * Fills price, usd and change24h on every holding.
 * CoinGecko wins where it has the token; the explorer rate is the fallback.
 */
export async function enrichPrices(
  env: Env,
  chains: Chain[],
  tokens: TokenHolding[],
  fresh = false,
): Promise<void> {
  const native = await nativePrices(env, chains, fresh);

  const byPlatform = new Map<string, string[]>();
  for (const t of tokens) {
    if (t.native || t.spam) continue;
    const chain = CHAIN_BY_ID.get(t.chain);
    if (!chain?.cgPlatform) continue;
    const list = byPlatform.get(chain.cgPlatform) ?? [];
    list.push(t.contract);
    byPlatform.set(chain.cgPlatform, list);
  }

  const platformPrices = new Map<string, Record<string, PriceEntry>>();
  for (const [platform, contracts] of byPlatform) {
    platformPrices.set(platform, await tokenPrices(env, platform, contracts));
  }

  for (const t of tokens) {
    const chain = CHAIN_BY_ID.get(t.chain);
    if (!chain) continue;

    if (t.native) {
      const p = native[chain.nativeCgId];
      t.price = p?.usd ?? t.price;
      t.change24h = p?.usd_24h_change ?? null;
    } else if (chain.cgPlatform) {
      const p = platformPrices.get(chain.cgPlatform)?.[t.contract];
      if (p?.usd) {
        t.price = p.usd;
        t.change24h = p.usd_24h_change ?? null;
      }
    }

    t.usd = t.price ? t.quantity * t.price : null;
  }
}
