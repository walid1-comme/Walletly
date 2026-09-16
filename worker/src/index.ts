import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CHAINS, resolveChains } from './chains';
import { fetchWalletChain } from './blockscout';
import { enrichPrices } from './prices';
import { resolveCollection } from './opensea';
import { checkAllowlists, listProjects, publishList } from './registry';
import type { ChainStatus, Env, NftHolding, PortfolioResponse, TokenHolding } from './types';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/** Per request, not per account. The browser splits large accounts itself,
 *  so there is no limit on how many wallets a person can track. */
const MAX_WALLETS = 50;
const MAX_CHAINS = 10;
const CONCURRENCY = 5;

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim());
  return cors({
    origin: (origin) => {
      if (allowed.includes('*')) return origin ?? '*';
      return allowed.includes(origin) ? origin : null;
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-admin-token'],
    maxAge: 86400,
  })(c, next);
});

/** Bounded worker pool, so we stay inside provider rate limits. */
async function pool<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      results[index] = await jobs[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

function normaliseAddresses(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const match = raw.trim().match(/0x[a-fA-F0-9]{40}/);
    if (!match) continue;
    const addr = match[0].toLowerCase();
    if (ADDRESS_RE.test(addr)) seen.add(addr);
  }
  return [...seen];
}

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    blockscout: 'public',
    prices: c.env.COINGECKO_API_KEY ? 'coingecko-demo' : 'coingecko-public',
    opensea: c.env.OPENSEA_API_KEY ? 'on' : 'off',
    registry: c.env.SUPABASE_URL ? 'on' : 'off',
    time: new Date().toISOString(),
  }),
);

app.get('/api/chains', (c) =>
  c.json(
    CHAINS.map(({ id, chainId, name, symbol, color, explorer, default: def }) => ({
      id, chainId, name, symbol, color, explorer, default: def,
    })),
  ),
);

app.post('/api/portfolio', async (c) => {
  let body: { addresses?: unknown; chains?: unknown; fresh?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Send a JSON body with an addresses array.' }, 400);
  }

  const wallets = normaliseAddresses(body.addresses);
  if (!wallets.length) return c.json({ error: 'No valid 0x addresses in the request.' }, 400);
  if (wallets.length > MAX_WALLETS) {
    return c.json(
      { error: `Send at most ${MAX_WALLETS} wallets per request. The app splits large accounts automatically.` },
      400,
    );
  }

  const chainIds = Array.isArray(body.chains)
    ? (body.chains.filter((x) => typeof x === 'string') as string[]).slice(0, MAX_CHAINS)
    : undefined;
  const chains = resolveChains(chainIds);
  const fresh = body.fresh === true;

  const tokens: TokenHolding[] = [];
  const nfts: NftHolding[] = [];
  const status: ChainStatus[] = [];

  const jobs = wallets.flatMap((wallet) =>
    chains.map((chain) => async () => {
      try {
        const { data, cached } = await fetchWalletChain(c.env, chain, wallet, fresh);
        tokens.push(...data.tokens);
        nfts.push(...data.nfts);
        status.push({ chain: chain.id, wallet, ok: true, cached });
      } catch (err) {
        status.push({
          chain: chain.id,
          wallet,
          ok: false,
          cached: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }),
  );

  await pool(jobs, CONCURRENCY);
  await enrichPrices(c.env, chains, tokens, fresh).catch(() => undefined);

  const payload: PortfolioResponse = { tokens, nfts, status, fetchedAt: new Date().toISOString() };
  return c.json(payload);
});

/**
 * Batch resolver: contracts in, OpenSea collection URLs out. Batched because
 * a wallet can hold 50+ collections and one request each would be both slow
 * and rude to OpenSea.
 */
app.post('/api/collections/links', async (c) => {
  if (!c.env.OPENSEA_API_KEY) return c.json({ links: {}, enabled: false });

  let body: { items?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Send { items: [{ chain, contract }] }' }, 400);
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((i): i is { chain: string; contract: string } => {
      const o = i as { chain?: unknown; contract?: unknown };
      return typeof o.chain === 'string' && typeof o.contract === 'string';
    })
    .slice(0, 20);

  const links: Record<string, string | null> = {};
  const jobs = items.map((item) => async () => {
    const link = await resolveCollection(c.env, item.chain, item.contract.toLowerCase());
    links[`${item.chain}:${item.contract.toLowerCase()}`] = link.url;
  });

  await pool(jobs, 4);
  return c.json({ links, enabled: true });
});

app.post('/api/allowlist/check', async (c) => {
  if (!c.env.SUPABASE_URL) return c.json({ matches: [], registry: false });

  let body: { addresses?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Send a JSON body with an addresses array.' }, 400);
  }

  const addresses = normaliseAddresses(body.addresses);
  if (!addresses.length) return c.json({ matches: [], registry: true });

  try {
    return c.json({ matches: await checkAllowlists(c.env, addresses), registry: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Registry unavailable' }, 502);
  }
});

app.get('/api/projects', async (c) => {
  if (!c.env.SUPABASE_URL) return c.json([]);
  try {
    return c.json(await listProjects(c.env));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Registry unavailable' }, 502);
  }
});

app.post('/api/lists', async (c) => {
  const token = c.req.header('x-admin-token');
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body.' }, 400);
  }

  const projectSlug = String(body.projectSlug ?? '').trim().toLowerCase();
  const projectName = String(body.projectName ?? '').trim();
  const listName = String(body.listName ?? '').trim();
  const rawEntries = Array.isArray(body.entries) ? body.entries : [];

  if (!projectSlug || !projectName || !listName) {
    return c.json({ error: 'projectSlug, projectName and listName are required.' }, 400);
  }

  const entries: { address: string; tier: string | null }[] = [];
  const seen = new Set<string>();
  for (const raw of rawEntries) {
    const line = typeof raw === 'string'
      ? { address: raw, tier: null }
      : (raw as { address?: string; tier?: string });
    const match = String(line.address ?? '').match(/0x[a-fA-F0-9]{40}/);
    if (!match) continue;
    const address = match[0].toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);
    entries.push({ address, tier: line.tier ? String(line.tier).slice(0, 40) : null });
  }

  if (!entries.length) return c.json({ error: 'No valid addresses in entries.' }, 400);
  if (entries.length > 50_000) return c.json({ error: 'Maximum 50,000 addresses per list.' }, 400);

  try {
    const result = await publishList(c.env, {
      projectSlug,
      projectName,
      chain: typeof body.chain === 'string' ? body.chain : undefined,
      twitter: typeof body.twitter === 'string' ? body.twitter : undefined,
      mintDate: typeof body.mintDate === 'string' ? body.mintDate : undefined,
      listName,
      entries,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Publish failed' }, 502);
  }
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
