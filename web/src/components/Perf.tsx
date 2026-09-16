import { WINDOWS, historySpan, walletValueAt, type Snapshot } from '../lib/snapshots';

interface Props {
  history: Snapshot[];
  address: string;
  current: number;
}

const money = (n: number) =>
  Math.abs(n) >= 1000
    ? `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
    : `$${Math.abs(n).toFixed(2)}`;

/**
 * Change over four windows, measured against this browser's own recorded
 * history. Nothing on-chain says what a wallet was worth last month, so a
 * window with no reading old enough is shown as still collecting rather than
 * as zero. A fake zero is worse than an honest gap.
 */
export function Perf({ history, address, current }: Props) {
  const span = historySpan(history);

  return (
    <div className="perf">
      {WINDOWS.map((w) => {
        const then = walletValueAt(history, address, w.ms);
        const reach = span >= w.ms * 0.85;

        if (then === null || !reach) {
          return (
            <span className="pnl empty" key={w.id} title={`Not enough history yet for ${w.id}`}>
              <b>{w.id}</b>
              <em>—</em>
            </span>
          );
        }

        const delta = current - then;
        const pct = then > 0 ? (delta / then) * 100 : null;
        const dir = delta > 0.005 ? 'gain' : delta < -0.005 ? 'loss' : 'flat';

        return (
          <span className={`pnl ${dir}`} key={w.id} title={`${money(then)} to ${money(current)}`}>
            <b>{w.id}</b>
            <em>
              {dir === 'flat' ? '0' : `${delta > 0 ? '+' : '−'}${money(delta)}`}
              {pct !== null && dir !== 'flat' && ` ${Math.abs(pct).toFixed(1)}%`}
            </em>
          </span>
        );
      })}
    </div>
  );
}
