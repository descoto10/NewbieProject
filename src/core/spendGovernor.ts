// Spend governor with a reservation ledger.
// Money is RESERVED before an action runs and COMMITTED or RELEASED after,
// so concurrent agents can never collectively overshoot the user's loss cap.
// Owner: Person 2

export class SpendGovernor {
  private spentCents = 0;
  private reservedCents = 0;
  private subTeamSpent = new Map<string, number>();

  readonly lossCapCents: number;
  private subTeamBudgets: Map<string, number>;

  constructor(lossCapCents: number, subTeamBudgets: Map<string, number>) {
    this.lossCapCents = lossCapCents;
    this.subTeamBudgets = subTeamBudgets;
  }

  get availableCents() { return this.lossCapCents - this.spentCents - this.reservedCents; }

  subTeamRemaining(subTeamId: string) {
    return (this.subTeamBudgets.get(subTeamId) ?? 0) - (this.subTeamSpent.get(subTeamId) ?? 0);
  }

  /** Returns a reservation id, or null if this spend would break a cap. */
  reserve(amountCents: number, subTeamId: string | null): string | null {
    if (amountCents > this.availableCents) return null;
    if (subTeamId && amountCents > this.subTeamRemaining(subTeamId)) return null;
    this.reservedCents += amountCents;
    return `res_${amountCents}_${subTeamId ?? 'store'}_${Date.now()}`;
  }

  commit(amountCents: number, subTeamId: string | null) {
    this.reservedCents -= amountCents;
    this.spentCents += amountCents;
    if (subTeamId) this.subTeamSpent.set(subTeamId, (this.subTeamSpent.get(subTeamId) ?? 0) + amountCents);
  }

  release(amountCents: number) { this.reservedCents -= amountCents; }

  snapshot() {
    return { lossCapCents: this.lossCapCents, spentCents: this.spentCents,
             reservedCents: this.reservedCents, availableCents: this.availableCents };
  }
}
