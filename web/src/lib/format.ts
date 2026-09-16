export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (value >= 1000) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

export function qty(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value >= 1) return trim(value.toFixed(4));
  return trim(value.toFixed(6));
}

function trim(s: string): string {
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

export function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  return `${value >= 0 ? '▲' : '▼'} ${Math.abs(value).toFixed(2)}%`;
}
