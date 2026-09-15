import { useRef, useState } from 'react';
import { short } from '../lib/format';
import { parseList } from '../lib/parse';
import type { AllowlistMatch, LocalList, Wallet } from '../types';

interface Props {
  wallets: Wallet[];
  lists: LocalList[];
  registryMatches: AllowlistMatch[];
  registryOn: boolean;
  onAddList: (list: LocalList) => void;
  onRemoveList: (index: number) => void;
  onExport: () => void;
}

export function Allowlist({
  wallets, lists, registryMatches, registryOn, onAddList, onRemoveList, onExport,
}: Props) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function add(listName: string, body: string) {
    const parsed = parseList(listName, body);
    if (!parsed) {
      setError('No 0x addresses found in that list.');
      return;
    }
    setError('');
    onAddList(parsed);
    setName('');
    setText('');
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => add(name || file.name.replace(/\.[^.]+$/, ''), String(reader.result ?? ''));
    reader.readAsText(file);
    e.target.value = '';
  }

  const byAddress = new Map<string, AllowlistMatch[]>();
  for (const m of registryMatches) {
    byAddress.set(m.address, [...(byAddress.get(m.address) ?? []), m]);
  }

  const matched = wallets.filter(
    (w) => byAddress.has(w.address) || lists.some((l) => l.entries.has(w.address)),
  ).length;

  return (
    <div className="pair-wide">
      <div>
        <div className="panel">
          <h3>Check a private list</h3>
          <p className="hint">
            Paste the wallets a project gave you, or drop the CSV. It stays in this browser.
          </p>

          <label className="f" htmlFor="wl-name">List name</label>
          <input
            id="wl-name"
            type="text"
            value={name}
            placeholder="Bullies on Robinhood, GTD"
            onChange={(e) => setName(e.target.value)}
          />

          <label className="f" style={{ marginTop: 13 }} htmlFor="wl-paste">Addresses</label>
          <textarea
            id="wl-paste"
            value={text}
            spellCheck={false}
            placeholder={'0xabc…, GTD\n0xdef…, FCFS\n0x123…'}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="btns" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => add(name, text)}>Add list</button>
            <button type="button" className="btn quiet" onClick={() => fileRef.current?.click()}>
              Upload CSV
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" hidden onChange={onFile} />
          {error && <div className="warn">{error}</div>}

          <p className="note" style={{ marginTop: 12 }}>
            Column order does not matter. The first 0x on a line is the address, the next column
            becomes the tier.
          </p>
        </div>

        <div className="panel">
          <h3>Loaded lists</h3>
          {lists.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>None yet.</p>
          ) : (
            lists.map((l, i) => (
              <div className="entry" key={`${l.name}-${i}`}>
                <div className="who">
                  <b>{l.name}</b>
                  <span>{l.entries.size.toLocaleString()} addresses</span>
                </div>
                <div className="ctl">
                  <button type="button" className="drop" onClick={() => onRemoveList(i)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <div className="head" style={{ marginBottom: 12 }}>
          <h3>Where your wallets stand</h3>
          <button type="button" className="small" onClick={onExport}>Export CSV</button>
        </div>

        {!wallets.length ? (
          <p className="hint" style={{ margin: 0 }}>Add wallets first, then load a list.</p>
        ) : (
          <>
            <div className="stat">
              <div>
                <b className="money">{matched}/{wallets.length}</b>
                <span>wallets on a list</span>
              </div>
              <div>
                <b>{registryMatches.length + lists.length}</b>
                <span>{registryOn ? 'shared and private lists' : 'private lists'}</span>
              </div>
            </div>

            {wallets.map((w) => {
              const shared = byAddress.get(w.address) ?? [];
              const local = lists
                .filter((l) => l.entries.has(w.address))
                .map((l) => ({ name: l.name, tier: l.entries.get(w.address) ?? '' }));

              return (
                <div className="result" key={w.address}>
                  <div className="who">
                    <b>{w.label}</b>
                    <span>
                      {short(w.address)}
                      {w.group && <em className="tag group">{w.group}</em>}
                    </span>
                  </div>
                  <div style={{ marginTop: 5 }}>
                    {shared.map((m, i) => (
                      <span className="badge-hit shared" key={`r-${i}`}>
                        {m.projectName}
                        {m.tier ? `, ${m.tier}` : ''}
                        {m.verified ? ' ✓' : ''}
                      </span>
                    ))}
                    {local.map((m, i) => (
                      <span className="badge-hit" key={`l-${i}`}>
                        {m.name}
                        {m.tier ? `, ${m.tier}` : ''}
                      </span>
                    ))}
                    {!shared.length && !local.length && (
                      <span className="nohit">Not on any list loaded here</span>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
