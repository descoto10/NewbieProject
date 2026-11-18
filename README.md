# agent-store

An autonomous team of AI agents that researches niches, builds a print-on-demand Shopify store, runs ads and handles customer support. A safety layer keeps humans in control of money.

**Status: Week 1, shared contract + working skeleton on fake adapters.**

## Quick start

```bash
npm install        # only needed for typecheck
npm run demo       # Node 22.18+, runs with zero dependencies
npm run typecheck
```

The demo runs 4 stub agents through the full pipeline:

```
agent.run() -> Action[] -> risk layer -> PROCEED  -> spend governor reserves $ -> adapter executes -> event
                                      -> ASK_HUMAN -> decision inbox -> user approves/denies
                                      -> ABORT     -> logged with reason
```

Things the demo shows:
- An ad campaign launch (high risk) waits for human approval
- An oversized budget increase gets **aborted** because it would break the $200 loss cap
- A $34.99 refund is sent to a human because the support agent's limit is $25
- Every action is traced with its agent, reasoning and evidence

## Repo layout

| Path | What | Owner |
|---|---|---|
| `db/schema.sql` | v0 Postgres schema (16 tables) | Person 1 |
| `src/contract/actions.ts` | Action interface, risk tiers, verdicts | Person 2 |
| `src/contract/agents.ts` | `Agent.run(ctx) -> Action[]`, tools, permissions | All |
| `src/contract/adapters.ts` | Shopify / POD / Ads / Email interfaces | Person 1 |
| `src/contract/events.ts` | Event names the frontend subscribes to | Person 1 + 4 |
| `src/adapters/fake/` | In-memory fakes so everyone can build now | Person 1 |
| `src/core/orchestrator.ts` | Runs agents, routes verdicts, executes | Person 1 |
| `src/core/riskLayer.ts` | Classify, simulate, route | Person 2 |
| `src/core/spendGovernor.ts` | Reservation ledger + loss cap | Person 2 |
| `src/agents/fakeAgents.ts` | Stub agents to replace with LLM-backed ones | Person 3 + 4 |
| `web/prototype.html` | Clickable mobile prototype (inbox, P&L, org chart) | Person 4 |

## Workstreams

1. **Orchestration & state (Person 1):** Postgres + migrations, event log, workflows, adapter fakes, agent tracing
2. **Money & safety (Person 2):** spend governor, risk layer, permissions, Thompson sampling allocator, P&L, market simulator, week 6 gate
3. **Commerce agents (Person 3):** research, store build, product/creative, trademark screening, real Shopify + Printful adapters
4. **Growth & user (Person 4):** voice onboarding, ads agent + Meta adapter, support agent, mobile web app, demo

## Week 1 checklist

- [x] Agree on schema, Action, Agent, Adapter and Event contracts
- [x] Skeleton: fake agent -> action -> risk layer -> event
- [ ] Meta developer app + ad account (slow approval, start now)
- [ ] Shopify Partner account + dev store
- [ ] Printful / Printify API keys
- [ ] Domain + voice platform account
- [ ] Postgres running locally (docker) with `db/schema.sql` applied

## Rules

- Agents never call vendor SDKs directly. They go through adapters.
- Contract changes (`src/contract`, `db/schema.sql`) need a PR reviewed by at least one other person.
- Every new real adapter ships with its fake.
