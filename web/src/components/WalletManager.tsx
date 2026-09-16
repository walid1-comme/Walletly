import { useMemo, useState } from 'react';
import { Copy } from './Copy';
import { Perf } from './Perf';
import { parseWallets } from '../lib/parse';
import { short, usd } from '../lib/format';
import type { Snapshot } from '../lib/snapshots';
import type { Chain, NftHolding, TokenHolding, Wallet } from '../types';

interface Props {
  wallets: Wallet[];
  groups: string[];
  chains: Map<string, Chain>;
  tokens: TokenHolding[];
  nfts: NftHolding[];
  history: Snapshot[];
  scanned: boolean;
  onChange: (wallets: Wallet[]) => void;
  onGroups: (groups: string[]) => void;
}

const UNGROUPED = '';

export function WalletManager({
  wallets, groups, chains, tokens, nfts, history, scanned, onChange, onGroups,
}: Props) {
  const [newGroup, setNewGroup] = useState('');
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [draft, setDraft] = useState({ address: '', label: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [problem, setProblem] = useState('');

  /** Anything pasted is scanned for addresses, so a CSV, a Discord message or
   *  a single address all work in the same box. */
  const detected = useMemo(() => parseWallets(draft.address), [draft.address]);

  const stats = useMemo(() => {
    const value = new Map<string, number>();
    const held = new Map<string, number>();
    const on = new Map<string, Set<string>>();

    for (const t of tokens) {
      if (t.spam) continue;
      value.set(t.wallet, (value.get(t.wallet) ?? 0) + (t.usd ?? 0));
      if ((t.usd ?? 0) > 0) {
        const set = on.get(t.wallet) ?? new Set<string>();
        set.add(t.chain);
        on.set(t.wallet, set);
      }
    }
    for (const n of nfts) {
      held.set(n.wallet, (held.get(n.wallet) ?? 0) + n.count);
      const set = on.get(n.wallet) ?? new Set<string>();
      set.add(n.chain);
      on.set(n.wallet, set);
    }
    return { value, held, on };
  }, [tokens, nfts]);

  /** Every named group, plus a bucket for anything not filed yet. */
  const sections = useMemo(() => {
    const named = [...new Set(groups)].sort((a, b) => a.localeCompare(b));
    const rows = named.map((g) => ({ name: g, members: wallets.filter((w) => w.group === g) }));
    const loose = wallets.filter((w) => !w.group || !named.includes(w.group));
    if (loose.length) rows.push({ name: UNGROUPED, members: loose });
    return rows;
  }, [groups, wallets]);

  function createGroup() {
    const name = newGroup.trim();
    if (!name) return;
    if (groups.some((g) => g.toLowerCase() === name.toLowerCase())) {
      setProblem('You already have a group with that name.');
      return;
    }
    onGroups([...groups, name]);
    setNewGroup('');
    setOpenForm(name);
    setProblem('');
  }

  function addToGroup(group: string) {
    if (editing) {
      onChange(
        wallets.map((w) =>
          w.address === editing ? { ...w, label: draft.label.trim() || w.label, group } : w,
        ),
      );
      setEditing(null);
      setDraft({ address: '', label: '' });
      setOpenForm(null);
      return;
    }

    if (!detected.length) {
      setProblem('Paste at least one address that starts with 0x.');
      return;
    }

    const known = new Set(wallets.map((w) => w.address));
    const fresh = detected
      .filter((w) => !known.has(w.address))
      .map((w) => ({
        address: w.address,
        label: detected.length === 1 ? draft.label.trim() || w.label : w.label,
        group,
      }));

    if (!fresh.length) {
      setProblem('Those wallets are already saved.');
      return;
    }
    onChange([...wallets, ...fresh]);
    setDraft({ address: '', label: '' });
    setOpenForm(null);
    setProblem('');
  }

  function renameGroup(from: string, to: string) {
    const name = to.trim();
    if (!name || name === from) return;
    onGroups(groups.map((g) => (g === from ? name : g)));
    onChange(wallets.map((w) => (w.group === from ? { ...w, group: name } : w)));
  }

  function deleteGroup(name: string) {
    const count = wallets.filter((w) => w.group === name).length;
    if (count && !window.confirm(`Delete "${name}"? Its ${count} wallets move to Ungrouped.`)) return;
    onGroups(groups.filter((g) => g !== name));
    onChange(wallets.map((w) => (w.group === name ? { ...w, group: '' } : w)));
  }

  const allAddresses = wallets.map((w) => w.address).join('\n');

  return (
    <>
      <div className="panel">
        <div className="grouphead" style={{ border: 0, margin: 0, padding: 0 }}>
          <div>
            <h3>Groups</h3>
            <p className="hint" style={{ margin: '3px 0 0' }}>
              Make a group first, then file wallets into it. Groups are how you read cold storage
              apart from the wallets you mint with. There is no limit on how many you add.
            </p>
          </div>
          {wallets.length > 0 && (
            <Copy value={allAddresses} label={`Copy all ${wallets.length}`} className="ghosty" />
          )}
        </div>

        <div className="newgroup">
          <input
            type="text"
            value={newGroup}
            placeholder="Cold storage"
            aria-label="New group name"
            onChange={(e) => {
              setNewGroup(e.target.value);
              setProblem('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && createGroup()}
          />
          <button type="button" className="btn" onClick={createGroup} disabled={!newGroup.trim()}>
            Create group
          </button>
        </div>
        {problem && <div className="warn">{problem}</div>}
      </div>

      {sections.length === 0 && (
        <div className="panel">
          <h3>No groups yet</h3>
          <p className="hint" style={{ margin: 0 }}>
            Create one above. Something like Cold storage, Minting, or Trading.
          </p>
        </div>
      )}

      {sections.map(({ name, members }) => {
        const groupValue = members.reduce((s, w) => s + (stats.value.get(w.address) ?? 0), 0);
        const addresses = members.map((w) => w.address).join('\n');
        const isOpen = openForm === name;

        return (
          <div className="panel" key={name || 'ungrouped'}>
            <div className="grouphead">
              {name ? (
                <input
                  className="groupname"
                  defaultValue={name}
                  aria-label={`Rename ${name}`}
                  onBlur={(e) => renameGroup(name, e.target.value)}
                />
              ) : (
                <span className="groupname loose">Ungrouped</span>
              )}

              <span className="groupsum">
                {members.length} wallet{members.length === 1 ? '' : 's'}
                {scanned && <b>{usd(groupValue)}</b>}
              </span>

              <div className="ctl">
                {members.length > 0 && (
                  <Copy value={addresses} label="Copy" title="Copy every address in this group" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpenForm(isOpen ? null : name);
                    setEditing(null);
                    setDraft({ address: '', label: '' });
                  }}
                >
                  {isOpen ? 'Close' : 'Add wallet'}
                </button>
                {name && (
                  <button type="button" className="drop" onClick={() => deleteGroup(name)}>
                    Delete
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="addbox">
                <label className="f">
                  {editing ? 'Editing an existing wallet' : 'Paste one address, or a whole list'}
                </label>
                <textarea
                  className="mono-in addr-in"
                  value={draft.address}
                  disabled={Boolean(editing)}
                  spellCheck={false}
                  placeholder="0x0000000000000000000000000000000000000000"
                  onChange={(e) => {
                    setDraft({ ...draft, address: e.target.value });
                    setProblem('');
                  }}
                />
                {detected.length > 0 && (
                  <div className="detect">
                    {detected.length > 1
                      ? `${detected.length} addresses found, all filed under ${name || 'Ungrouped'}`
                      : `Valid address: ${short(detected[0].address)}`}
                  </div>
                )}
                {detected.length <= 1 && (
                  <>
                    <label className="f" style={{ marginTop: 10 }}>Name</label>
                    <input
                      type="text"
                      value={draft.label}
                      placeholder="Vault"
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && addToGroup(name)}
                    />
                  </>
                )}
                <div className="btns" style={{ marginTop: 12 }}>
                  <button type="button" className="btn" onClick={() => addToGroup(name)}>
                    {editing
                      ? 'Save'
                      : detected.length > 1
                        ? `Add ${detected.length} wallets`
                        : 'Add wallet'}
                  </button>
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => {
                      setOpenForm(null);
                      setEditing(null);
                      setDraft({ address: '', label: '' });
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {members.length === 0 ? (
              <p className="hint" style={{ margin: '12px 0 0' }}>Empty. Add a wallet to it.</p>
            ) : (
              members.map((w) => {
                const value = stats.value.get(w.address) ?? 0;
                const held = stats.held.get(w.address) ?? 0;
                const active = [...(stats.on.get(w.address) ?? [])];

                return (
                  <div className="entry" key={w.address}>
                    <div className="who">
                      <b>{w.label}</b>
                      <span>
                        {short(w.address)}
                        <Copy value={w.address} title="Copy this address" />
                      </span>

                      {scanned && (
                        <>
                          <div className="wstats">
                            <span>{usd(value)}</span>
                            {held > 0 && <span className="nftmark">{held} NFTs</span>}
                            {active.map((id) => (
                              <span key={id} className="dotchain" style={{ color: chains.get(id)?.color }}>
                                {chains.get(id)?.name ?? id}
                              </span>
                            ))}
                            {!active.length && <span className="dash">nothing found</span>}
                          </div>
                          <Perf history={history} address={w.address} current={value} />
                        </>
                      )}
                    </div>

                    <div className="ctl">
                      <select
                        className="mover"
                        value={w.group || ''}
                        aria-label={`Move ${w.label} to another group`}
                        onChange={(e) =>
                          onChange(
                            wallets.map((x) =>
                              x.address === w.address ? { ...x, group: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="">Ungrouped</option>
                        {groups.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(w.address);
                          setDraft({ address: w.address, label: w.label });
                          setOpenForm(name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="drop"
                        onClick={() => onChange(wallets.filter((x) => x.address !== w.address))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </>
  );
}
