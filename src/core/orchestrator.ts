// Orchestrator: runs agents, pushes every action through the risk layer,
// executes PROCEED, queues ASK_HUMAN for the decision inbox, logs ABORT.
// Later this becomes Temporal workflows (or a Postgres job queue). Owner: Person 1

import type { ClassifiedAction } from '../contract/actions.ts';
import type { Adapters } from '../contract/adapters.ts';
import type { Agent } from '../contract/agents.ts';
import { Events } from '../contract/events.ts';
import type { EventBus } from './eventBus.ts';
import { evaluate } from './riskLayer.ts';
import type { SpendGovernor } from './spendGovernor.ts';

export interface SubTeam {
  id: string;
  nicheId: string;
  nicheName: string;
  budgetCents: number;
  status: 'testing' | 'scaling' | 'killed';
  agents: string[];
}

export class Orchestrator {
  pendingApprovals: ClassifiedAction[] = [];
  trace: ClassifiedAction[] = [];

  private storeId: string;
  private adapters: Adapters;
  private governor: SpendGovernor;
  private bus: EventBus;

  constructor(storeId: string, adapters: Adapters, governor: SpendGovernor, bus: EventBus) {
    this.storeId = storeId;
    this.adapters = adapters;
    this.governor = governor;
    this.bus = bus;
  }

  async runAgent(agent: Agent, subTeamId: string | null) {
    const actions = await agent.run({
      storeId: this.storeId,
      subTeamId,
      remainingBudgetCents: subTeamId ? this.governor.subTeamRemaining(subTeamId) : this.governor.availableCents,
      adapters: this.adapters,
      now: new Date(),
    });

    for (const a of actions) {
      const c = evaluate(a, agent.permissions, this.governor);
      this.trace.push(c);
      this.bus.emit(Events.ActionProposed, { id: c.id, agent: c.agent, type: c.type, verdict: c.verdict, reason: c.verdictReason });

      if (c.verdict === 'PROCEED') await this.execute(c);
      else if (c.verdict === 'ASK_HUMAN') {
        this.pendingApprovals.push(c);
        this.bus.emit(Events.ApprovalRequested, { id: c.id, type: c.type, costCents: c.costCents });
      } else this.bus.emit(Events.ActionAborted, { id: c.id, reason: c.verdictReason });
    }
  }

  subTeams = new Map<string, SubTeam>();

  /** One sub-team per chosen niche, each with its own slice of the test budget. */
  spinUpSubTeams(niches: { id: string; name: string }[], totalTestBudgetCents: number): SubTeam[] {
    const each = Math.floor(totalTestBudgetCents / niches.length);
    return niches.map(n => {
      const team: SubTeam = {
        id: `team_${n.id}`, nicheId: n.id, nicheName: n.name, budgetCents: each,
        status: 'testing', agents: ['creative', 'store_build', 'ads', 'support'],
      };
      this.subTeams.set(team.id, team);
      this.governor.setSubTeamBudget(team.id, each);
      this.bus.emit(Events.SubTeamCreated, { ...team });
      return team;
    });
  }

  killSubTeam(id: string, reason: string) {
    const t = this.subTeams.get(id);
    if (!t || t.status === 'killed') return;
    t.status = 'killed';
    this.bus.emit(Events.SubTeamKilled, { id, reason });
  }

  async decide(actionId: string, approved: boolean) {
    const i = this.pendingApprovals.findIndex(a => a.id === actionId);
    if (i < 0) throw new Error(`no pending approval ${actionId}`);
    const [a] = this.pendingApprovals.splice(i, 1);
    this.bus.emit(Events.ApprovalDecided, { id: a.id, approved });
    if (approved) await this.execute(a);
  }

  private async execute(a: ClassifiedAction) {
    const res = this.governor.reserve(a.costCents, a.subTeamId);
    if (res === null) { this.bus.emit(Events.ActionAborted, { id: a.id, reason: 'reservation failed' }); return; }
    try {
      await this.dispatch(a);
      this.governor.commit(a.costCents, a.subTeamId);
      this.bus.emit(Events.ActionExecuted, { id: a.id, type: a.type });
      if (a.costCents) this.bus.emit(Events.LedgerUpdated, this.governor.snapshot());
    } catch (err) {
      this.governor.release(a.costCents);
      this.bus.emit(Events.ActionAborted, { id: a.id, reason: String(err) });
    }
  }

  private async dispatch(a: ClassifiedAction) {
    const p = a.payload as Record<string, any>;
    switch (a.type) {
      case 'ads.launch_campaign': await this.adapters.ads.launchCampaign(p.name, p.dailyBudgetCents); break;
      case 'support.reply': await this.adapters.email.send(p.to, p.subject, p.body); break;
      case 'support.refund': await this.adapters.shopify.refund(p.orderId, a.costCents); break;
      case 'store.create_page': await this.adapters.shopify.createPage(p.title, p.body); break;
      case 'product.create': await this.adapters.shopify.createProduct(p.title, p.priceCents); break;
      default: break; // research / creative actions have no external side effect yet
    }
  }
}
