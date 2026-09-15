import type { Env } from './types';

/** OpenSea's own chain identifiers, keyed by our chain id. */
const OS_CHAIN: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  polygon: 'matic',
  ink: 'ink',
};

const SLUG_TTL = 60 * 60 * 24 * 14; // slugs effectively never change
const MISS_TTL = 60 * 60 * 6; // retry a miss later, in case it gets listed

export interface CollectionLink {
  url: string | null;
  slug: string | null;
  source: 'contract' | 'search' | 'none';
}

async function os<T>(env: Env, path: string): Promise<T | null> {
  if (!env.OPENSEA_API_KEY) return null;
  try {
    const res = await fetch(`https://api.opensea.io${path}`, {
      headers: { accept: 'application/json', 'x-api-key': env.OPENSEA_API_KEY },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Resolves a contract to its OpenSea collection page. There is no public URL
 * that maps a contract to a collection, so guessing one produces dead links.
 * The direct lookup is tried first, then search, which also covers chains
 * whose OpenSea identifier we do not hardcode.
 */
export async function resolveCollection(
  env: Env,
  chain: string,
  contract: string,
): Promise<CollectionLink> {
  const cacheKey = `os:${chain}:${contract}`;
  const hit = (await env.CACHE?.get(cacheKey, 'json').catch(() => null)) as CollectionLink | null;
  if (hit) return hit;

  let result: CollectionLink = { url: null, slug: null, source: 'none' };
  const osChain = OS_CHAIN[chain];

  if (osChain) {
    const direct = await os<{ collection?: string }>(env, `/api/v2/chain/${osChain}/contract/${contract}`);
    if (direct?.collection) {
      result = {
        url: `https://opensea.io/collection/${direct.collection}`,
        slug: direct.collection,
        source: 'contract',
      };
    }
  }

  if (!result.slug) {
    const search = await os<{
      results?: { type?: string; collection?: { collection?: string; slug?: string } }[];
    }>(env, `/api/v2/search?query=${contract}&asset_types=collection&limit=1`);

    const first = search?.results?.find((r) => r.type === 'collection')?.collection;
    const slug = first?.collection ?? first?.slug;
    if (slug) result = { url: `https://opensea.io/collection/${slug}`, slug, source: 'search' };
  }

  await env.CACHE?.put(cacheKey, JSON.stringify(result), {
    expirationTtl: result.slug ? SLUG_TTL : MISS_TTL,
  }).catch(() => undefined);

  return result;
}
