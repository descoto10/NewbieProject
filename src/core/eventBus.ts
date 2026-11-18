// In-memory event log + pub/sub. Later: persisted to the `events` table and pushed to the web app.

import type { AppEvent, EventName } from '../contract/events.ts';

type Listener = (e: AppEvent) => void;

export class EventBus {
  log: AppEvent[] = [];
  private listeners: Listener[] = [];

  emit(name: EventName, payload: Record<string, unknown>) {
    const e: AppEvent = { name, payload, at: new Date().toISOString() };
    this.log.push(e);
    for (const l of this.listeners) l(e);
  }

  subscribe(l: Listener) { this.listeners.push(l); }
}
