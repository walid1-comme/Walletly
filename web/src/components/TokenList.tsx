import { Blank, Ledger, LedgerRow } from './Ledger';
import { Copy } from './Copy';
import { dexscreener, explorerToken } from '../lib/links';
import { pct, qty, short, usd } from '../lib/format';
import type { AggregatedToken, Chain, SortKey } from '../types';

interface Props {
  tokens: AggregatedToken[];
  chains: Map<string, Chain>;
  scanned: boolean;
  showSpam: boolean;
  hideDust: boolean;
  spamCount: number;
  search: string;
  sort: SortKey;
  total: number;
  onSearch: (value: string) => void;
  onSort: (value: SortKey) => void;
  onToggleSpam: () => void;
  onToggleDust: () => void;
  onExport: () => void;
}

export function TokenList({
  tokens, chains, scanned, showSpam, hideDust, spamCount, search, sort, total,
  onSearch, onSort, onToggleSpam, onToggleDust, onExport,
}: Props) {
  return (
    <>
      <div className="opts">
        <input
          type="text"
          className="find"
          value={search}
          placeholder="Find a token"
          onChange={(e) => onSearch(e.target.value)}
        />
        <select
          className="picker"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          aria-label="Sort tokens"
        >
          <option value="value">Most valuable</option>
          <option value="change">Biggest mover</option>
          <option value="name">Name</option>
          <option value="spread">Most wallets</option>
        </select>
        <label className="opt">
          <input type="checkbox" checked={hideDust} onChange={onToggleDust} />
          Hide under $1
        </label>
        <label className="opt">
          <input type="checkbox" checked={showSpam} onChange={onToggleSpam} />
          Show spam{spamCount > 0 ? ` (${spamCount})` : ''}
        </label>
        <button type="button" className="small" style={{ marginLeft: 'auto' }} onClick={onExport}>
          Export CSV
        </button>
      </div>

      {!tokens.length ? (
        <Blank title={scanned ? 'Nothing matches' : 'Nothing scanned yet'}>
          {scanned
            ? 'Loosen the filters above, or turn on more chains in Settings.'
            : 'Add a wallet, then run a scan.'}
        </Blank>
      ) : (
        <Ledger>
          {tokens.map((t) => {
            const chain = chains.get(t.chain);
            const explorer = explorerToken(t.chain, t.contract);
            const dex = dexscreener(t.contract);
            const share = total > 0 && t.usd ? (t.usd / total) * 100 : 0;

            return (
              <LedgerRow
                key={t.key}
                icon={t.icon ? <img src={t.icon} alt="" loading="lazy" /> : (t.symbol || '?').slice(0, 3)}
                title={
                  <>
                    {t.name}
                    {chain && <span className="tag" style={{ color: chain.color }}>{chain.name}</span>}
                    {t.wallets.size > 1 && <span className="tag">{t.wallets.size} wallets</span>}
                    {t.spam && <span className="tag flag">Likely spam</span>}
                  </>
                }
                sub={
                  <>
                    {t.symbol} {t.native ? 'native coin' : short(t.contract)}
                    {!t.native && <Copy value={t.contract} title="Copy the contract address" />}
                    {share >= 0.5 && (
                      <span className="share">
                        <span className="share-bar">
                          <i style={{ width: `${Math.min(100, share)}%` }} />
                        </span>
                        {share.toFixed(share >= 10 ? 0 : 1)}% of portfolio
                      </span>
                    )}
                  </>
                }
                actions={
                  (dex || explorer) ? (
                    <>
                      {dex && <a href={dex} target="_blank" rel="noreferrer">Chart</a>}
                      {explorer && <a href={explorer} target="_blank" rel="noreferrer">Explorer</a>}
                    </>
                  ) : null
                }
                figure={
                  <>
                    <div className="big">{t.usd ? usd(t.usd) : <span className="unpriced">No price</span>}</div>
                    <div className="small">{qty(t.quantity)} {t.symbol}</div>
                    {t.change24h !== null && (
                      <div className={`small ${t.change24h >= 0 ? 'gain' : 'loss'}`}>{pct(t.change24h)}</div>
                    )}
                  </>
                }
              />
            );
          })}
        </Ledger>
      )}
    </>
  );
}
