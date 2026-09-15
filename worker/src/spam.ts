const URL_RE = /(https?:\/\/|www\.|\.(io|com|xyz|net|org|finance|app|gift|vip|club)\b)/i;

const BAIT = [
  'claim', 'reward', 'airdrop', 'visit', 'voucher', 'bonus', 'giveaway',
  'free', 'winner', 'redeem', 'access', 'unlock', 'ticket', 'presale', 'eligib',
];

const ODD_CHARS = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

/**
 * Heuristic spam detection for ERC-20 airdrops. Deliberately conservative:
 * a false positive only hides a token behind a toggle, it never deletes it.
 */
export function isSpam(name: string, symbol: string, quantity: number): boolean {
  const haystack = `${name} ${symbol}`.toLowerCase();

  if (URL_RE.test(haystack)) return true;
  if (BAIT.some((word) => haystack.includes(word))) return true;
  if (ODD_CHARS.test(`${name}${symbol}`)) return true;

  // Absurd supply handed to a single wallet is the classic dusting pattern.
  if (quantity > 1e12) return true;

  const letters = haystack.replace(/[^a-z0-9]/g, '');
  if (letters.length < 2) return true;

  return false;
}
