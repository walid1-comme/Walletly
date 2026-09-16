# Walletly by Walid

Every wallet. Every chain. One page.

Walletly reads unlimited wallets across seven EVM chains and puts everything on a single page: balances, tokens, NFT collections, and which allowlists you are on. It never asks for a private key, a seed phrase, a wallet connection, a signature or an approval.

## Start here

| If you want to | Read |
|---|---|
| Set up accounts, plans and payments | `ACCOUNTS.md` |
| Launch it and find customers | `MARKETING.md` |
| Understand or change the code | this file |

## What it does

- **Unlimited wallets.** The browser splits large accounts into small requests automatically, so there is no cap.
- **Coverage matrix.** Wallets down the side, chains across the top, running totals in the margin. Cells shade darker where value concentrates.
- **Groups.** Create a group, then file wallets into it. Read cold storage apart from the wallets you mint with.
- **Spam filtering.** Scam airdrops are detected by heuristic and excluded from your total, behind a toggle.
- **Real prices.** CoinGecko by contract address with 24h change, falling back to the explorer's own rate.
- **Allowlist checker.** Private lists you paste stay in your browser. The shared registry checks every wallet against every published project in one request.
- **Change over time.** 1D, 1W, 1M and 1Y per wallet, recorded locally on every scan.
- **Observations.** Concentration risk, idle wallets, collections split across wallets, dust totals.
- **Exports.** CSV for tokens, NFTs and allowlist hits.
- **Accounts and plans.** Email sign-up with password recovery, $5/month or $12/3 months.

## Architecture

```
web/       Vite + React + TypeScript. Deploys to GitHub Pages or Cloudflare Pages.
worker/    Cloudflare Worker (Hono). Holds every API key, caches in KV, throttles upstream.
supabase/  Postgres for the allowlist registry and for accounts.
scripts/   CLI to publish an allowlist CSV to the registry.
```

```
Browser  →  Cloudflare Worker  →  Blockscout / CoinGecko / OpenSea / Supabase
         →  Supabase Auth (accounts only)
```

The frontend never holds a secret. The Supabase anon key is public by design and row level security is what protects the data.

## Setup

### 1. Keys

| Service | Where | Free tier |
|---|---|---|
| Cloudflare Workers | dash.cloudflare.com | 100k requests/day |
| Supabase | supabase.com | 500 MB database |
| CoinGecko Demo | coingecko.com/en/api | ~30 calls/min, 10k/month |
| OpenSea | opensea.io/settings/developer | needed only for collection links |

No Blockscout key is required. The public REST API works without one, and the Pro API uses a different URL shape entirely.

### 2. Database

Supabase SQL Editor, run in this order:

1. `supabase/schema.sql` — the allowlist registry
2. `supabase/auth-schema.sql` — accounts and plans

The important design rule lives in the first file: `entries` has row level security with no read policy at all. The only way in is `check_allowlists()`, which returns rows solely for addresses the caller already supplied. A project's 16,000-wallet list cannot be enumerated or scraped, even by someone holding your anon key. That guarantee is what makes a project willing to hand over their list.

### 3. Worker

```bash
cd worker
npm install
npx wrangler kv namespace create CACHE     # paste the id into wrangler.toml
npx wrangler secret put COINGECKO_API_KEY
npx wrangler secret put OPENSEA_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put ADMIN_TOKEN         # any long random string
npm run deploy
```

Then set `ALLOWED_ORIGINS` in `wrangler.toml` to your frontend origin so nobody else burns your quota.

Check it with `https://YOUR-WORKER.workers.dev/api/health`. You want `blockscout: public`, and `on` for the services you configured.

### 4. Frontend

```bash
cd web
npm install
cp .env.example .env     # fill in VITE_API_URL and the two Supabase values
npm run dev              # http://localhost:5173
npm run build            # dist/
```

Leave the Supabase values blank to run the app open with no sign-in screen.

### 5. Publish a list

```bash
node scripts/publish-list.mjs \
  --api https://YOUR-WORKER.workers.dev \
  --token "$ADMIN_TOKEN" \
  --slug bullies-on-robinhood \
  --project "Bullies on Robinhood" \
  --list GTD \
  --chain robinhood \
  --file ./gtd.csv
```

Re-running with the same project and list name replaces the contents, so uploads are idempotent.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Which upstreams are configured |
| GET | `/api/chains` | Supported chains |
| POST | `/api/portfolio` | `{ addresses, chains, fresh }`, max 50 per request |
| POST | `/api/collections/links` | `{ items: [{ chain, contract }] }`, max 20 |
| POST | `/api/allowlist/check` | Returns matches only for the supplied addresses |
| GET | `/api/projects` | Public project directory |
| POST | `/api/lists` | Requires `x-admin-token` |

## Adding a chain

Add an entry to `worker/src/chains.ts`. You need the EVM chain id and, optionally, the CoinGecko asset platform id for token prices. Chains without one still work; they fall back to the explorer's exchange rate. Add the explorer to `web/src/lib/links.ts` too. The frontend picks up new chains automatically from `/api/chains`.

## Known limits and deliberate choices

- **NFT floor prices are not shown.** Coverage outside blue chips is poor and a wrong floor damages trust more than a missing one.
- **1M and 1Y start empty.** Nothing on-chain says what a wallet was worth last month; that needs an archive indexer. Walletly records values locally on every scan, so the windows fill in over time. A window without enough history shows a dash rather than a fake zero.
- **Solana is not supported.** Blockscout is EVM only. Adding it means a second provider such as Helius and a second code path.
- **OpenSea links need a key.** There is no public URL mapping a contract to a collection page, so the Worker resolves real slugs through the API instead of guessing.
- **Pagination stops at 3 pages** per endpoint, roughly 150 tokens or collections per wallet per chain. This keeps each Worker invocation inside Cloudflare's 50-subrequest limit on the free plan.
- **Wallet connection is absent on purpose.** Not connecting is the product.
