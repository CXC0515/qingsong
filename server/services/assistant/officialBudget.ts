/** One active generation and three waiting turns across official instances. */
export class OfficialBudget {
  private active?: string;
  private waiting: Array<{id: string; resolve: () => void; reject: (error: Error) => void; signal: AbortSignal; abort: () => void}> = [];
  async acquire(id: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.active === id || this.waiting.some(item => item.id === id)) throw Error('DUPLICATE_TURN');
    if (!this.active) { this.active = id; return; }
    if (this.waiting.length >= 3) throw Error('QUEUE_FULL');
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.waiting = this.waiting.filter(item => item !== entry);
        reject(Error('TURN_CANCELLED'));
      };
      const entry = {id, resolve, reject, signal, abort};
      this.waiting.push(entry);
      signal.addEventListener('abort', abort, {once: true});
      if (signal.aborted) abort();
    });
  }
  release(id: string) {
    if (this.active !== id) return;
    this.active = undefined;
    while (this.waiting.length) {
      const next = this.waiting.shift()!;
      next.signal.removeEventListener('abort', next.abort);
      if (next.signal.aborted) { next.reject(Error('TURN_CANCELLED')); continue; }
      this.active = next.id;
      next.resolve();
      break;
    }
  }
  get size() { return {active: this.active ? 1 : 0, waiting: this.waiting.length}; }
}
export const officialBudget = new OfficialBudget();
