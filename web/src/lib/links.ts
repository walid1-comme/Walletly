/**
 * Outbound links. Every chain gets an explorer link. OpenSea links are
 * resolved through the API instead of guessed, because a broken marketplace
 * link costs more trust than a missing one.
 */

const EXPLORER: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  arbitrum: 'https://arbitrum.blockscout.com',
  optimism: 'https://optimism.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
  ink: 'https://explorer.inkonchain.com',
  robinhood: 'https://robinhoodchain.blockscout.com',
};

export function explorerToken(chain: string, contract: string): string | null {
  const base = EXPLORER[chain];
  if (!base || contract === 'native') return null;
  return `${base}/token/${contract}`;
}

export function explorerAddress(chain: string, address: string): string | null {
  const base = EXPLORER[chain];
  return base ? `${base}/address/${address}` : null;
}

/** Where to look at a fungible token's market. Covers every chain we support. */
export function dexscreener(contract: string): string | null {
  if (contract === 'native') return null;
  return `https://dexscreener.com/search?q=${contract}`;
}
