import type { ReactNode } from 'react';

interface RowProps {
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  figure: ReactNode;
}

/** One ruled line in the ledger. Alignment is the whole point, so the grid is
 *  fixed and every row shares it. */
export function LedgerRow({ icon, title, sub, actions, figure }: RowProps) {
  return (
    <div className="lrow">
      <div className="mark32">{icon}</div>
      <div>
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
        {actions && <div className="acts">{actions}</div>}
      </div>
      <div className="figure">{figure}</div>
    </div>
  );
}

export function Ledger({ children }: { children: ReactNode }) {
  return <div className="ledger">{children}</div>;
}

export function Blank({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="blank">
      <b>{title}</b>
      <span>{children}</span>
    </div>
  );
}
