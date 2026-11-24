// The airdrop field guide's value model and board builder.
//
// The question is narrower than "what is this protocol worth": it is "if this protocol issued a
// token and shared some of it with the people who farmed it, what would that token claim be worth,
// and how hard is it to farm?" The model therefore starts from TVL, then applies a value multiple
// and an airdrop propensity that depend on what kind of protocol it is:
//
//   implied = round( tvl_usd
//                  * effective_multiple    // category median mcap/TVL, capped by family
//                  * airdrop_propensity    // how much of that value a farming token can capture
//                  * LAUNCH_DISCOUNT       // 0.50: launch, liquidity and execution risk
//                  * growth_multiplier     // 7-day TVL change, clamped and damped
//                  * tenure_multiplier     // how long it has run with no token
//                  * chain_multiplier )    // depth and breadth of its chains
//
// The two family terms are the entry's main claim, and they are the answer to the brief's warning
// that a board sorted by raw TVL or by market-cap comparables puts asset managers at the top. A
// risk curator's TVL is other people's capital: a token, if one comes, captures a fee stream, not
// the AUM. The same is true, more mildly, of RWA and CeFi wrappers. So the family table caps the
// value multiple and the propensity for those categories, and the page explains the cap in plain
// words. DeFi markets, chains/L2s, infrastructure and consumer protocols keep the high weights.
//
// The category multiple is learned from the snapshot itself: every protocol that already records a
// token and a market cap contributes mcap_usd / tvl_usd. A category with at least three comparables
// uses its own median; a thinner category inherits the global median. No protocol name is ever
// special-cased. The family cap is a policy prior about what kind of business a protocol is, and it
// is applied by category, never by name.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The six policy families, plus a neutral bucket for a category the snapshot does not name. */
export type FamilyKey = 'defi' | 'chain' | 'infra' | 'consumer' | 'rwa' | 'asset' | 'unknown';

/** One family's policy: what a token can capture, and how farmable the category is. */
export interface FamilyPolicy {
  key: FamilyKey;
  label: string;
  value_cap: number;
  propensity: number;
  note: string;
}

/** One category's learned multiple, its family cap and the value multiple that actually applies. */
export interface CategoryProfile {
  key: string;
  family: FamilyKey;
  n: number;
  median: number | null;
  cap: number;
  effective: number;
  source: 'category' | 'global';
}

/** One chain's total snapshot TVL and its 0..1 depth score. */
export interface ChainProfile {
  chain: string;
  tvl_usd: number;
  score: number;
}

/** The model's constants and learned tables: everything the dashboard needs to explain a row. */
export interface ModelContext {
  name: string;
  version: string;
  formula: string;
  global_multiple: number;
  global_sample: number;
  launch_discount: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_curve: Array<{ days: number; multiple: number }>;
  tenure_unknown: number;
  chain_floor: number;
  chain_range: number;
  chain_bonus: number;
  chain_bonus_min_score: number;
  chain_extra_max: number;
  chain_cap: number;
  category_floor: number;
  category_sample_min: number;
  families: FamilyPolicy[];
  categories: CategoryProfile[];
  chains: ChainProfile[];
}

/** The farm kit a reader needs before the numbered steps. */
export interface FarmKit {
  capital_usd: number;
  gas_band: string;
  hold_days: number;
  cadence_weeks: number;
}

/** Why a row is where it is, factor by factor. */
export interface RowModel {
  family: FamilyKey;
  family_label: string;
  category_key: string;
  category_median: number | null;
  category_raw: number;
  category_sample: number;
  category_source: 'category' | 'global';
  family_cap: number;
  effective_multiple: number;
  propensity: number;
  launch_discount: number;
  growth_pct: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  age_days: number | null;
  chain_multiplier: number;
  chain_best: string | null;
  chain_best_score: number;
  chain_extra: number;
  chain_count: number;
  tvl_rank: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: FamilyKey;
  family_label: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  below_floor: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: RowModel;
  farm_kit: FarmKit;
  why: string;
  farm_steps: string[];
}

/** A token-bearing protocol: its market cap is a fact, so it is a comparable, never a farm row. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  family: FamilyKey;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  ratio: number;
}

/** Everything the dashboard renders, written to data.js. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelContext;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  live_with_mcap: number;
  protocol_count: number;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The model's version label, shown on the page and quoted in the source. */
export const MODEL_VERSION = 'fieldnote-1';

/** How many independent pre-token protocols below the floor the early radar may add. */
export const EARLY_LIMIT = 180;

/**
 * The family policy. The caps are the entry's claim about token value capture, not facts:
 * a DeFi market can credit a large share of its TVL to a token; an asset manager cannot, because
 * the TVL is client money and the token would earn a management fee. The propensities say how
 * likely a farming token is to exist at all. Both are applied by category, never by protocol name.
 */
export const FAMILIES: FamilyPolicy[] = [
  {
    key: 'defi',
    label: 'DeFi market',
    value_cap: 0.45,
    propensity: 1.0,
    note: 'Swaps, lending, CDPs, yield and perps: the classic user-facing airdrop surface.',
  },
  {
    key: 'chain',
    label: 'Chain / L2',
    value_cap: 0.35,
    propensity: 1.05,
    note: 'A chain token is the native asset of its own economy; chains have the strongest launch record.',
  },
  {
    key: 'infra',
    label: 'Infrastructure',
    value_cap: 0.2,
    propensity: 0.9,
    note: 'Restaking, bridges, payments and middleware: useful, but a token captures less of the TVL.',
  },
  {
    key: 'consumer',
    label: 'Consumer',
    value_cap: 0.35,
    propensity: 0.95,
    note: 'Prediction, launchpads, indexes and AI: the token is often the product itself.',
  },
  {
    key: 'rwa',
    label: 'RWA / CeFi',
    value_cap: 0.06,
    propensity: 0.35,
    note: 'Tokenized funds, CeDeFi and wrappers: TVL is client money and launches are permissioned.',
  },
  {
    key: 'asset',
    label: 'Asset management',
    value_cap: 0.02,
    propensity: 0.15,
    note: 'Risk curators and capital allocators: TVL is AUM, so only a thin fee stream belongs to a token.',
  },
  {
    key: 'unknown',
    label: 'Unclassified',
    value_cap: 0.2,
    propensity: 0.7,
    note: 'A category the snapshot does not name; a neutral prior, never a boost.',
  },
];

/** Fast lookup by family key. */
export const FAMILY_BY_KEY: Record<FamilyKey, FamilyPolicy> = FAMILIES.reduce(
  (acc, family) => {
    acc[family.key] = family;
    return acc;
  },
  {} as Record<FamilyKey, FamilyPolicy>,
);

/** The base constants. Everything that changes a rank is here or learned in buildModelContext. */
export const BASE_CONSTANTS = {
  LAUNCH_DISCOUNT: 0.5,
  GROWTH_WEIGHT: 0.35,
  GROWTH_FLOOR: -60,
  GROWTH_CAP: 120,
  TENURE_UNKNOWN: 0.9,
  CHAIN_FLOOR: 0.95,
  CHAIN_RANGE: 0.1,
  CHAIN_BONUS: 0.01,
  CHAIN_BONUS_MIN_SCORE: 0.5,
  CHAIN_EXTRA_MAX: 5,
  CHAIN_CAP: 1.12,
  CATEGORY_FLOOR: 0.03,
  CATEGORY_SAMPLE_MIN: 3,
  RATIO_FLOOR: 0.005,
  RATIO_CAP: 10,
};

/**
 * The tenure curve: days since DefiLlama began tracking the protocol -> multiplier.
 * A pre-token protocol is most interesting after it has survived a year and a half without a
 * token: old enough to be real, young enough that a launch is still ahead. A very new listing is
 * unproven, and a very old one has had many chances already.
 */
export const TENURE_CURVE: Array<{ days: number; multiple: number }> = [
  { days: 0, multiple: 0.7 },
  { days: 90, multiple: 0.9 },
  { days: 540, multiple: 1.15 },
  { days: 1095, multiple: 1.12 },
  { days: 1825, multiple: 1.0 },
  { days: 3650, multiple: 0.9 },
];

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Exchange-branded products are not independent pre-token protocols. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
/** A wrapped or staked product is not a token waiting to be born. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** The categories the house watchlist treats as products of a token that already trades. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The middle of a list (the mean of the two middles when even), or null for an empty list. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records a token: either DefiLlama field is enough. */
export function hasToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/** Whether a protocol records no token at all: the board's subject. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a pre-token protocol is an independent subject rather than a wrapped, staked, bridged,
 * versioned or exchange-branded product. This is the same screen the house applied above the floor;
 * below the floor the entry applies it itself so the early radar does not rank a product as a launch.
 */
export function isIndependentPreToken(p: SnapshotProtocol): boolean {
  if (!recordsNoToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  return true;
}

/** A protocol's display category key: null becomes Other. */
export function categoryKey(p: SnapshotProtocol): string {
  return p.category ?? 'Other';
}

/**
 * The family classifier. It reads the snapshot's category words, never a protocol's name. The
 * order matters: an asset manager is caught before the generic "collateral" and "defi" patterns,
 * and a stablecoin wrapper is RWA-like before "stable" would put it in DeFi.
 */
export function categoryFamily(category: string | null): FamilyKey {
  const c = (category ?? '').trim().toLowerCase();
  if (c.length === 0) return 'unknown';
  if (/risk curator|capital allocator|liquidity manager|asset manag|fund manager|collateral management/.test(c)) {
    return 'asset';
  }
  if (/rwa|real world|cedefi|cex|crypto card|otc marketplace|reserve currency|stablecoin wrapper/.test(c)) {
    return 'rwa';
  }
  if (/^chain$|rollup|layer 2|l2/.test(c)) return 'chain';
  if (
    /bridge|oracle|privacy|payment|token locker|governance|restak|staking pool|liquid staking|collateral market|anchor btc|decentralized btc|infrastructure/.test(
      c,
    )
  ) {
    return 'infra';
  }
  if (/prediction|launchpad|nft|gaming|social|creator|ai agent|decentralized ai|index/.test(c)) {
    return 'consumer';
  }
  if (
    /dex|lend|cdp|yield|derivative|basis|insurance|farm|leveraged|option|stable|synthetic|interest rate|uncollateralized|perpetual|collateral/.test(
      c,
    )
  ) {
    return 'defi';
  }
  return 'unknown';
}

/** The family policy for a category. */
export function familyPolicy(category: string | null): FamilyPolicy {
  return FAMILY_BY_KEY[categoryFamily(category)];
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Learn the model's tables from the snapshot:
 * - the global market-cap / TVL median of protocols that already record a token and a market cap;
 * - per-category medians when the category has at least three such comparables;
 * - each chain's total snapshot TVL and a log-scaled depth score.
 * The family caps are applied last, so a category's own median can never override its family.
 */
export function buildModelContext(snapshot: Snapshot): ModelContext {
  const live = snapshot.protocols
    .filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .map((p) => ({ protocol: p, ratio: (p.mcap_usd as number) / p.tvl_usd }))
    .filter((x) => x.ratio >= BASE_CONSTANTS.RATIO_FLOOR && x.ratio <= BASE_CONSTANTS.RATIO_CAP);
  const globalMultiple = clamp(median(live.map((x) => x.ratio)) ?? 0.25, BASE_CONSTANTS.CATEGORY_FLOOR, 5);

  const byCategory = new Map<string, number[]>();
  for (const x of live) {
    const key = categoryKey(x.protocol);
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [x.ratio]);
    else list.push(x.ratio);
  }

  const categories: CategoryProfile[] = [...byCategory.entries()]
    .map(([key, ratios]) => {
      const own = median(ratios);
      const useOwn = ratios.length >= BASE_CONSTANTS.CATEGORY_SAMPLE_MIN && own !== null;
      const family = categoryFamily(key === 'Other' ? null : key);
      const cap = FAMILY_BY_KEY[family].value_cap;
      const raw = useOwn ? (own as number) : globalMultiple;
      const effective = Math.min(cap, Math.max(BASE_CONSTANTS.CATEGORY_FLOOR, raw));
      return {
        key,
        family,
        n: ratios.length,
        median: own === null ? null : round6(own),
        cap,
        effective: round6(effective),
        source: useOwn ? ('category' as const) : ('global' as const),
      };
    })
    .sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const chainDepth = new Map<string, number>();
  for (const p of snapshot.protocols) {
    for (const chain of p.chains) chainDepth.set(chain, (chainDepth.get(chain) ?? 0) + p.tvl_usd);
  }
  const depths = [...chainDepth.values()].filter((v) => v > 0);
  const minLog = depths.length > 0 ? Math.log1p(Math.min(...depths)) : 0;
  const maxLog = depths.length > 0 ? Math.log1p(Math.max(...depths)) : 1;
  const span = maxLog - minLog > 0 ? maxLog - minLog : 1;
  const chains: ChainProfile[] = [...chainDepth.entries()]
    .map(([chain, tvl]) => ({ chain, tvl_usd: tvl, score: (Math.log1p(tvl) - minLog) / span }))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0));

  return {
    name: 'Field Note 1',
    version: MODEL_VERSION,
    formula:
      'implied = round(tvl_usd × effective_multiple × airdrop_propensity × 0.50 × growth × tenure × chain_depth)',
    global_multiple: round6(globalMultiple),
    global_sample: live.length,
    launch_discount: BASE_CONSTANTS.LAUNCH_DISCOUNT,
    growth_weight: BASE_CONSTANTS.GROWTH_WEIGHT,
    growth_floor: BASE_CONSTANTS.GROWTH_FLOOR,
    growth_cap: BASE_CONSTANTS.GROWTH_CAP,
    tenure_curve: TENURE_CURVE,
    tenure_unknown: BASE_CONSTANTS.TENURE_UNKNOWN,
    chain_floor: BASE_CONSTANTS.CHAIN_FLOOR,
    chain_range: BASE_CONSTANTS.CHAIN_RANGE,
    chain_bonus: BASE_CONSTANTS.CHAIN_BONUS,
    chain_bonus_min_score: BASE_CONSTANTS.CHAIN_BONUS_MIN_SCORE,
    chain_extra_max: BASE_CONSTANTS.CHAIN_EXTRA_MAX,
    chain_cap: BASE_CONSTANTS.CHAIN_CAP,
    category_floor: BASE_CONSTANTS.CATEGORY_FLOOR,
    category_sample_min: BASE_CONSTANTS.CATEGORY_SAMPLE_MIN,
    families: FAMILIES,
    categories,
    chains,
  };
}

/** The category's profile, with a neutral global fallback for a category with no live comparables. */
export function categoryProfile(context: ModelContext, key: string): CategoryProfile {
  return (
    context.categories.find((c) => c.key === key) ?? {
      key,
      family: key === 'Other' ? 'unknown' : categoryFamily(key),
      n: 0,
      median: null,
      cap: FAMILY_BY_KEY[key === 'Other' ? 'unknown' : categoryFamily(key)].value_cap,
      effective: Math.min(
        FAMILY_BY_KEY[key === 'Other' ? 'unknown' : categoryFamily(key)].value_cap,
        Math.max(BASE_CONSTANTS.CATEGORY_FLOOR, context.global_multiple),
      ),
      source: 'global',
    }
  );
}

/** The tenure multiplier at a given age, linearly interpolated through TENURE_CURVE. */
export function tenureMultiplier(age: number | null): number {
  if (age === null) return BASE_CONSTANTS.TENURE_UNKNOWN;
  const d = Math.max(0, age);
  const first = TENURE_CURVE[0]!;
  if (d <= first.days) return first.multiple;
  for (let i = 1; i < TENURE_CURVE.length; i++) {
    const before = TENURE_CURVE[i - 1]!;
    const after = TENURE_CURVE[i]!;
    if (d <= after.days) {
      const t = (d - before.days) / (after.days - before.days);
      return round6(before.multiple + (after.multiple - before.multiple) * t);
    }
  }
  return TENURE_CURVE[TENURE_CURVE.length - 1]!.multiple;
}

/** The growth multiplier: clamp the seven-day change, then pass it through at 35%. */
export function growthMultiplier(change7d: number | null): { pct: number; multiplier: number } {
  if (change7d === null) return { pct: 0, multiplier: 1 };
  const pct = clamp(change7d, BASE_CONSTANTS.GROWTH_FLOOR, BASE_CONSTANTS.GROWTH_CAP);
  return { pct: round6(pct), multiplier: round6(1 + (pct / 100) * BASE_CONSTANTS.GROWTH_WEIGHT) };
}

/** The chain multiplier: the deepest chain's score plus a small breadth bonus. */
export function chainMultiplier(
  p: SnapshotProtocol,
  context: ModelContext,
): { multiplier: number; best: string | null; bestScore: number; extra: number } {
  const profiles = p.chains
    .map((chain) => ({ chain, score: context.chains.find((c) => c.chain === chain)?.score ?? 0 }))
    .sort((a, b) => b.score - a.score);
  if (profiles.length === 0) {
    return { multiplier: BASE_CONSTANTS.CHAIN_FLOOR, best: null, bestScore: 0, extra: 0 };
  }
  const best = profiles[0]!;
  const extra = profiles.filter((x, i) => i > 0 && x.score >= BASE_CONSTANTS.CHAIN_BONUS_MIN_SCORE).length;
  const bonus = Math.min(BASE_CONSTANTS.CHAIN_EXTRA_MAX, extra) * BASE_CONSTANTS.CHAIN_BONUS;
  const multiplier = Math.min(
    BASE_CONSTANTS.CHAIN_CAP,
    BASE_CONSTANTS.CHAIN_FLOOR + BASE_CONSTANTS.CHAIN_RANGE * best.score + bonus,
  );
  return { multiplier: round6(multiplier), best: best.chain, bestScore: round6(best.score), extra };
}

/** The factors behind one protocol's implied value. */
export interface ImpliedValue {
  implied: number;
  age: number | null;
  family: FamilyPolicy;
  category: CategoryProfile;
  growthPct: number;
  growthMult: number;
  tenureMult: number;
  chainMult: number;
  chainBest: string | null;
  chainBestScore: number;
  chainExtra: number;
  raw: number;
}

/** Score one protocol with the context's learned tables and family policy. */
export function impliedValue(p: SnapshotProtocol, asOf: string, context: ModelContext): ImpliedValue {
  const age = ageDays(asOf, p.listed_at);
  const key = categoryKey(p);
  const category = categoryProfile(context, key);
  const family = FAMILY_BY_KEY[category.family];
  const growth = growthMultiplier(p.change_7d);
  const tenureMult = tenureMultiplier(age);
  const chain = chainMultiplier(p, context);
  const raw =
    p.tvl_usd *
    category.effective *
    family.propensity *
    context.launch_discount *
    growth.multiplier *
    tenureMult *
    chain.multiplier;
  return {
    implied: Math.max(1, Math.min(100_000_000_000_000, Math.round(raw))),
    age,
    family,
    category,
    growthPct: growth.pct,
    growthMult: growth.multiplier,
    tenureMult,
    chainMult: chain.multiplier,
    chainBest: chain.best,
    chainBestScore: chain.bestScore,
    chainExtra: chain.extra,
    raw,
  };
}

/** A sane, exact dollar string for the model's own prose (not the page's short form). */
function usdText(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** 1 -> 1st, 2 -> 2nd, 12 -> 12th. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  return `${n}${mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th'}`;
}

/**
 * The row's own explanation, built from the same factors the model used. It names the family cap,
 * the category sample, the clamped growth, the tenure and the chain depth, and it says plainly why
 * an asset manager is capped.
 */
export function whyRank(row: BoardRow, tvlRank: number, boardSize: number): string {
  const m = row.model;
  const cat = row.category ?? 'This category';
  const sourceText =
    m.category_source === 'category'
      ? `${cat} has ${m.category_sample} live comparables, and their median multiple is ${(m.category_median ?? 0).toFixed(3)}×.`
      : `${cat} has ${m.category_sample} live comparable${m.category_sample === 1 ? '' : 's'}, below the ${BASE_CONSTANTS.CATEGORY_SAMPLE_MIN} needed for its own median, so the global ${m.category_raw.toFixed(3)}× applies.`;
  const capText =
    m.effective_multiple < m.category_raw
      ? ` The ${m.family_label} family cap cuts that to ${m.effective_multiple.toFixed(3)}×.`
      : '';
  const familyText =
    m.family === 'asset'
      ? ` ${m.family_label} TVL is other people's capital: the model caps the value multiple at ${m.family_cap.toFixed(2)}× and the airdrop propensity at ${m.propensity.toFixed(2)}×, so a large AUM cannot crowd out a user-facing farm.`
      : m.family === 'rwa'
        ? ` ${m.family_label} TVL is mostly client money, so the cap is deliberately low at ${m.family_cap.toFixed(2)}× with a ${m.propensity.toFixed(2)}× propensity.`
        : ` ${m.family_label} keeps a ${m.propensity.toFixed(2)}× airdrop propensity and a ${m.family_cap.toFixed(2)}× value cap.`;
  const ageText =
    m.age_days === null
      ? `Its listing date is not recorded, so the neutral ${m.tenure_multiplier.toFixed(2)}× tenure multiplier applies.`
      : `${m.age_days} days without a token gives the ${m.tenure_multiplier.toFixed(2)}× tenure multiplier.`;
  const growthText =
    row.change_7d === null
      ? 'No seven-day change is reported, so growth is neutral.'
      : `The seven-day change is ${row.change_7d.toFixed(2)}%, clamped to ${m.growth_pct.toFixed(2)}% and passed through at ${m.growth_multiplier.toFixed(3)}×.`;
  const chainText =
    m.chain_best === null
      ? `No chain is recorded, so the chain multiplier is ${m.chain_multiplier.toFixed(3)}×.`
      : `Its deepest chain is ${m.chain_best} (depth score ${m.chain_best_score.toFixed(2)}), and ${m.chain_count} chain${m.chain_count === 1 ? '' : 's'} ${m.chain_count === 1 ? 'gives' : 'give'} the ${m.chain_multiplier.toFixed(3)}× chain multiplier.`;
  return `Rank ${row.rank} of ${boardSize}. TVL of ${usdText(row.tvl_usd)} is the ${ordinal(tvlRank)} largest on the board. ${sourceText}${capText}${familyText} ${ageText} ${growthText} ${chainText}`;
}

/** A farm step as the one string board.json carries: action, cost and time inside the gate's limits. */
export function stepText(action: string, cost: string, time: string): string {
  let s = `${action} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Check the protocol's own page and keep the receipt.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 50_000_000) return 120;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 40;
}

/** How long to hold, from the protocol's tracking age: younger protocols need a longer record. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 90) return 90;
  if (age < 365) return 75;
  if (age < 1095) return 60;
  return 45;
}

/** How many weekly actions to plan, capped so the plan stays a routine rather than a job. */
function cadenceWeeksFor(hold: number): number {
  return Math.max(4, Math.min(8, Math.ceil(hold / 14)));
}

/** A rough fee band for the chain, so every plan states a real cost rather than "gas". */
function gasBand(chain: string): string {
  if (chain === 'Ethereum') return '$8-$25';
  if (chain === 'Bitcoin') return '$2-$10';
  const veryCheap = new Set([
    'Solana',
    'Sui',
    'Aptos',
    'Tron',
    'Binance',
    'Monad',
    'Hyperliquid L1',
    'Plasma',
    'Bittensor',
    'Noble',
    'Neutron',
    'Sei',
    'XION',
    'RISE',
    'Sonic',
  ]);
  if (veryCheap.has(chain)) return '$0.01-$0.60';
  const cheap = new Set([
    'Arbitrum',
    'Optimism',
    'Base',
    'Polygon',
    'Scroll',
    'Linea',
    'zkSync Era',
    'Mantle',
    'Blast',
    'Mode',
    'Berachain',
    'Unichain',
    'Ink',
    'Avalanche',
    'Celo',
    'Gnosis',
    'Flare',
    'Stellar',
    'Ripple',
    'Algorand',
    'Aleo',
    'Sophon',
    'Story',
    'Citrea',
    'Plume Mainnet',
    'World Chain',
    'Etherlink',
    'Katana',
    'Tempo',
    'Robinhood Chain',
    'Arc',
    'Pharos',
    'Mezo',
    'BSquared',
    'CORE',
    'Babylon Genesis',
    'Starknet',
    'Manta',
    'Alephium',
  ]);
  if (cheap.has(chain)) return '$0.10-$2.00';
  return '$1-$5';
}

/** The category's one main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string, family: FamilyPolicy): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp manager') || c.includes('uncollateralized')) {
    return `Supply $${capital} of USDC to ${name}'s ${chain} market, then borrow no more than 20% of it against the position and keep the health factor above 2.2.`;
  }
  if (c.includes('cdp')) {
    return `Open a ${name} vault on ${chain} with $${capital} of collateral, mint at most 30% of its value, and repay before the stability fee compounds.`;
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return `Add $${capital} of liquidity to ${name}'s deepest ${chain} pool, pairing USDC with the chain's gas token, and stake the LP receipt if the protocol offers staking.`;
  }
  if (c.includes('restak') || c.includes('liquid restak')) {
    return `Restake $${capital} of ${chain}'s native asset through ${name}, confirm the operator set and the slashing terms, and keep the liquid receipt in the same wallet.`;
  }
  if (c.includes('collateral market')) {
    return `Supply $${capital} of USDC or ${chain}'s native asset as collateral on ${name}'s ${chain} market, pick one operator or vault, and keep the position open through the hold window.`;
  }
  if (c.includes('anchor btc') || c.includes('decentralized btc')) {
    return `Mint $${capital} of ${name}'s BTC-backed asset on ${chain}, confirm the collateral ratio and the redemption path, and keep the receipt in the same wallet.`;
  }
  if (c.includes('governance')) {
    return `Lock $${capital} of ${chain}'s governance asset on ${name}, vote once, and keep the lock through the hold window.`;
  }
  if (c.includes('staking pool') || c.includes('liquid staking')) {
    return `Stake $${capital} of ${chain}'s native asset through ${name}, confirm the validator or operator set, and keep the liquid receipt in the same wallet.`;
  }
  if (c.includes('basis')) {
    return `Deposit $${capital} of USDC on ${name}, open a delta-neutral basis position (long spot against a short perpetual), and keep the hedge within 1.1x.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} for ${chain}'s main asset, read the waiting period and exclusions, and keep the certificate.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} and place one small market position on ${name}, then keep the position open through the hold window and claim any resolved payout yourself.`;
  }
  if (c.includes('launchpad')) {
    return `Stake $${capital} in ${name}'s launch pool on ${chain}, commit to one project, and read the vesting and refund terms before the sale closes.`;
  }
  if (c.includes('index')) {
    return `Mint $${capital} of ${name}'s ${chain} index receipt, confirm its constituents and rebalance rule, and hold the receipt in the same wallet.`;
  }
  if (c.includes('payment')) {
    return `Open a ${name} channel with $${capital} of ${chain} liquidity, route three small payments through it, and keep the channel open through the hold window.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}'s official gateway, swap half into the chain's gas token, and use one native dApp on the chain.`;
  }
  if (c.includes('rwa')) {
    return `Subscribe $${capital} of ${name}'s ${chain} yield asset, confirm the issuer, the redemption window and any transfer restrictions, and keep the receipt.`;
  }
  if (family.key === 'asset') {
    return `Deposit $${capital} of USDC into a ${name}-managed ${chain} vault, confirm the curator, the fee and the lockup, and keep the vault shares in the same wallet.`;
  }
  if (c.includes('yield') || c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s flagship ${chain} vault, confirm its fee, curator and lockup, and keep the receipt token in the same wallet.`;
  }
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name}, open one small hedged position on ${chain}, and keep leverage below 2x.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}, confirm the collateral ratio, and keep the position open through the hold window.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain}, confirm the position is visible in the app, and keep the receipt and the transaction hash.`;
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written name list.
 */
export function farmPlan(
  p: SnapshotProtocol,
  age: number | null,
  preferredChain?: string | null,
): { steps: string[]; kit: FarmKit } {
  const chain = preferredChain ?? chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = cadenceWeeksFor(hold);
  const gas = gasBand(chain);
  const family = familyPolicy(p.category);
  const action = actionFor(p, capital, chain, family);
  const onboard =
    chain === 'Ethereum'
      ? `Keep at least ${gas} of ETH in the wallet for the deposit and the exit; if the wallet was funded in ETH, swap only the $${capital} you plan to deposit into USDC.`
      : chain === 'Solana'
        ? `Send $${capital} of USDC to the wallet over Solana and keep 0.05 SOL for fees and token accounts.`
        : `Bridge $${capital} of USDC to ${chain} with the chain's official bridge or a canonical pool, and check the fee and the received amount before signing.`;
  const steps = [
    stepText(
      `Open a fresh wallet for this farm only, write the seed phrase on paper and store it offline, then fund it with $${capital} of USDC plus ${gas} for fees on ${chain}.`,
      `$${capital} capital + ${gas} gas`,
      '10 minutes',
    ),
    stepText(
      `Read ${p.name}'s eligibility, sanctions and jurisdiction rules before you start; use one wallet in your own name and never a VPN or a second account to fake a jurisdiction.`,
      '$0',
      '10 minutes',
    ),
    stepText(onboard, `$1-$8 bridge or swap fee + ${gas} gas`, chain === 'Ethereum' ? '5-10 minutes' : '10-20 minutes'),
    stepText(action, `$${capital} capital + ${gas} gas`, '15-30 minutes'),
    stepText(
      `Make a second qualifying action in week one: a small swap, a borrow, a governance vote or a second pool on ${p.name}; keep it under 10% of the position.`,
      '$2-$6 gas',
      '10 minutes',
    ),
    stepText(
      `Repeat one small action each week for ${weeks} weeks: vary the amount and the action so the wallet reads as a real user, not a script.`,
      '$2-$6 gas a week',
      '10 minutes a week',
    ),
    stepText(
      `Keep the position open for at least ${hold} days and across two of ${p.name}'s own reporting snapshots; do not move it to another wallet before the hold ends.`,
      `$${capital} stays deposited; opportunity cost only`,
      `${hold} days`,
    ),
    stepText(
      `Check ${p.name}'s official site and social account once a week for a points, quest or claim page; never pay a fee and never sign a claim that arrives by direct message.`,
      '$0 to check; never pay to claim',
      '5 minutes a week',
    ),
    stepText(
      `Log the wallet, dates, transaction hashes and pool or vault addresses; write the exit plan before depositing, with two withdrawal steps and ${gas} kept for the second transaction.`,
      '$0',
      '10 minutes',
    ),
  ];
  return { steps, kit: { capital_usd: capital, gas_band: gas, hold_days: hold, cadence_weeks: weeks } };
}

/** The live-token protocols with a recorded market cap: the comparables behind the category multiples. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(
      (p) =>
        hasToken(p) &&
        p.mcap_usd !== null &&
        p.mcap_usd > 0 &&
        p.tvl_usd > 0 &&
        p.category !== 'CEX' &&
        (p.mcap_usd as number) / p.tvl_usd >= BASE_CONSTANTS.RATIO_FLOOR &&
        (p.mcap_usd as number) / p.tvl_usd <= BASE_CONSTANTS.RATIO_CAP,
    )
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .map((p) => {
      const family = categoryFamily(p.category);
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        family,
        chains: p.chains,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd as number,
        change_7d: p.change_7d,
        listed_at: p.listed_at,
        ratio: round6((p.mcap_usd as number) / p.tvl_usd),
      };
    });
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The ranked board: every watchlist slug, plus every independent pre-token protocol below the floor.
 * Above the floor the house's watchlist is the screen; below it the entry applies the same product
 * screen itself. The two sets never overlap, and a watchlist slug is never dropped.
 */
export function buildBoard(snapshot: Snapshot, context: ModelContext): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isIndependentPreToken(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_LIMIT);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, context) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const tvlOrder = scored
    .slice()
    .sort((a, b) => b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const tvlRank = new Map<string, number>(tvlOrder.map((x, i) => [x.p.slug, i + 1]));
  const watch = new Set(snapshot.watchlist);

  return scored.map(({ p, v }, i) => {
    const chain = p.chains[0] ?? v.chainBest ?? null;
    const plan = farmPlan(p, v.age, chain);
    const row: BoardRow = {
      rank: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      family: v.category.family,
      family_label: v.family.label,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      watchlist: watch.has(p.slug),
      below_floor: p.tvl_usd < snapshot.floor_usd,
      age_days: v.age,
      implied_value_usd: v.implied,
      model: {
        family: v.category.family,
        family_label: v.family.label,
        category_key: v.category.key,
        category_median: v.category.median,
        category_raw: round6(
          Math.min(
            5,
            Math.max(
              BASE_CONSTANTS.CATEGORY_FLOOR,
              v.category.source === 'category' ? (v.category.median ?? context.global_multiple) : context.global_multiple,
            ),
          ),
        ),
        category_sample: v.category.n,
        category_source: v.category.source,
        family_cap: v.family.value_cap,
        effective_multiple: v.category.effective,
        propensity: v.family.propensity,
        launch_discount: context.launch_discount,
        growth_pct: v.growthPct,
        growth_multiplier: v.growthMult,
        tenure_multiplier: v.tenureMult,
        age_days: v.age,
        chain_multiplier: v.chainMult,
        chain_best: v.chainBest,
        chain_best_score: v.chainBestScore,
        chain_extra: v.chainExtra,
        chain_count: p.chains.length,
        tvl_rank: tvlRank.get(p.slug) ?? 0,
      },
      farm_kit: plan.kit,
      why: '',
      farm_steps: plan.steps,
    };
    row.why = whyRank(row, tvlRank.get(p.slug) ?? 0, scored.length);
    return row;
  });
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const context = buildModelContext(snapshot);
  const board = buildBoard(snapshot, context);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const liveWithMcap = snapshot.protocols.filter((p) => hasToken(p) && p.mcap_usd !== null && p.mcap_usd > 0).length;
  const boardCategories = new Set(board.map((r) => r.model.category_key));
  const categories = context.categories
    .slice()
    .sort((a, b) => {
      const aOn = boardCategories.has(a.key) ? 1 : 0;
      const bOn = boardCategories.has(b.key) ? 1 : 0;
      return bOn - aOn || b.n - a.n || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: { ...context, categories, chains: context.chains.slice(0, 28) },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: snapshot.protocols.filter((p) => hasToken(p)).length,
    live_with_mcap: liveWithMcap,
    protocol_count: snapshot.protocols.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. Mirrors the gate's own rows. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, not 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears more than once';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const invented = board.filter((r) => !known.has(r.slug));
  if (invented.length > 0) return `the board names ${invented.length} slug(s) the snapshot does not list: ${invented.slice(0, 3).map((r) => r.slug).join(', ')}`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has no name`;
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
