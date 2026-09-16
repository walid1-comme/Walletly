import { Copy } from './Copy';
import { explorerAddress } from '../lib/links';
import { short, usd } from '../lib/format';
import type { Chain, NftHolding, TokenHolding, Wallet } from '../types';

interface Props {
  wallets: Wallet[];
  chains: Chain[];
  tokens: TokenHolding[];
  nfts: NftHolding[];
  focus: string | null;
  onFocus: (address: string | null) => void;
}

/**
 * The page no single-wallet tracker can show you: every wallet against every
 * chain, with a running total in the margin. Shading is proportional to the
 * largest cell, so concentration reads before any number does.
 */
export function Matrix({ wallets, chains, tokens, nfts, focus, onFocus }: Props) {
  if (!wallets.length || !chains.length) return null;

  const value = new Map<string, number>();
  let max = 0;
  for (const t of tokens) {
    const key = `${t.wallet}|${t.chain}`;
    const next = (value.get(key) ?? 0) + (t.usd ?? 0);
    value.set(key, next);
    if (next > max) max = next;
  }

  const held = new Map<string, number>();
  for (const n of nfts) {
    const key = `${n.wallet}|${n.chain}`;
    held.set(key, (held.get(key) ?? 0) + n.count);
  }

  const grand = tokens.reduce((sum, t) => sum + (t.usd ?? 0), 0);

  return (
    <div className="sheet">
      <table className="sheet-t">
        <thead>
          <tr>
            <th>Wallet</th>
            {chains.map((c) => (
              <th key={c.id} style={{ color: c.color }}>{c.name}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((w) => {
            const rowTotal = chains.reduce(
              (s, c) => s + (value.get(`${w.address}|${c.id}`) ?? 0),
              0,
            );
            const on = focus === w.address;
            const link = explorerAddress('ethereum', w.address);

            return (
              <tr
                key={w.address}
                className={`pick${on ? ' on' : ''}`}
                onClick={() => onFocus(on ? null : w.address)}
              >
                <td>
                  <div className="who">
                    <b>{w.label}</b>
                    <span>
                      {short(w.address)}
                      <Copy value={w.address} title="Copy this address" />
                      {w.group && <em className="tag group">{w.group}</em>}
                    </span>
                  </div>
                </td>

                {chains.map((c) => {
                  const v = value.get(`${w.address}|${c.id}`) ?? 0;
                  const n = held.get(`${w.address}|${c.id}`) ?? 0;
                  const alpha = max > 0 ? Math.min(0.3, (v / max) * 0.3) : 0;
                  return (
                    <td key={c.id}>
                      <span
                        className="cellv"
                        style={v > 0 ? { background: `rgba(227,180,90,${alpha.toFixed(3)})` } : undefined}
                      >
                        {v > 0 ? usd(v) : <span className="dash">—</span>}
                        {n > 0 && <span className="nftmark"> {n}</span>}
                      </span>
                    </td>
                  );
                })}

                <td>
                  {usd(rowTotal)}
                  {link && (
                    <a
                      className="rowout"
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${w.label} in the explorer`}
                    >
                      ↗
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{focus ? 'Focused wallet' : 'Every wallet'}</td>
            {chains.map((c) => (
              <td key={c.id}>
                {usd(tokens.filter((t) => t.chain === c.id).reduce((s, t) => s + (t.usd ?? 0), 0))}
              </td>
            ))}
            <td>{usd(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
