// Spend governor: the hard loss-cap invariant, enforced outside any LLM.
// Owner: Person 2
//
// Invariant: (money spent) - (order profit) <= loss cap, at every moment.
//
// Order profit can be taken back by refunds, so the governor only lets agents
// re-spend profit it is SURE of:
//   - settled orders (past the refund window) count at their real value
//   - pending orders count at their worst case: refunded, so we eat the POD cost
// Money is RESERVED before an action runs, then COMMITTED or RELEASED.

export interface GovernorOptions {
  settleDays?: number;              // refund window, default 7
  unsafeReinvestPending?: boolean;  // naive mode for tests: trusts unsettled profit
}

interface OrderRecord {
  id: string;
  priceCents: number;
  podCents: number;
  day: number;
  refunded: boolean;
}

export class SpendGovernor {
  readonly lossCapCents: number;
  private subTeamBudgets: Map<string, number>;
  private settleDays: number;
  private unsafe: boolean;
  private spentCents = 0;
  private reservedCents = 0;
  private subTeamSpent = new Map<string, number>();
  private orders = new Map<string, OrderRecord>();
  private today = 0;

  constructor(lossCapCents: number, subTeamBudgets = new Map<string, number>(), opts: GovernorOptions = {}) {
    this.lossCapCents = lossCapCents;
    this.subTeamBudgets = subTeamBudgets;
    this.settleDays = opts.settleDays ?? 7;
    this.unsafe = opts.unsafeReinvestPending ?? false;
  }

  setDay(day: number) { this.today = day; }
  setSubTeamBudget(subTeamId: string, cents: number) { this.subTeamBudgets.set(subTeamId, cents); }

  recordOrder(id: string, priceCents: number, podCents: number) {
    this.orders.set(id, { id, priceCents, podCents, day: this.today, refunded: false });
  }

  recordRefund(id: string) {
    const o = this.orders.get(id);
    if (o) o.refunded = true;
  }

  /** Order profit the governor is allowed to count on. */
  get trustedOrderNetCents(): number {
    let total = 0;
    for (const o of this.orders.values()) {
      const settled = this.today - o.day >= this.settleDays;
      if (o.refunded) total -= o.podCents;
      else if (settled || this.unsafe) total += o.priceCents - o.podCents;
      else total -= o.podCents; // worst case: it gets refunded
    }
    return total;
  }

  /** Real net profit right now (revenue - POD - refunds - spend). */
  get actualNetCents(): number {
    let orderNet = 0;
    for (const o of this.orders.values()) orderNet += o.refunded ? -o.podCents : o.priceCents - o.podCents;
    return orderNet - this.spentCents;
  }

  get availableCents(): number {
    return Math.max(0, this.lossCapCents + this.trustedOrderNetCents - this.spentCents - this.reservedCents);
  }

  subTeamRemaining(subTeamId: string): number {
    if (!this.subTeamBudgets.has(subTeamId)) return Infinity;
    return this.subTeamBudgets.get(subTeamId)! - (this.subTeamSpent.get(subTeamId) ?? 0);
  }

  /**
   * Returns a reservation id, or null if this spend could break a cap.
   * exposureCents: extra worst-case cost the spend can trigger later. For ads, that is the
   * POD cost of orders the ad creates that then get refunded. It is held back and released
   * when it turns out not to be needed. Without it, the fuzz test finds breaches.
   */
  reserve(amountCents: number, subTeamId: string | null, exposureCents = 0): string | null {
    const total = amountCents + exposureCents;
    if (total > this.availableCents) return null;
    if (subTeamId && amountCents > this.subTeamRemaining(subTeamId)) return null;
    this.reservedCents += total;
    return `res_${total}_${subTeamId ?? 'store'}`;
  }

  commit(amountCents: number, subTeamId: string | null) {
    this.reservedCents -= amountCents;
    this.spentCents += amountCents;
    if (subTeamId) this.subTeamSpent.set(subTeamId, (this.subTeamSpent.get(subTeamId) ?? 0) + amountCents);
  }

  release(amountCents: number) { this.reservedCents -= amountCents; }

  snapshot() {
    return {
      lossCapCents: this.lossCapCents, spentCents: this.spentCents, reservedCents: this.reservedCents,
      availableCents: this.availableCents, actualNetCents: this.actualNetCents,
    };
  }
}
