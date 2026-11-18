// Pub/sub on top of the event log. The web app subscribes to these events.

import type { AppEvent, EventName } from '../contract/events.ts';
import { EventLog } from './eventLog.ts';

type Listener = (e: AppEvent) => void;

export class EventBus {
  readonly store: EventLog;
  private listeners: Listener[] = [];

  constructor(store: EventLog = new EventLog()) {
    this.store = store;
  }

  get log(): AppEvent[] { return this.store.readAll(); }

  emit(name: EventName, payload: Record<string, unknown>) {
    const e: AppEvent = { name, payload, at: new Date().toISOString() };
    this.store.append(e);
    for (const l of this.listeners) l(e);
  }

  subscribe(l: Listener) { this.listeners.push(l); }
}
