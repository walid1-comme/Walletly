import { useEffect, useMemo, useState } from 'react';
import { checkRegistry, getChains, scanPairs, type Pair } from './api';
import { authEnabled, currentSession, loadAccount, signOut, supabase, type Account } from './auth';
import { Allowlist } from './components/Allowlist';
import { Gate } from './components/Gate';
import { Insights } from './components/Insights';
import { Matrix } from './components/Matrix';
import { NftList } from './components/NftList';
import { Plans } from './components/Plans';
import { Rail } from './components/Rail';
import { Tiles } from './components/Tiles';
import { TokenList } from './components/TokenList';
import { Trend } from './components/Trend';
import { WalletManager } from './components/WalletManager';
import { downloadCsv } from './lib/csv';
import { usd } from './lib/format';
import { buildInsights } from './lib/insights';
import { clearHistory, loadHistory, record, valueAt, type Snapshot } from './lib/snapshots';
import { readHash, storage, writeHash } from './lib/storage';
import type {
  AggregatedNft,
  AggregatedToken,
  AllowlistMatch,
  Chain,
  ChainStatus,
  LocalList,
  NftHolding,
  NftSortKey,
  SortKey,
  TokenHolding,
  View,
  Wallet,
} from './types';

const SESSION_KEY = 'walletly.session.v1';

export default function App() {
  /* ---------------------------------------------------------- accounts */
  const [account, setAccount] = useState<Account | null>(null);
  const [authReady, setAuthReady] = useState(!authEnabled);
  const [signedIn, setSignedIn] = useState(!authEnabled);
  const [recovering, setRecovering] = useState(false);

  /* ------------------------------------------------------------- shell */
  const [view, setView] = useState<View>('portfolio');
  const [holdingsTab, setHoldingsTab] = useState<'tokens' | 'nfts'>('tokens');

  /* -------------------------------------------------------------- data */
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedChains, setSelectedChains] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Wallet[]>([]);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [group, setGroup] = useState('all');
  const [focus, setFocus] = useState<string | null>(null);

  const [tokens, setTokens] = useState<TokenHolding[]>([]);
  const [nfts, setNfts] = useState<NftHolding[]>([]);
  const [status, setStatus] = useState<ChainStatus[]>([]);
  const [lists, setLists] = useState<LocalList[]>([]);
  const [registryMatches, setRegistryMatches] = useState<AllowlistMatch[]>([]);
  const [registryOn, setRegistryOn] = useState(false);

  /* ------------------------------------------------------------ status */
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [pendingRecord, setPendingRecord] = useState(false);
  const [, setTick] = useState(0);
  const [history, setHistory] = useState<Snapshot[]>([]);

  /* --------------------------------------------------------- preferences */
  const [live, setLive] = useState(false);
  const [showSpam, setShowSpam] = useState(false);
  const [hideDust, setHideDust] = useState(true);
  const [tokenSearch, setTokenSearch] = useState('');
  const [nftSearch, setNftSearch] = useState('');
  const [tokenSort, setTokenSort] = useState<SortKey>('value');
  const [nftSort, setNftSort] = useState<NftSortKey>('count');

  /* ------------------------------------------------------------- groups */
  const groups = useMemo(
    () =>
      [...new Set([...groupNames, ...saved.map((w) => w.group).filter(Boolean)])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [groupNames, saved],
  );

  const inGroup = useMemo(
    () => (group === 'all' ? saved : saved.filter((w) => w.group === group)),
    [saved, group],
  );

  /** What the page reports on: the chosen group, narrowed by any row focus. */
  const wallets = useMemo(
    () => (focus ? inGroup.filter((w) => w.address === focus) : inGroup),
    [inGroup, focus],
  );

  /* --------------------------------------------------------------- auth */
  useEffect(() => {
    if (!authEnabled || !supabase) return;

    if (window.location.hash.includes('type=recovery')) setRecovering(true);

    async function refresh() {
      const session = await currentSession();
      setSignedIn(Boolean(session));
      setAccount(session ? await loadAccount() : null);
      setAuthReady(true);
    }
    void refresh();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /* ---------------------------------------------------------- bootstrap */
  useEffect(() => {
    getChains()
      .then((list) => {
        setChains(list);
        setSelectedChains((cur) =>
          cur.size ? cur : new Set(list.filter((c) => c.default).map((c) => c.id)),
        );
      })
      .catch(() => setError('Cannot reach the API. Check VITE_API_URL in your .env file.'));

    setHistory(loadHistory());

    const shared = readHash();
    if (shared) {
      try {
        const rows = JSON.parse(shared) as [string, string, string][];
        setSaved(rows.map(([address, label, g]) => ({ address, label, group: g })));
        return;
      } catch {
        // Fall through to the stored session.
      }
    }

    const stored = storage.get(SESSION_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        wallets?: Wallet[];
        groupNames?: string[];
        chains?: string[];
        lists?: { name: string; entries: [string, string][] }[];
        prefs?: { live?: boolean; hideDust?: boolean; showSpam?: boolean };
      };
      if (parsed.wallets?.length) setSaved(parsed.wallets);
      if (parsed.groupNames?.length) setGroupNames(parsed.groupNames);
      if (parsed.chains?.length) setSelectedChains(new Set(parsed.chains));
      if (parsed.lists?.length) {
        setLists(parsed.lists.map((l) => ({ name: l.name, entries: new Map(l.entries) })));
      }
      if (parsed.prefs) {
        setLive(Boolean(parsed.prefs.live));
        setHideDust(parsed.prefs.hideDust ?? true);
        setShowSpam(Boolean(parsed.prefs.showSpam));
      }
    } catch {
      // A corrupt session should not block the app.
    }
  }, []);

  /** Everything persists as it changes, so there is no save button to forget. */
  useEffect(() => {
    storage.set(
      SESSION_KEY,
      JSON.stringify({
        wallets: saved,
        groupNames,
        chains: [...selectedChains],
        lists: lists.map((l) => ({ name: l.name, entries: [...l.entries] })),
        prefs: { live, hideDust, showSpam },
      }),
    );
  }, [saved, groupNames, selectedChains, lists, live, hideDust, showSpam]);

  /* --------------------------------------------------------------- scan */
  async function scan(fresh = true) {
    setError('');
    if (!inGroup.length) {
      setError('Add a wallet first.');
      setView('wallets');
      return;
    }
    if (!selectedChains.size) {
      setError('Turn on at least one chain in Settings.');
      return;
    }

    const pairs: Pair[] = inGroup.flatMap((w) =>
      [...selectedChains].map((chain) => ({ address: w.address, chain })),
    );

    if (pairs.length > 400) {
      setError(
        `Reading ${inGroup.length} wallets across ${selectedChains.size} chains. This takes a couple of minutes; results appear as they land.`,
      );
    }

    setLoading(true);
    setTokens([]);
    setNfts([]);
    setStatus([]);
    setProgress({ done: 0, total: pairs.length });
    setScanned(true);
    writeHash(JSON.stringify(inGroup.map((w) => [w.address, w.label, w.group])));

    const addresses = inGroup.map((w) => w.address);
    checkRegistry(addresses)
      .then((r) => {
        setRegistryMatches(r.matches);
        setRegistryOn(r.registry);
      })
      .catch(() => setRegistryOn(false));

    let failures = 0;

    // More wallets means more requests, so widen the pool rather than making
    // large accounts wait in a narrow queue.
    const lanes = pairs.length > 200 ? 8 : pairs.length > 60 ? 6 : 4;

    await scanPairs(
      pairs,
      lanes,
      (pair, result, err) => {
        if (result) {
          setTokens((prev) => [...prev, ...result.tokens]);
          setNfts((prev) => [...prev, ...result.nfts]);
          setStatus((prev) => [...prev, ...result.status]);
        } else {
          failures += 1;
          setStatus((prev) => [
            ...prev,
            { chain: pair.chain, wallet: pair.address, ok: false, cached: false, error: err },
          ]);
        }
        setProgress((p) => ({ done: p.done + 1, total: p.total }));
      },
      fresh,
    );

    setUpdatedAt(Date.now());
    setPendingRecord(true);

    if (failures === pairs.length) {
      setError('Every lookup failed. The API may be unreachable.');
    } else if (failures > 0) {
      setError(`${failures} of ${pairs.length} lookups failed. Scan again to retry them.`);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!live || !scanned) return;
    const id = window.setInterval(() => void scan(true), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, scanned, saved, selectedChains, group]);

  useEffect(() => {
    if (!updatedAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [updatedAt]);

  const age = updatedAt ? Math.floor((Date.now() - updatedAt) / 1000) : null;

  /* -------------------------------------------------------- aggregation */
  const chainMap = useMemo(() => new Map(chains.map((c) => [c.id, c])), [chains]);
  const activeChains = useMemo(
    () => chains.filter((c) => selectedChains.has(c.id)),
    [chains, selectedChains],
  );
  const inScope = useMemo(() => new Set(wallets.map((w) => w.address)), [wallets]);

  const aggregatedTokens = useMemo<AggregatedToken[]>(() => {
    const map = new Map<string, AggregatedToken>();
    for (const t of tokens) {
      if (!inScope.has(t.wallet)) continue;
      const found = map.get(t.key);
      if (found) {
        found.quantity += t.quantity;
        found.usd = (found.usd ?? 0) + (t.usd ?? 0) || null;
        found.wallets.add(t.wallet);
      } else {
        map.set(t.key, { ...t, wallets: new Set([t.wallet]) });
      }
    }
    return [...map.values()].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0) || b.quantity - a.quantity);
  }, [tokens, inScope]);

  const aggregatedNfts = useMemo<AggregatedNft[]>(() => {
    const map = new Map<string, AggregatedNft>();
    for (const n of nfts) {
      if (!inScope.has(n.wallet)) continue;
      const key = `${n.chain}:${n.contract}`;
      const found = map.get(key);
      if (found) {
        found.count += n.count;
        found.wallets.add(n.wallet);
      } else {
        map.set(key, { ...n, wallets: new Set([n.wallet]) });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [nfts, inScope]);

  const spamCount = aggregatedTokens.filter((t) => t.spam).length;

  const visibleTokens = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    const rows = aggregatedTokens.filter((t) => {
      if (!showSpam && t.spam) return false;
      if (hideDust && (t.usd ?? 0) < 1 && !t.native) return false;
      if (q && !`${t.name} ${t.symbol}`.toLowerCase().includes(q)) return false;
      return true;
    });

    return rows.sort((a, b) => {
      if (tokenSort === 'name') return a.name.localeCompare(b.name);
      if (tokenSort === 'spread') return b.wallets.size - a.wallets.size || (b.usd ?? 0) - (a.usd ?? 0);
      if (tokenSort === 'change') return Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0);
      return (b.usd ?? 0) - (a.usd ?? 0);
    });
  }, [aggregatedTokens, showSpam, hideDust, tokenSearch, tokenSort]);

  const visibleNfts = useMemo(() => {
    const q = nftSearch.trim().toLowerCase();
    const rows = q ? aggregatedNfts.filter((n) => n.name.toLowerCase().includes(q)) : [...aggregatedNfts];
    return rows.sort((a, b) => {
      if (nftSort === 'name') return a.name.localeCompare(b.name);
      if (nftSort === 'spread') return b.wallets.size - a.wallets.size || b.count - a.count;
      return b.count - a.count;
    });
  }, [aggregatedNfts, nftSearch, nftSort]);

  const totalUsd = aggregatedTokens
    .filter((t) => !t.spam)
    .reduce((sum, t) => sum + (t.usd ?? 0), 0);
  const nftTotal = aggregatedNfts.reduce((sum, n) => sum + n.count, 0);
  const failed = status.filter((s) => !s.ok).length;

  /** History is written once a scan settles, never mid-scan while the total is
   *  still climbing as results arrive. */
  useEffect(() => {
    if (!pendingRecord || loading) return;
    const perWallet: Record<string, number> = {};
    for (const t of tokens) {
      if (t.spam) continue;
      perWallet[t.wallet] = (perWallet[t.wallet] ?? 0) + (t.usd ?? 0);
    }
    for (const w of saved) perWallet[w.address] = perWallet[w.address] ?? 0;
    setHistory(record(totalUsd, perWallet));
    setPendingRecord(false);
  }, [pendingRecord, loading, totalUsd, tokens, saved]);

  const previous = valueAt(history, 60_000);
  const dayAgo = valueAt(history, 24 * 60 * 60 * 1000);
  const reference = dayAgo ?? previous;
  const delta = reference !== null && scanned ? totalUsd - reference : null;
  const deltaPct = delta !== null && reference ? (delta / reference) * 100 : null;

  const insights = useMemo(
    () =>
      scanned
        ? buildInsights(
            wallets,
            tokens.filter((t) => inScope.has(t.wallet)),
            nfts.filter((n) => inScope.has(n.wallet)),
            aggregatedTokens,
            aggregatedNfts,
          )
        : [],
    [scanned, wallets, tokens, nfts, aggregatedTokens, aggregatedNfts, inScope],
  );

  /* ------------------------------------------------------------ exports */
  const exportTokens = () =>
    downloadCsv('walletly-tokens.csv', [
      ['Chain', 'Name', 'Symbol', 'Contract', 'Quantity', 'USD', '24h %', 'Wallets'],
      ...visibleTokens.map((t) => [
        chainMap.get(t.chain)?.name ?? t.chain,
        t.name,
        t.symbol,
        t.contract,
        t.quantity,
        t.usd ?? '',
        t.change24h?.toFixed(2) ?? '',
        t.wallets.size,
      ]),
    ]);

  const exportNfts = () =>
    downloadCsv('walletly-nfts.csv', [
      ['Chain', 'Collection', 'Contract', 'Standard', 'Held', 'Wallets'],
      ...visibleNfts.map((n) => [
        chainMap.get(n.chain)?.name ?? n.chain,
        n.name,
        n.contract,
        n.standard,
        n.count,
        n.wallets.size,
      ]),
    ]);

  function exportAllowlists() {
    const rows: (string | number)[][] = [['Wallet', 'Address', 'Source', 'List', 'Tier']];
    for (const w of wallets) {
      for (const m of registryMatches.filter((r) => r.address === w.address)) {
        rows.push([w.label, w.address, 'shared', `${m.projectName} - ${m.listName}`, m.tier ?? '']);
      }
      for (const l of lists) {
        if (l.entries.has(w.address)) {
          rows.push([w.label, w.address, 'private', l.name, l.entries.get(w.address) ?? '']);
        }
      }
    }
    downloadCsv('walletly-allowlists.csv', rows);
  }

  const scopeLabel = focus
    ? (wallets[0]?.label ?? 'one wallet')
    : group === 'all'
      ? `${saved.length} wallet${saved.length === 1 ? '' : 's'}`
      : group;

  const groupPicker = groups.length > 0 && (
    <select
      className="find"
      style={{ maxWidth: 200 }}
      value={group}
      onChange={(e) => {
        setGroup(e.target.value);
        setFocus(null);
      }}
      aria-label="Wallet group"
    >
      <option value="all">All groups</option>
      {groups.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );

  /* --------------------------------------------------------------- view */
  if (!authReady) return <div className="booting">Loading your account</div>;

  if (authEnabled && (!signedIn || recovering)) {
    return (
      <Gate
        recovering={recovering}
        onDone={() => {
          setRecovering(false);
          window.history.replaceState(null, '', window.location.pathname);
        }}
      />
    );
  }

  if (authEnabled && account && !account.active) {
    return (
      <div className="app single">
        <Plans account={account} />
      </div>
    );
  }

  return (
    <div className="app">
      <Rail view={view} onNavigate={setView} walletCount={saved.length} listCount={lists.length} />

      <main className="main">
        <div className="topline">
          <div>
            <div className="totalrow">
              <div className="total">{scanned ? usd(totalUsd) : '—'}</div>
              {delta !== null && Math.abs(delta) >= 0.01 && (
                <span className={`delta ${delta >= 0 ? 'gain' : 'loss'}`}>
                  {delta >= 0 ? '+' : '−'}{usd(Math.abs(delta))}
                  {deltaPct !== null && ` (${Math.abs(deltaPct).toFixed(1)}%)`}
                  <em>{dayAgo !== null ? 'since yesterday' : 'since last scan'}</em>
                </span>
              )}
              <Trend history={history} />
            </div>
            <div className="caption">
              {scanned ? `${scopeLabel}, ${nftTotal} NFTs held` : 'Nothing scanned yet'}
            </div>
          </div>

          <div className="right">
            {age !== null && (
              <span className="beat">
                <i className={age > 90 ? 'idle' : ''} />
                {age < 5 ? 'just now' : `${age}s ago`}
              </span>
            )}
            {failed > 0 && (
              <span className="beat"><i className="warn" />{failed} failed</span>
            )}
            <button type="button" className="btn money" disabled={loading} onClick={() => scan(true)}>
              {loading ? `Scanning ${progress.done} of ${progress.total}` : 'Scan now'}
            </button>
          </div>
        </div>

        {loading && (
          <div className="meter">
            <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        )}

        <div className="view">
          {error && <div className="warn" style={{ marginBottom: 16 }}>{error}</div>}

          {view === 'portfolio' && (
            <>
              <div className="head">
                <div>
                  <h2>Portfolio</h2>
                  <p>
                    Every wallet against every chain, with a running total in the margin. Click a
                    row to read one wallet on its own.
                  </p>
                </div>
                {groupPicker}
              </div>

              {scanned && (
                <Tiles
                  total={totalUsd}
                  delta={delta}
                  deltaLabel={dayAgo !== null ? 'since yesterday' : 'since last scan'}
                  wallets={inGroup.length}
                  activeWallets={
                    new Set(tokens.filter((t) => (t.usd ?? 0) > 0).map((t) => t.wallet)).size
                  }
                  nftCount={nftTotal}
                  collections={aggregatedNfts.length}
                  chains={activeChains}
                  tokens={tokens}
                />
              )}

              {scanned ? (
                <div style={{ marginTop: 20 }}>
                  <Matrix
                    wallets={inGroup}
                    chains={activeChains}
                    tokens={tokens}
                    nfts={nfts}
                    focus={focus}
                    onFocus={setFocus}
                  />
                </div>
              ) : (
                <div className="blank">
                  <b>Nothing scanned yet</b>
                  <span>
                    {saved.length
                      ? 'Press Scan now to read your wallets.'
                      : 'Add a wallet under Wallets to begin.'}
                  </span>
                </div>
              )}

              {insights.length > 0 && <Insights items={insights} />}

              <div className="tabline">
                <button
                  type="button"
                  aria-selected={holdingsTab === 'tokens'}
                  onClick={() => setHoldingsTab('tokens')}
                >
                  Tokens<span className="n">{visibleTokens.length}</span>
                </button>
                <button
                  type="button"
                  aria-selected={holdingsTab === 'nfts'}
                  onClick={() => setHoldingsTab('nfts')}
                >
                  Collections<span className="n">{visibleNfts.length}</span>
                </button>
              </div>

              <div style={{ marginTop: 18 }}>
                {holdingsTab === 'tokens' ? (
                  <TokenList
                    tokens={visibleTokens}
                    chains={chainMap}
                    scanned={scanned}
                    showSpam={showSpam}
                    hideDust={hideDust}
                    spamCount={spamCount}
                    search={tokenSearch}
                    sort={tokenSort}
                    total={totalUsd}
                    onSearch={setTokenSearch}
                    onSort={setTokenSort}
                    onToggleSpam={() => setShowSpam((v) => !v)}
                    onToggleDust={() => setHideDust((v) => !v)}
                    onExport={exportTokens}
                  />
                ) : (
                  <NftList
                    nfts={visibleNfts}
                    chains={chainMap}
                    scanned={scanned}
                    search={nftSearch}
                    sort={nftSort}
                    onSearch={setNftSearch}
                    onSort={setNftSort}
                    onExport={exportNfts}
                  />
                )}
              </div>
            </>
          )}

          {view === 'wallets' && (
            <>
              <div className="head">
                <div>
                  <h2>Wallets</h2>
                  <p>
                    Create a group, then file wallets into it. Groups let you read cold storage
                    separately from the wallets you mint with.
                  </p>
                </div>
              </div>
              <WalletManager
                wallets={saved}
                groups={groups}
                chains={chainMap}
                tokens={tokens}
                nfts={nfts}
                history={history}
                scanned={scanned}
                onChange={setSaved}
                onGroups={setGroupNames}
              />
            </>
          )}

          {view === 'checker' && (
            <>
              <div className="head">
                <div>
                  <h2>Allowlist checker</h2>
                  <p>
                    Check every wallet you own against a list at once, instead of pasting them one
                    at a time.
                  </p>
                </div>
                {groupPicker}
              </div>
              <Allowlist
                wallets={inGroup}
                lists={lists}
                registryMatches={registryMatches}
                registryOn={registryOn}
                onAddList={(l) => setLists((prev) => [...prev, l])}
                onRemoveList={(i) => setLists((prev) => prev.filter((_, idx) => idx !== i))}
                onExport={exportAllowlists}
              />
            </>
          )}

          {view === 'settings' && (
            <>
              <div className="head">
                <div>
                  <h2>Settings</h2>
                  <p>Which chains get read, how often, and what stays hidden.</p>
                </div>
              </div>

              <div className="panel">
                <h3>Security</h3>
                <div className="safety inline">
                  <div className="safety-head">
                    <span className="shield" aria-hidden="true">◈</span>
                    <b>Walletly cannot touch your assets</b>
                  </div>
                  <div className="safety-list">
                    <span>No private keys. Ever.</span>
                    <span>No seed phrase.</span>
                    <span>No wallet connection.</span>
                    <span>No signatures or approvals.</span>
                  </div>
                  <p>
                    Everything here works from public addresses, the same ones you hand out to
                    receive funds. There is no code in this app capable of moving anything, and no
                    permission it could use if there were.
                  </p>
                </div>
              </div>

              <div className="panel">
                <h3>Chains</h3>
                <p className="hint">
                  There is no limit on how many wallets you track. Each chain you turn on is one
                  more lookup per wallet, so turning off chains you do not use is the fastest way
                  to speed up a large account.
                </p>
                <div className="chips">
                  {chains.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="chipbtn"
                      style={{ color: c.color }}
                      aria-pressed={selectedChains.has(c.id)}
                      onClick={() =>
                        setSelectedChains((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    >
                      <i />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h3>Refreshing</h3>
                <p className="hint">
                  Prices move constantly. Live mode re-reads everything every 30 seconds so the
                  total on screen tracks the market.
                </p>
                <label className="opt">
                  <input type="checkbox" checked={live} onChange={() => setLive((v) => !v)} />
                  Refresh automatically every 30 seconds
                </label>
              </div>

              <div className="panel">
                <h3>What to hide</h3>
                <p className="hint">
                  Active wallets collect scam airdrops with fake names and fake prices. They stay
                  hidden and out of your total unless you ask for them.
                </p>
                <label className="opt" style={{ display: 'flex', marginBottom: 10 }}>
                  <input type="checkbox" checked={hideDust} onChange={() => setHideDust((v) => !v)} />
                  Hide holdings worth under $1
                </label>
                <label className="opt" style={{ display: 'flex' }}>
                  <input type="checkbox" checked={showSpam} onChange={() => setShowSpam((v) => !v)} />
                  Show suspected spam tokens
                </label>
              </div>

              {account && (
                <div className="panel">
                  <h3>Account</h3>
                  <p className="hint">
                    Signed in as {account.username}
                    {account.email ? ` (${account.email})` : ''}.
                  </p>
                  <div className="planline">
                    <span className={`planpill ${account.plan}`}>
                      {account.plan === 'lifetime'
                        ? 'Lifetime access'
                        : account.plan === 'free'
                          ? 'No active plan'
                          : account.plan === 'monthly'
                            ? 'Monthly plan'
                            : 'Quarterly plan'}
                    </span>
                    {account.expiresAt && (
                      <span className="hint" style={{ margin: 0 }}>
                        Renews {new Date(account.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="btns" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      className="btn quiet"
                      onClick={() => void signOut().then(() => window.location.reload())}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}

              <div className="panel">
                <h3>Your data</h3>
                <p className="hint">
                  Wallets and lists live in this browser only. A share link carries your wallet
                  list in the URL, so send it only to people you want reading your balances.
                </p>
                <div className="btns">
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => navigator.clipboard?.writeText(window.location.href)}
                  >
                    Copy share link
                  </button>
                  <button
                    type="button"
                    className="btn quiet"
                    onClick={() => {
                      if (!window.confirm('Remove every wallet and list from this browser?')) return;
                      setSaved([]);
                      setGroupNames([]);
                      setLists([]);
                      setTokens([]);
                      setNfts([]);
                      setScanned(false);
                      clearHistory();
                      setHistory([]);
                    }}
                  >
                    Erase everything
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
