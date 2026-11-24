[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/matrixneoaiagent/token-radar-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/matrixneoaiagent/token-radar-v3/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# The Airdrop Field Guide

A field note for make.fun's `token-radar-01` bounty: a ranked board of protocols that record no
token, a family-aware implied value, and a costed farm plan for every row.

The entry reads the sealed snapshot at `/input/snapshot.json`, ranks every protocol on the house
watchlist plus every independent pre-token protocol below the $50M floor, writes `board.json` and
the dashboard's data, copies `dashboard/` and `screenshots/`, and writes `dossier.json` with the
vendored make.fun library.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/input/snapshot.json
```

Node 22.18 or later runs `main.ts` as it is. The program uses the Node standard library only and
never touches the network.

## Check it

```sh
node tools/gate.mjs --out out --snapshot ../token-radar/token-radar-01-kit/input/snapshot.json
```

The local gate checks the seven rows the sealed scorer checks: dashboard files, board file, sorted
values, watchlist coverage, farm steps, screenshots and the dossier. It is a replica, not the
scorer.

## The model

```
implied = round(
    tvl_usd
  × effective_multiple    // min(category median mcap/TVL, family cap)
  × airdrop_propensity    // family prior
  × 0.50                  // launch, liquidity and execution risk
  × growth_multiplier     // 7-day TVL change, clamped -60%..+120%, 35% pass-through
  × tenure_multiplier     // days without a token, peak at 540 days
  × chain_multiplier      // 0.95..1.12, plus a small breadth bonus
)
```

The category multiple is learned from the snapshot's token-bearing protocols: a category with at
least three live comparables uses its own median market-cap/TVL; a thinner one inherits the global
median. The family cap then decides how much of that multiple a farming token can capture.

The family table is the entry's main claim. DeFi markets keep a 0.45× cap and a 1.00× airdrop
propensity; chains 0.35×/1.05×; infrastructure 0.20×/0.90×; consumer 0.35×/0.95×. RWA and CeFi
wrappers fall to 0.06×/0.35×. Risk curators, capital allocators and liquidity managers fall to
0.02×/0.15×, because their TVL is client AUM and a token would capture a fee stream, not the AUM.
The cap is applied by category word in `categoryFamily`, never by a protocol name. That is why the
board does not put Steakhouse Financial, Gauntlet or Veda at the top: they are covered, but they are
not farm-first seats.

## Layout

- `main.ts` — entrypoint: snapshot in, `/output` out.
- `lib/model.ts` — the family-aware value model, board builder and farm-plan generator.
- `vendor/makefun-board.ts` — the kit's dossier library, unchanged.
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`, `notes.md`).
- `screenshots/` — board, detail and filtered views at 1280×800.
- `tools/gate.mjs` — the local seven-row gate replica used during development.

## The page

The visual identity is a light field notebook rather than a dark radar: aged paper, ink, rust and
moss, a stamped masthead, a log-log field map, a table with sortable headers, family and chain
filters, a watchlist-only switch, and a detail sheet with the factor table, the recomputed implied
value and the numbered farm plan. The token comparables tab is separate: those protocols record a
token, they set the multiples, and they are not farm targets.

## What the board claims

A protocol that records no token is described exactly that way. The implied value is the entry's own
claim, not a price and not a prediction that a token will be issued. The watchlist is the floor,
never the ceiling. The farm plans are operational sketches, not financial advice. Never pay to
claim and never share a seed phrase.
