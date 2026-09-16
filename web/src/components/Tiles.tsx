import { usd } from '../lib/format';
import type { Chain, TokenHolding } from '../types';

interface Props {
  total: number;
  delta: number | null;
  deltaLabel: string;
  wallets: number;
  activeWallets: number;
  nftCount: number;
  collections: number;
  chains: Chain[];
  tokens: TokenHolding[];
}

/**
 * The glance layer. Four figures worth knowing before reading anything, plus
 * one bar showing how value divides between chains, which is the question a
 * multi-chain holder asks first.
 */
export function Tiles({
  total, delta, deltaLabel, wallets, activeWallets, nftCount, collections, chains, tokens,
}: Props) {
  const perChain = chains
    .map((c) => ({
      chain: c,
      value: tokens.filter((t) => t.chain === c.id && !t.spam).reduce((s, t) => s + (t.usd ?? 0), 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const sum = perChain.reduce((s, r) => s + r.value, 0) || 1;

  return (
    <>
      <div className="tiles">
        <div className="tile money">
          <div className="k">Total value</div>
          <div className="v">{usd(total)}</div>
          <div className="s">
            {delta === null ? (
              'priced holdings'
            ) : (
              <span className={delta >= 0 ? 'gain' : 'loss'}>
                {delta >= 0 ? '+' : '−'}{usd(Math.abs(delta))} {deltaLabel}
              </span>
            )}
          </div>
        </div>

        <div className="tile wal">
          <div className="k">Wallets</div>
          <div className="v">{wallets}</div>
          <div className="s">{activeWallets} holding something</div>
        </div>

        <div className="tile nft">
          <div className="k">NFTs held</div>
          <div className="v">{nftCount}</div>
          <div className="s">across {collections} collection{collections === 1 ? '' : 's'}</div>
        </div>

        <div className="tile chainy">
          <div className="k">Chains in use</div>
          <div className="v">{perChain.length}</div>
          <div className="s">{perChain.length ? `${perChain[0].chain.name} leads` : 'nothing found yet'}</div>
        </div>
      </div>

      {perChain.length > 1 && (
        <>
          <div className="split">
            {perChain.map((r) => (
              <i
                key={r.chain.id}
                style={{ width: `${(r.value / sum) * 100}%`, background: r.chain.color }}
                title={`${r.chain.name} ${usd(r.value)}`}
              />
            ))}
          </div>
          <div className="splitkey">
            {perChain.map((r) => (
              <span key={r.chain.id}>
                <i style={{ background: r.chain.color }} />
                {r.chain.name} {((r.value / sum) * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
