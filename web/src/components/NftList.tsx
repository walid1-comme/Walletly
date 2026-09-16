import { useEffect, useState } from 'react';
import { resolveCollectionLinks } from '../api';
import { Blank, Ledger, LedgerRow } from './Ledger';
import { Copy } from './Copy';
import { explorerToken } from '../lib/links';
import { short } from '../lib/format';
import type { AggregatedNft, Chain, NftSortKey } from '../types';

interface Props {
  nfts: AggregatedNft[];
  chains: Map<string, Chain>;
  scanned: boolean;
  search: string;
  sort: NftSortKey;
  onSearch: (value: string) => void;
  onSort: (value: NftSortKey) => void;
  onExport: () => void;
}

/** Resolved OpenSea URLs live for the whole session, keyed chain:contract. */
const linkCache = new Map<string, string | null>();

export function NftList({ nfts, chains, scanned, search, sort, onSearch, onSort, onExport }: Props) {
  const [links, setLinks] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const missing = nfts
      .map((n) => ({ chain: n.chain, contract: n.contract }))
      .filter((r) => !linkCache.has(`${r.chain}:${r.contract}`))
      .slice(0, 60);

    if (!missing.length) {
      setLinks(Object.fromEntries(linkCache));
      return;
    }

    let cancelled = false;
    void resolveCollectionLinks(missing).then((resolved) => {
      for (const ref of missing) {
        const key = `${ref.chain}:${ref.contract}`;
        linkCache.set(key, resolved[key] ?? null);
      }
      if (!cancelled) setLinks(Object.fromEntries(linkCache));
    });

    return () => {
      cancelled = true;
    };
  }, [nfts]);

  return (
    <>
      <div className="opts">
        <input
          type="text"
          className="find"
          value={search}
          placeholder="Find a collection"
          onChange={(e) => onSearch(e.target.value)}
        />
        <select
          className="picker"
          value={sort}
          onChange={(e) => onSort(e.target.value as NftSortKey)}
          aria-label="Sort collections"
        >
          <option value="count">Most held</option>
          <option value="name">Name</option>
          <option value="spread">Most wallets</option>
        </select>
        <button type="button" className="small" style={{ marginLeft: 'auto' }} onClick={onExport}>
          Export CSV
        </button>
      </div>

      {!nfts.length ? (
        <Blank title={scanned ? 'No collections here' : 'Nothing scanned yet'}>
          {scanned ? 'Nothing matches on the chains you scanned.' : 'Add a wallet, then run a scan.'}
        </Blank>
      ) : (
        <Ledger>
          {nfts.map((n) => {
            const chain = chains.get(n.chain);
            const key = `${n.chain}:${n.contract}`;
            const opensea = links[key];
            const pending = !(key in links);
            const explorer = explorerToken(n.chain, n.contract);

            return (
              <LedgerRow
                key={key}
                icon={n.icon ? <img src={n.icon} alt="" loading="lazy" /> : n.name.slice(0, 2)}
                title={
                  <>
                    {n.name}
                    {chain && <span className="tag" style={{ color: chain.color }}>{chain.name}</span>}
                    {n.wallets.size > 1 && <span className="tag">{n.wallets.size} wallets</span>}
                  </>
                }
                sub={
                  <>
                    {short(n.contract)} {n.standard}
                    <Copy value={n.contract} title="Copy the contract address" />
                  </>
                }
                actions={
                  <>
                    {opensea ? (
                      <a className="buy" href={opensea} target="_blank" rel="noreferrer">
                        View on OpenSea
                      </a>
                    ) : pending ? (
                      <span className="pending">Finding listing</span>
                    ) : (
                      <span className="pending">Not listed on OpenSea</span>
                    )}
                    {explorer && <a href={explorer} target="_blank" rel="noreferrer">Explorer</a>}
                  </>
                }
                figure={
                  <>
                    <div className="big nftmark">{n.count}</div>
                    <div className="small">held</div>
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
