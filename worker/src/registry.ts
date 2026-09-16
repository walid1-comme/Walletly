import type { AllowlistMatch, Env } from './types';

function assertConfigured(env: Env): { url: string; key: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error('Registry is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
  }
  return { url: env.SUPABASE_URL.replace(/\/$/, ''), key: env.SUPABASE_SERVICE_KEY };
}

async function rpc<T>(env: Env, fn: string, body: unknown): Promise<T> {
  const { url, key } = assertConfigured(env);
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Registry error ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

interface RawMatch {
  address: string;
  project_name: string;
  project_slug: string;
  list_name: string;
  tier: string | null;
  mint_date: string | null;
  verified: boolean;
}

/**
 * Checks addresses against every published list. The RPC only ever returns
 * rows for the addresses passed in, so a caller can never enumerate a
 * project's list. That guarantee is why projects are willing to submit one.
 */
export async function checkAllowlists(env: Env, addresses: string[]): Promise<AllowlistMatch[]> {
  const rows = await rpc<RawMatch[]>(env, 'check_allowlists', {
    p_addresses: addresses.map((a) => a.toLowerCase()),
  });
  return (rows ?? []).map((r) => ({
    address: r.address,
    projectName: r.project_name,
    projectSlug: r.project_slug,
    listName: r.list_name,
    tier: r.tier,
    mintDate: r.mint_date,
    verified: r.verified,
  }));
}

export interface PublishInput {
  projectSlug: string;
  projectName: string;
  chain?: string;
  twitter?: string;
  mintDate?: string;
  listName: string;
  entries: { address: string; tier?: string | null }[];
}

export async function publishList(
  env: Env,
  input: PublishInput,
): Promise<{ listId: string; inserted: number }> {
  const result = await rpc<{ list_id: string; inserted: number }[]>(env, 'publish_list', {
    p_project_slug: input.projectSlug,
    p_project_name: input.projectName,
    p_chain: input.chain ?? null,
    p_twitter: input.twitter ?? null,
    p_mint_date: input.mintDate ?? null,
    p_list_name: input.listName,
    p_entries: input.entries.map((e) => ({ address: e.address.toLowerCase(), tier: e.tier ?? null })),
  });
  const row = Array.isArray(result)
    ? result[0]
    : (result as unknown as { list_id: string; inserted: number });
  return { listId: row?.list_id ?? '', inserted: row?.inserted ?? 0 };
}

export async function listProjects(env: Env): Promise<unknown[]> {
  const { url, key } = assertConfigured(env);
  const res = await fetch(
    `${url}/rest/v1/projects?select=slug,name,chain,twitter,mint_date,verified&order=created_at.desc&limit=200`,
    { headers: { apikey: key, authorization: `Bearer ${key}` } },
  );
  if (!res.ok) throw new Error(`Registry error ${res.status}`);
  return (await res.json()) as unknown[];
}
