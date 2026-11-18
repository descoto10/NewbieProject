// Event-sourced task log. Append-only; every state change is an event,
// so any run can be replayed to rebuild state after a crash.
// Writes JSON Lines to a file when given a path, otherwise keeps events in memory.
// Owner: Person 1

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { AppEvent } from '../contract/events.ts';

export class EventLog {
  private path: string | null;
  private memory: AppEvent[] = [];

  constructor(path: string | null = null) {
    this.path = path;
  }

  append(e: AppEvent) {
    this.memory.push(e);
    if (this.path) appendFileSync(this.path, JSON.stringify(e) + '\n');
  }

  /** All events, read back from disk when persisted (proves durability). */
  readAll(): AppEvent[] {
    if (!this.path) return [...this.memory];
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as AppEvent);
  }

  /** Rebuild any state by folding events through a reducer. */
  replay<S>(reducer: (state: S, e: AppEvent) => S, initial: S): S {
    return this.readAll().reduce(reducer, initial);
  }
}
