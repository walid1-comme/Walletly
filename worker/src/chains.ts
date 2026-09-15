export interface Chain {
  id: string;
  chainId: number;
  name: string;
  symbol: string;
  /** CoinGecko id for the native coin */
  nativeCgId: string;
  /** CoinGecko asset platform id, null when the chain is not indexed there */
  cgPlatform: string | null;
  explorer: string;
  color: string;
  /** Enabled by default in the UI */
  default: boolean;
}

export const CHAINS: Chain[] = [
  { id: 'ethereum',  chainId: 1,     name: 'Ethereum',  symbol: 'ETH', nativeCgId: 'ethereum', cgPlatform: 'ethereum',            explorer: 'https://eth.blockscout.com',          color: '#7B8CE8', default: true  },
  { id: 'base',      chainId: 8453,  name: 'Base',      symbol: 'ETH', nativeCgId: 'ethereum', cgPlatform: 'base',                explorer: 'https://base.blockscout.com',         color: '#4A7DF7', default: true  },
  { id: 'arbitrum',  chainId: 42161, name: 'Arbitrum',  symbol: 'ETH', nativeCgId: 'ethereum', cgPlatform: 'arbitrum-one',        explorer: 'https://arbitrum.blockscout.com',     color: '#5FB4D8', default: false },
  { id: 'optimism',  chainId: 10,    name: 'Optimism',  symbol: 'ETH', nativeCgId: 'ethereum', cgPlatform: 'optimistic-ethereum', explorer: 'https://optimism.blockscout.com',     color: '#EF6A5C', default: false },
  { id: 'polygon',   chainId: 137,   name: 'Polygon',   symbol: 'POL', nativeCgId: 'polygon-ecosystem-token', cgPlatform: 'polygon-pos', explorer: 'https://polygon.blockscout.com', color: '#B06FE0', default: false },
  { id: 'ink',       chainId: 57073, name: 'Ink',       symbol: 'ETH', nativeCgId: 'ethereum', cgPlatform: null,                  explorer: 'https://explorer.inkonchain.com',     color: '#B98CFF', default: true  },
  { id: 'robinhood', chainId: 4663,  name: 'Robinhood', symbol: 'ETH', nativeCgId: 'ethereum', cgPlatform: null,                  explorer: 'https://robinhoodchain.blockscout.com', color: '#4FBF87', default: true },
];

export const CHAIN_BY_ID = new Map(CHAINS.map((c) => [c.id, c]));

export function resolveChains(ids?: string[]): Chain[] {
  if (!ids || ids.length === 0) return CHAINS.filter((c) => c.default);
  const out: Chain[] = [];
  for (const id of ids) {
    const c = CHAIN_BY_ID.get(id);
    if (c) out.push(c);
  }
  return out.length ? out : CHAINS.filter((c) => c.default);
}
