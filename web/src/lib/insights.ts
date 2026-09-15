import type { AggregatedNft, AggregatedToken, NftHolding, TokenHolding, Wallet } from '../types';

export interface Insight {
  id: string;
  kind: 'risk' | 'tidy' | 'note';
  headline: string;
  detail: string;
}

const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(2)}`;

/**
 * Observations you can only make when every wallet is visible at once.
 * All computed locally from data already fetched, so there is no extra cost
 * and nothing to configure.
 */
export function buildInsights(
  wallets: Wallet[],
  tokens: TokenHolding[],
  nfts: NftHolding[],
  aggTokens: AggregatedToken[],
  aggNfts: AggregatedNft[],
): Insight[] {
  const out: Insight[] = [];
  const total = aggTokens.filter((t) => !t.spam).reduce((s, t) => s + (t.usd ?? 0), 0);
  if (!wallets.length) return out;

  const perWallet = new Map<string, number>();
  for (const t of tokens) {
    if (t.spam) continue;
    perWallet.set(t.wallet, (perWallet.get(t.wallet) ?? 0) + (t.usd ?? 0));
  }

  const ranked = [...perWallet.entries()].sort((a, b) => b[1] - a[1]);
  if (total > 0 && ranked.length > 1) {
    const [addr, value] = ranked[0];
    const share = (value / total) * 100;
    if (share >= 60) {
      const name = wallets.find((w) => w.address === addr)?.label ?? 'one wallet';
      out.push({
        id: 'concentration',
        kind: 'risk',
        headline: `${share.toFixed(0)}% of your value sits in ${name}`,
        detail: `${money(value)} of ${money(total)}. One compromised key would take most of it.`,
      });
    }
  }

  if (total > 0 && aggTokens.length > 1) {
    const top = aggTokens.filter((t) => !t.spam)[0];
    if (top?.usd) {
      const share = (top.usd / total) * 100;
      if (share >= 70) {
        out.push({
          id: 'asset-concentration',
          kind: 'risk',
          headline: `${top.symbol} is ${share.toFixed(0)}% of everything you hold`,
          detail: `Your total moves almost exactly with the ${top.symbol} price.`,
        });
      }
    }
  }

  const withNfts = new Set(nfts.map((n) => n.wallet));
  const idle = wallets.filter(
    (w) => (perWallet.get(w.address) ?? 0) < 1 && !withNfts.has(w.address),
  );
  if (idle.length >= 2) {
    out.push({
      id: 'idle',
      kind: 'tidy',
      headline: `${idle.length} wallets hold nothing`,
      detail: `${idle.map((w) => w.label).slice(0, 4).join(', ')}${
        idle.length > 4 ? ' and others' : ''
      }. Group them or remove them to make scans faster.`,
    });
  }

  const split = aggNfts.filter((n) => n.wallets.size > 1);
  if (split.length) {
    const biggest = [...split].sort((a, b) => b.wallets.size - a.wallets.size)[0];
    out.push({
      id: 'split-collections',
      kind: 'tidy',
      headline: `${split.length} collection${split.length === 1 ? ' is' : 's are'} split across wallets`,
      detail: `${biggest.name} sits in ${biggest.wallets.size} of them. Consolidating makes listing and snapshots simpler.`,
    });
  }

  const dust = aggTokens.filter(
    (t) => !t.spam && !t.native && (t.usd ?? 0) > 0 && (t.usd ?? 0) < 1,
  );
  if (dust.length >= 5) {
    const sum = dust.reduce((s, t) => s + (t.usd ?? 0), 0);
    out.push({
      id: 'dust',
      kind: 'note',
      headline: `${dust.length} holdings are worth under a dollar`,
      detail: `${money(sum)} in total. Probably not worth the gas to move.`,
    });
  }

  return out.slice(0, 4);
}
