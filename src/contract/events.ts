// Event names the frontend subscribes to. Add new ones here first.

export const Events = {
  ActionProposed: 'action.proposed',
  ActionExecuted: 'action.executed',
  ActionAborted: 'action.aborted',
  ApprovalRequested: 'approval.requested',
  ApprovalDecided: 'approval.decided',
  SubTeamCreated: 'subteam.created',
  SubTeamKilled: 'subteam.killed',
  LedgerUpdated: 'ledger.updated',
  OrderReceived: 'order.received',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

export interface AppEvent {
  name: EventName;
  payload: Record<string, unknown>;
  at: string; // ISO timestamp
}
