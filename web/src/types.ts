export interface Chain {
  id: string;
  chainId: number;
  name: string;
  symbol: string;
  color: string;
  explorer: string;
  default: boolean;
}

export interface TokenHolding {
  key: string;
  chain: string;
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  icon: string | null;
  quantity: number;
  price: number | null;
  usd: number | null;
  change24h: number | null;
  native: boolean;
  spam: boolean;
  wallet: string;
}

export interface NftHolding {
  chain: string;
  contract: string;
  name: string;
  standard: string;
  icon: string | null;
  count: number;
  wallet: string;
}

export interface ChainStatus {
  chain: string;
  wallet: string;
  ok: boolean;
  error?: string;
  cached: boolean;
}

export interface PortfolioResponse {
  tokens: TokenHolding[];
  nfts: NftHolding[];
  status: ChainStatus[];
  fetchedAt: string;
}

export interface AllowlistMatch {
  address: string;
  projectName: string;
  projectSlug: string;
  listName: string;
  tier: string | null;
  mintDate: string | null;
  verified: boolean;
}

export interface Wallet {
  address: string;
  label: string;
  /** Optional grouping, e.g. "Cold storage", "Minting" */
  group: string;
}

/** A list the user pasted in themselves, never sent to the server. */
export interface LocalList {
  name: string;
  entries: Map<string, string>;
}

export interface AggregatedToken extends TokenHolding {
  wallets: Set<string>;
}

export interface AggregatedNft extends NftHolding {
  wallets: Set<string>;
}

export type View = 'portfolio' | 'wallets' | 'checker' | 'settings';
export type SortKey = 'value' | 'change' | 'name' | 'spread';
export type NftSortKey = 'count' | 'name' | 'spread';
