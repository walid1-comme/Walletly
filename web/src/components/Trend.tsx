import type { Snapshot } from '../lib/snapshots';

interface Props {
  history: Snapshot[];
  width?: number;
  height?: number;
}

/** A bare line of where the total has been. No axes, no grid: it is a glance,
 *  and the number beside it carries the precision. */
export function Trend({ history, width = 118, height = 30 }: Props) {
  const points = history.slice(-40);
  if (points.length < 3) return null;

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.v - min) / span) * (height - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      className="trend"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Recent movement of your total value"
    >
      <path d={path} fill="none" strokeWidth="1.5" stroke={rising ? 'var(--gain)' : 'var(--loss)'} />
    </svg>
  );
}
