import type { Chain } from './chains';
import type { Env, NftHolding, TokenHolding } from './types';
import { isSpam } from './spam';

const MAX_PAGES = 3;
const CACHE_TTL = 30; // seconds

interface RawToken {
  token?: {
    address?: string;
    address_hash?: string;
    name?: string;
    symbol?: string;
    decimals?: string | number;
    type?: string;
    icon_url?: string | null;
    exchange_rate?: string | null;
  };
  value?: string;
}

interface RawNftCollection {
  token?: {
    address?: string;
    address_hash?: string;
    name?: string;
    type?: string;
    icon_url?: string | null;
  };
  amount?: string | number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads a Blockscout REST endpoint.
 *
 * Deliberately uses each chain's own public instance rather than the Pro API:
 * the Pro API is an Etherscan-style RPC at a different URL shape, while these
 * REST paths work with no key at all. Some explorers (Robinhood Chain in
 * particular) sit behind bot protection and reject requests carrying no
 * browser identity, which Workers omit by default.
 */
async function bs<T>(env: Env, chain: Chain, path: string): Promise<T | null> {
  const url = `${chain.explorer}/api/v2${path}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'Mozilla/5.0 (compatible; Walletly/1.0)',
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status >= 500) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${chain.id} -> HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(300 * (attempt + 1));
    }
  }
  return null;
}

function qs(params: Record<string, unknown> | null | undefined): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `&${s}` : '';
}

/** Walks Blockscout's next_page_params until exhausted or MAX_PAGES. */
async function paginate<T>(
  env: Env,
  chain: Chain,
  basePath: string,
  firstQuery = '',
): Promise<T[]> {
  const items: T[] = [];
  let next: Record<string, unknown> | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const suffix: string = page === 0 ? firstQuery : `${firstQuery}${qs(next)}`;
    const path: string = suffix ? `${basePath}?${suffix.replace(/^&/, '')}` : basePath;
    const body: { items?: T[]; next_page_params?: Record<string, unknown> | null } | null =
      await bs<{ items?: T[]; next_page_params?: Record<string, unknown> | null }>(env, chain, path);

    if (!body?.items?.length) break;
    items.push(...body.items);
    next = body.next_page_params ?? null;
    if (!next) break;
  }
  return items;
}

export interface WalletChainResult {
  tokens: TokenHolding[];
  nfts: NftHolding[];
}

export async function fetchWalletChain(
  env: Env,
  chain: Chain,
  wallet: string,
  fresh = false,
): Promise<{ data: WalletChainResult; cached: boolean }> {
  const cacheKey = `wc:${chain.id}:${wallet}`;
  if (!fresh) {
    const hit = await env.CACHE?.get(cacheKey, 'json').catch(() => null);
    if (hit) return { data: hit as WalletChainResult, cached: true };
  }

  const [info, rawTokens, rawNfts] = await Promise.all([
    bs<{ coin_balance?: string; exchange_rate?: string | null }>(env, chain, `/addresses/${wallet}`),
    paginate<RawToken>(env, chain, `/addresses/${wallet}/token-balances`).catch(() => [] as RawToken[]),
    paginate<RawNftCollection>(env, chain, `/addresses/${wallet}/nft/collections`, 'type=ERC-721,ERC-1155')
      .catch(() => [] as RawNftCollection[]),
  ]);

  const tokens: TokenHolding[] = [];

  if (info?.coin_balance) {
    const quantity = Number(info.coin_balance) / 1e18;
    if (quantity > 0) {
      const fallback = Number(info.exchange_rate ?? 0) || null;
      tokens.push({
        key: `${chain.id}:native`,
        chain: chain.id,
        contract: 'native',
        name: `${chain.name} ${chain.symbol}`,
        symbol: chain.symbol,
        decimals: 18,
        icon: null,
        quantity,
        price: fallback,
        usd: fallback ? quantity * fallback : null,
        change24h: null,
        native: true,
        spam: false,
        wallet,
      });
    }
  }

  for (const raw of rawTokens) {
    const t = raw.token;
    if (!t || t.type !== 'ERC-20') continue;
    const contract = (t.address ?? t.address_hash ?? '').toLowerCase();
    if (!contract) continue;

    const decimals = Number(t.decimals ?? 18);
    const quantity = Number(raw.value ?? 0) / 10 ** (Number.isFinite(decimals) ? decimals : 18);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const fallback = Number(t.exchange_rate ?? 0) || null;
    const name = t.name ?? t.symbol ?? 'Unknown token';
    const symbol = t.symbol ?? '?';

    tokens.push({
      key: `${chain.id}:${contract}`,
      chain: chain.id,
      contract,
      name,
      symbol,
      decimals,
      icon: t.icon_url ?? null,
      quantity,
      price: fallback,
      usd: fallback ? quantity * fallback : null,
      change24h: null,
      native: false,
      spam: isSpam(name, symbol, quantity),
      wallet,
    });
  }

  const nfts: NftHolding[] = [];
  for (const raw of rawNfts) {
    const t = raw.token;
    const count = Number(raw.amount ?? 0);
    if (!t || !count) continue;
    const contract = (t.address ?? t.address_hash ?? '').toLowerCase();
    if (!contract) continue;

    nfts.push({
      chain: chain.id,
      contract,
      name: t.name ?? 'Unnamed collection',
      standard: t.type ?? 'ERC-721',
      icon: t.icon_url ?? null,
      count,
      wallet,
    });
  }

  const data: WalletChainResult = { tokens, nfts };
  await env.CACHE?.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL })
    .catch(() => undefined);

  return { data, cached: false };
}
