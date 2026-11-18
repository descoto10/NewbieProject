# Hive: AI-run one-person company

Hive runs a small online business for you. A voice agent interviews you, a research agent proposes niches, and an orchestrator spins up an AI sub-team per niche to test it cheaply. It keeps what sells, kills the rest, and **never spends past your loss cap**.

> "Set a budget you're willing to lose. Hive finds something that sells, runs it, and never spends past your cap."

**Status: prototype v0.2.** Every MVP layer has a working first slice on fake adapters, with tests and a measurable result.

## Run it

```bash
npm run demo        # the full PRD user journey in the terminal
npm run scorecard   # one measurable result per workstream
npm test            # 17 tests, including a 1,000-market loss-cap fuzz test
npm run typecheck   # needs `npm install` once
open web/prototype.html   # clickable mobile prototype (Windows: start web\prototype.html)
```

Needs Node 22.18+. No other dependencies.

## Week 1 scorecard

| Workstream | Measurable result |
|---|---|
| **1. Orchestration & state** | 3 sub-teams spun up from chosen niches · 22/22 events persisted to disk and replayed · 100% of actions traced with agent + reasoning |
| **2. Money & safety** | **0 loss-cap breaches in 1,000 random markets** vs **390 (39%)** for a naive governor · action gate: 6 proceed / 2 ask / 1 abort |
| **3. Commerce agents** | 5 ranked niches with 4 evidence items each · 35 designs across 8 niches · 5 blocked by trademark/similarity screen |
| **4. Growth & user** | 5/5 profile fields pulled from the onboarding call, loss cap set to $150 · 80% of support emails handled without the user · refunds over $25 escalated |

## How it fits together

```
voice call ─► profile + loss cap ─► research: 5 ranked niches ─► user picks 2-3
                                                                    │
            ┌───────────────────── orchestrator ◄───────────────────┘
            ▼            (one sub-team per niche, event-sourced log)
  creative ─► store build ─► ads test ─► keep or kill ─► daily ops (support, ads)
                                   │
              every action ─► risk layer ─► PROCEED ─► spend governor ─► adapter
                                         ─► ASK_HUMAN ─► decision inbox
                                         ─► ABORT ─► logged
```

## What each part does

| Path | What | Owner |
|---|---|---|
| `src/core/eventLog.ts` | Append-only JSONL event log with replay | 1 |
| `src/core/orchestrator.ts` | Sub-team spin-up/kill, runs agents, routes verdicts | 1 |
| `src/core/spendGovernor.ts` | Hard loss-cap invariant (see below) | 2 |
| `src/core/allocator.ts` | Thompson sampling over product-creative pairs + kill rule | 2 |
| `src/core/pnl.ts` | P&L from orders, ad spend, POD, refunds, fees | 2 |
| `src/core/riskLayer.ts` | Classify, simulate, PROCEED / ASK_HUMAN / ABORT | 2 |
| `src/sim/market.ts` | Market simulator + random market generator for fuzzing | 2 |
| `src/agents/research.ts` | Scores candidates on trend, competition, margin, fit | 3 |
| `src/agents/creative.ts` | 3-5 designs per niche, trademark + look-alike screen | 3 |
| `src/agents/onboarding.ts` | Call transcript → profile + loss cap | 4 |
| `src/agents/support.ts` | Email triage, refunds ≤ $25 automatic | 4 |
| `web/prototype.html` | Clickable mobile prototype of the full journey | 4 |
| `src/contract/*`, `db/schema.sql` | Shared contract (change by PR only) | All |

## The loss-cap invariant (and the bug the fuzz test found)

`spent − order profit ≤ loss cap`, at every moment, enforced outside any LLM.

The first version broke the cap in 99 of 1,000 random markets. Orders bring in profit, but a refund takes it back and Hive still eats the print-on-demand cost. The governor now:
1. trusts profit only from orders past the refund window; pending orders count at their worst case (refunded)
2. reserves the worst-case POD cost of orders an ad spend *could* create before spending, then releases it

That answers a PRD open question: **the loss cap includes supplier costs on refunded orders.**

## Honest limits / next steps

- **Signal at $30 per niche is thin.** The kill rule needs about 110 clicks with no sales for 95% confidence, so mid-test kills rarely fire at PRD budgets. Keep-or-kill uses the pooled posterior instead. Shared priors across stores (PRD) are the real fix.
- All agents are rule-based v0s on fake data. Next: Claude-backed research + creative, real Shopify/Printful/Meta adapters, Postgres instead of JSONL.
- Week 6 gate: no real ad money until the governor runs a real capped test with zero breaches.
