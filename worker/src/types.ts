export interface Env {
  BLOCKSCOUT_API_KEY?: string;
  COINGECKO_API_KEY?: string;
  OPENSEA_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  /** Comma separated list of allowed origins. "*" allows all. */
  ALLOWED_ORIGINS?: string;
  /** Shared secret required to publish allowlists */
  ADMIN_TOKEN?: string;
  CACHE: KVNamespace;
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
