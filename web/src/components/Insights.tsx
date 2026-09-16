import type { Insight } from '../lib/insights';

const GLYPH: Record<Insight['kind'], string> = { risk: '▲', tidy: '◇', note: '·' };

export function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return null;

  return (
    <div className="insights">
      {items.map((i) => (
        <div className={`insight ${i.kind}`} key={i.id}>
          <span className="glyph" aria-hidden="true">{GLYPH[i.kind]}</span>
          <div>
            <b>{i.headline}</b>
            <p>{i.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
