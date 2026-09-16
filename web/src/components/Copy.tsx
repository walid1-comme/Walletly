import { useState } from 'react';

interface Props {
  value: string;
  label?: string;
  title?: string;
  className?: string;
}

/** Copy control that confirms in place, so nothing has to move on the page. */
export function Copy({ value, label, title, className = '' }: Props) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const box = document.createElement('textarea');
      box.value = value;
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      document.execCommand('copy');
      document.body.removeChild(box);
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1400);
  }

  return (
    <button
      type="button"
      className={`copy ${done ? 'done' : ''} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        void copy();
      }}
      title={title ?? `Copy ${label ?? 'to clipboard'}`}
      aria-label={title ?? `Copy ${label ?? 'to clipboard'}`}
    >
      {done ? 'Copied' : (label ?? '⧉')}
    </button>
  );
}
