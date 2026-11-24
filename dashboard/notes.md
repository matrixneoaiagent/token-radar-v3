# Field note 02 — the model behind the board

The snapshot is sealed DefiLlama data (`as_of` 2026-11-14): 758 protocols at or above $5M TVL, 40 on
the house watchlist. The board ranks every watchlist protocol plus every independent pre-token
protocol below the $50M floor — 178 rows.

## The claim

A protocol that records no token may issue one. If it does, and if it shares some of it with the
people who used the protocol, what would that token claim be worth? The model answers that narrower
question. It does not predict whether a token is issued, when, or at what price.

## The formula

```
implied = round(
    tvl_usd
  × effective_multiple    // min(category median mcap/TVL, family cap)
  × airdrop_propensity    // family prior
  × 0.50                  // launch, liquidity and execution risk
  × growth_multiplier     // 7-day TVL change, clamped -60%..+120%, 35% pass-through
  × tenure_multiplier     // days on record without a token, peak at 540 days
  × chain_multiplier      // 0.95..1.12, plus a small breadth bonus
)
```

## The category multiple

Every protocol that records a token and a market cap contributes `mcap_usd / tvl_usd`. Ratios
outside 0.005..10 are dropped, as is CEX. The global median is 0.24099 from 108 comparables. A
category with at least three comparables uses its own median; a thinner category inherits the global
median rather than inventing one from two noisy tokens.

## The family cap and the airdrop propensity

The family table is the answer to the obvious failure mode of a TVL-sorted board. Risk curators and
onchain capital allocators have enormous TVL, and their live comparables trade at rich market-cap/TVL
multiples, because the market is valuing a fee stream on other people's money. Apply that multiple to
AUM and the board becomes a fund ranking: Steakhouse Financial, Gauntlet and Veda sit at the top,
and the protocols a reader can actually farm are buried.

The brief asks for airdrop coins to farm, sorted by implied value, with the steps to farm them. So
the model separates what a token can capture from how much TVL the protocol touches:

| family | value cap | propensity | why |
| --- | ---: | ---: | --- |
| DeFi market | 0.45× | 1.00× | Swaps, lending, CDPs, yield, perps: the classic user-facing airdrop surface. |
| Chain / L2 | 0.35× | 1.05× | A chain token is the native asset of its own economy. |
| Infrastructure | 0.20× | 0.90× | Restaking, bridges, payments and middleware: useful, but a token captures less TVL. |
| Consumer | 0.35× | 0.95× | Prediction, launchpads, indexes and AI: the token is often the product. |
| RWA / CeFi | 0.06× | 0.35× | Tokenized funds, CeDeFi and wrappers: client money and permissioned launches. |
| Asset management | 0.02× | 0.15× | Risk curators and capital allocators: TVL is AUM, so only a thin fee stream belongs to a token. |
| Unclassified | 0.20× | 0.70× | A neutral prior, never a boost. |

The cap is applied by category word, never by protocol name. `categoryFamily` in `lib/model.ts`
reads `Risk Curators`, `Onchain Capital Allocator` and `Liquidity Manager` as asset management;
`RWA`, `CeDeFi`, `CEX` and `Stablecoin Wrapper` as RWA/CeFi; `Chain` as a chain; restaking, bridges,
payments and staking pools as infrastructure; prediction, launchpads, indexes and AI as consumer;
the DeFi words as the default; unknown categories get the neutral row. There is no protocol-name
branch in the model.

The propensity is not a probability. It is a prior weight: how much of the category's value a
farming token can plausibly capture. The cap bounds the multiple; the propensity discounts the
chance that a farming token exists at all.

## Growth, tenure and chain depth

The seven-day change is clamped to -60%..+120% and passed through at 35%. A +4,448% change is a +42%
lift, not a 45× one; a -72% change is a -21% cut. Tenure is days since DefiLlama began tracking:
0.70× at day 0, 0.90× at 90 days, 1.15× at 540 days, 1.12× at three years, 1.00× at five years,
0.90× beyond; a missing listing date takes 0.90×. Chain depth is log-scaled chain TVL:
`0.95 + 0.10 × best + 0.01 × extra deep chains`, capped at 1.12.

## The farm plan and the limits

Every row carries nine steps: wallet and funding, eligibility, bridge or onboard, the category's
core action, a second qualifying action, a weekly cadence, a hold period, a claim check, and an exit
plan. Every step states a cost and a time. Capital scales with TVL ($40 to $300), the gas band scales
with the chain, the hold is longer for young protocols, and the cadence is four to eight weekly
actions. The plans are operational sketches, not financial advice.

The detail view recomputes the implied value from the same stored factors and prints whether it
matches `board.json`. Ranks are exactly 1..N; the watchlist is covered 40/40. The live comparables
tab is separate: those protocols record a token, their market caps set the multiples, and they are
not farm targets. The snapshot is a record, not proof: a protocol that records no token may still
have one DefiLlama does not carry. TVL can be double-counted, and a seven-day change can be a pool
migration. The family priors are judgments, not measurements; the page shows them so a reader can
disagree.
