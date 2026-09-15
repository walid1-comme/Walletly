#!/usr/bin/env node
/**
 * Publish an allowlist CSV to the Walletly registry.
 *
 *   node scripts/publish-list.mjs \
 *     --api      https://manifest-api.walidx10.workers.dev \
 *     --token    YOUR_ADMIN_TOKEN \
 *     --slug     bullies-on-robinhood \
 *     --project  "Bullies on Robinhood" \
 *     --list     GTD \
 *     --chain    robinhood \
 *     --twitter  onchainbullies \
 *     --mint     2026-09-15 \
 *     --file     ./gtd.csv
 *
 * Column order in the CSV does not matter. The first 0x on a line is the
 * address, the next non-empty column becomes the tier.
 */

import { readFileSync } from 'node:fs';

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

function args() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    out[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  return out;
}

function parseCsv(text) {
  const seen = new Set();
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(ADDRESS_RE);
    if (!match) continue;
    const address = match[0].toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);
    const rest = line
      .replace(match[0], '')
      .split(/[,;\t]/)
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    entries.push({ address, tier: rest[0] ?? null });
  }
  return entries;
}

const a = args();
const missing = ['api', 'token', 'slug', 'project', 'list', 'file'].filter((k) => !a[k]);
if (missing.length) {
  console.error(`Missing required flags: ${missing.map((m) => `--${m}`).join(', ')}`);
  process.exit(1);
}

const entries = parseCsv(readFileSync(a.file, 'utf8'));
if (!entries.length) {
  console.error('No valid addresses found in that file.');
  process.exit(1);
}

console.log(`Parsed ${entries.length.toLocaleString()} unique addresses from ${a.file}`);

const res = await fetch(`${a.api.replace(/\/$/, '')}/api/lists`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-token': a.token },
  body: JSON.stringify({
    projectSlug: a.slug,
    projectName: a.project,
    listName: a.list,
    chain: a.chain,
    twitter: a.twitter,
    mintDate: a.mint,
    entries,
  }),
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Publish failed: ${body.error ?? res.status}`);
  process.exit(1);
}

console.log(`Published "${a.list}" for ${a.project}. ${(body.inserted ?? 0).toLocaleString()} rows live.`);
