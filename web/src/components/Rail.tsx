import type { View } from '../types';

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  walletCount: number;
  listCount: number;
}

const ITEMS: { id: View; label: string; glyph: string }[] = [
  { id: 'portfolio', label: 'Portfolio', glyph: '◧' },
  { id: 'wallets', label: 'Wallets', glyph: '▤' },
  { id: 'checker', label: 'Checker', glyph: '◈' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

export function Rail({ view, onNavigate, walletCount, listCount }: Props) {
  const tally: Partial<Record<View, number>> = { wallets: walletCount, checker: listCount };

  return (
    <nav className="rail" aria-label="Sections">
      <div className="mark">
        <b>Walletly</b>
        <span>by Walid</span>
      </div>

      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className="navlink"
          aria-current={view === item.id ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}
        >
          <span className="glyph" aria-hidden="true">{item.glyph}</span>
          {item.label}
          {tally[item.id] ? <span className="tally">{tally[item.id]}</span> : null}
        </button>
      ))}

      <div className="railfoot">Read-only. No keys, no connection, no approvals.</div>
    </nav>
  );
}
