import { EventEmitter } from 'node:events';
import type { ConsoleEntry } from '../src/types/index.js';

export class DashboardEvents extends EventEmitter {
  emitConsole(serverId: string, entry: ConsoleEntry): void {
    this.emit(`console:${serverId}`, entry);
  }

  onConsole(serverId: string, listener: (entry: ConsoleEntry) => void): () => void {
    const event = `console:${serverId}`;
    this.on(event, listener);
    return () => this.off(event, listener);
  }
}
