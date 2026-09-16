import { useState } from 'react';
import { sendReset, signIn, signUp, updatePassword } from '../auth';

type Mode = 'in' | 'up' | 'forgot' | 'reset';

const FEATURES: [string, string][] = [
  ['Unlimited wallets', 'Ten or two hundred, read in one pass across seven chains.'],
  ['The coverage matrix', 'Which wallet holds what, on which chain, with running totals.'],
  ['Allowlist checker', 'Every wallet against a list at once, instead of one by one.'],
  ['Spam filtered out', 'Scam airdrops detected and kept out of your total.'],
  ['Live prices', 'Refreshes every 30 seconds so your total tracks the market.'],
  ['Change over time', '1D, 1W, 1M and 1Y movement for every wallet you own.'],
];

const SAFETY = [
  'No private keys. Ever.',
  'No seed phrase.',
  'No wallet connection.',
  'No signatures or approvals.',
];

interface Props {
  onDone: () => void;
  recovering: boolean;
}

export function Gate({ onDone, recovering }: Props) {
  const [mode, setMode] = useState<Mode>(recovering ? 'reset' : 'in');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');

  async function submit() {
    setBusy(true);
    setProblem('');
    setSaid('');
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password);
        onDone();
      } else if (mode === 'up') {
        if (username.trim().length < 3) throw new Error('Pick a username of at least 3 characters.');
        await signUp(email.trim(), password, username.trim());
        setSaid('Account created. Check your inbox to confirm the address, then sign in.');
        setMode('in');
      } else if (mode === 'forgot') {
        await sendReset(email.trim());
        setSaid('If that email has an account, a reset link is on its way.');
      } else {
        await updatePassword(password);
        setSaid('Password changed.');
        onDone();
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-pitch">
        <div className="gate-mark">
          <b>Walletly</b>
          <span>by Walid</span>
        </div>

        <h1 className="gate-h1">Every wallet. Every chain. One page.</h1>
        <p className="gate-lead">
          If you hold across a dozen wallets, you already know the routine: a dozen tabs, a dozen
          explorers, and no idea what you own in total. Walletly reads all of them at once.
        </p>

        <div className="safety">
          <div className="safety-head">
            <span className="shield" aria-hidden="true">◈</span>
            <b>Your keys never touch this app</b>
          </div>
          <div className="safety-list">
            {SAFETY.map((line) => <span key={line}>{line}</span>)}
          </div>
          <p>
            You paste public addresses, the same ones you share to receive funds. Walletly is
            read-only by design and has no code capable of moving anything.
          </p>
        </div>

        <div className="gate-features">
          {FEATURES.map(([title, detail]) => (
            <div key={title}>
              <b>{title}</b>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="gate-form">
        <div className="panel">
          <h3>
            {mode === 'in' && 'Sign in'}
            {mode === 'up' && 'Create an account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'reset' && 'Choose a new password'}
          </h3>
          <p className="hint">
            {mode === 'up'
              ? 'An email and a password. Nothing else is asked for.'
              : mode === 'forgot'
                ? 'We will send a link to set a new one.'
                : 'Your wallets are saved to your account.'}
          </p>

          {mode === 'up' && (
            <>
              <label className="f" htmlFor="u">Username</label>
              <input
                id="u"
                type="text"
                value={username}
                autoComplete="username"
                placeholder="walta"
                onChange={(e) => setUsername(e.target.value)}
              />
            </>
          )}

          {mode !== 'reset' && (
            <>
              <label className="f" style={{ marginTop: mode === 'up' ? 12 : 0 }} htmlFor="e">Email</label>
              <input
                id="e"
                type="text"
                value={email}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </>
          )}

          {mode !== 'forgot' && (
            <>
              <label className="f" style={{ marginTop: 12 }} htmlFor="p">
                {mode === 'reset' ? 'New password' : 'Password'}
              </label>
              <input
                id="p"
                type="password"
                value={password}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                placeholder="At least 6 characters"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </>
          )}

          <button type="button" className="btn wide" style={{ marginTop: 16 }} disabled={busy} onClick={submit}>
            {busy
              ? 'Working'
              : mode === 'in'
                ? 'Sign in'
                : mode === 'up'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : 'Save password'}
          </button>

          {problem && <div className="warn">{problem}</div>}
          {said && <div className="ok-note">{said}</div>}

          <div className="gate-switch">
            {mode === 'in' && (
              <>
                <button type="button" className="plain" onClick={() => setMode('up')}>Create an account</button>
                <button type="button" className="plain" onClick={() => setMode('forgot')}>Forgot password</button>
              </>
            )}
            {(mode === 'up' || mode === 'forgot') && (
              <button type="button" className="plain" onClick={() => setMode('in')}>Back to sign in</button>
            )}
          </div>
        </div>

        <p className="gate-foot">$5 a month, or $12 for three. Cancel whenever you like.</p>
      </div>
    </div>
  );
}
