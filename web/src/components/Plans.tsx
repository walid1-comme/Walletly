import { signOut, type Account } from '../auth';

const MONTHLY = import.meta.env.VITE_PAY_MONTHLY ?? '';
const QUARTERLY = import.meta.env.VITE_PAY_QUARTERLY ?? '';

const INCLUDED = [
  'Unlimited wallets, 7 chains, one read',
  'Coverage matrix with running totals',
  'Allowlist checker across every wallet at once',
  'Spam airdrops detected and excluded',
  'Live refresh every 30 seconds',
  '1D, 1W, 1M and 1Y change per wallet',
  'CSV export for tokens, NFTs and allowlist hits',
  'Portfolio observations on concentration and dust',
];

export function Plans({ account }: { account: Account }) {
  return (
    <div className="view">
      <div className="head">
        <div>
          <h2>Choose a plan</h2>
          <p>
            Signed in as {account.username}. Your wallets are saved and waiting; pick a plan to
            start reading them.
          </p>
        </div>
        <button
          type="button"
          className="small"
          onClick={() => void signOut().then(() => window.location.reload())}
        >
          Sign out
        </button>
      </div>

      <div className="plans">
        <div className="plan">
          <span className="plan-tag">Monthly</span>
          <div className="plan-price">$5<em>/month</em></div>
          <p>Cancel whenever. Good for a single mint season.</p>
          <a className="btn wide" href={MONTHLY || '#'} target={MONTHLY ? '_blank' : undefined} rel="noreferrer">
            {MONTHLY ? 'Pay $5' : 'Payments not connected yet'}
          </a>
        </div>

        <div className="plan best">
          <span className="plan-tag">3 months</span>
          <div className="plan-price">$12<em>/3 months</em></div>
          <p>$4 a month. Save 20% against paying monthly.</p>
          <a className="btn money wide" href={QUARTERLY || '#'} target={QUARTERLY ? '_blank' : undefined} rel="noreferrer">
            {QUARTERLY ? 'Pay $12' : 'Payments not connected yet'}
          </a>
          <span className="plan-note">Best value</span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <h3>Both plans include everything</h3>
        <div className="included">
          {INCLUDED.map((line) => <span key={line}>{line}</span>)}
        </div>
        <p className="note" style={{ marginTop: 14 }}>
          Walletly never asks for a private key, a seed phrase, a wallet connection, a signature or
          an approval. It reads public chain data using addresses you paste, which is information
          anyone can already look up. Nothing here can move, spend or touch your assets, because it
          is technically incapable of doing so.
        </p>
      </div>
    </div>
  );
}
