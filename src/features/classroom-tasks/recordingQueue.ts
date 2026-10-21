export interface RecordingJob<I, P> {
  id: string;
  label: string;
  intent: I | null;
  request?: P;
  status: 'queued' | 'saving' | 'unknown';
}
interface QueueOptions<I, P, R> {
  read: () => RecordingJob<I, P>[];
  write: (jobs: RecordingJob<I, P>[]) => void;
  prepare: (intent: I, id: string) => Promise<P>;
  execute: (request: P) => Promise<R>;
  query: (id: string) => Promise<R>;
  saved: (result: R, intent: I | null, reconciled: boolean) => void;
  rejected: (error: unknown, label: string, unknown: boolean) => void | Promise<void>;
  definitive: (error: unknown) => boolean;
}

/** One ordered write stream. Persist the exact request before sending it. */
export class RecordingQueue<I, P, R> {
  jobs: RecordingJob<I, P>[];
  private running = false;
  private active = false;
  private listeners = new Set<() => void>();
  constructor(private options: QueueOptions<I, P, R>) {
    // A reload cannot tell whether an in-flight response was lost. Never auto-replay it.
    this.jobs = options.read().map(job => ({ ...job, status: 'unknown' }));
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  start() { this.active = true; void this.drain(); }
  stop() { this.active = false; }
  private commit(jobs: RecordingJob<I, P>[]) {
    this.options.write(jobs);
    this.jobs = jobs;
    this.listeners.forEach(listener => listener());
  }
  enqueue(intent: I, label: string, id: string) {
    this.commit([...this.jobs, { id, intent, label, status: 'queued' }]);
    void this.drain();
  }
  private async drain() {
    if (this.running || !this.active) return;
    this.running = true;
    try {
      while (this.active && this.jobs.length && this.jobs[0].status === 'queued') {
        let job = this.jobs[0];
        let sent = false;
        try {
          this.commit([{ ...job, status: 'saving' }, ...this.jobs.slice(1)]);
          if (!job.request) {
            if (!job.intent) throw new Error('原填写内容未保留，请核对历史后再处理。');
            const request = await this.options.prepare(job.intent, job.id);
            job = { ...job, request };
            this.commit([{ ...job, status: 'saving' }, ...this.jobs.slice(1)]);
          }
          sent = true;
          const result = await this.options.execute(job.request!);
          this.commit(this.jobs.filter(item => item.id !== job.id));
          if (this.active) this.options.saved(result, job.intent, false);
        } catch (error) {
          let unknown = sent && !this.options.definitive(error);
          try {
            this.commit(unknown ? this.jobs.map(item => item.id === job.id ? { ...job, status: 'unknown' } : item) : this.jobs.filter(item => item.id !== job.id));
          } catch {
            // Storage became unavailable after enqueue. Keep the item visible and stop.
            unknown = true;
            this.jobs = this.jobs.map(item => item.id === job.id ? { ...job, status: 'unknown' } : item);
            this.listeners.forEach(listener => listener());
          }
          if (this.active) await this.options.rejected(error, job.label, unknown);
        }
      }
    } finally { this.running = false; }
  }
  async reconcile(id: string) {
    if (this.running) return;
    const job = this.jobs.find(item => item.id === id);
    if (!job) return;
    const result = await this.options.query(id);
    this.commit(this.jobs.filter(item => item.id !== id));
    this.options.saved(result, job.intent, true);
    void this.drain();
  }
  retry(id: string) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || (!job.request && !job.intent)) throw new Error('原填写内容未保留，请先核对历史。');
    this.commit(this.jobs.map(item => item.id === id ? { ...item, status: 'queued' } : item));
    void this.drain();
  }
  cancelQueued(id: string) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || job.status !== 'queued') return false;
    this.commit(this.jobs.filter(item => item.id !== id));
    return true;
  }
  discard(id: string) {
    this.commit(this.jobs.filter(item => item.id !== id));
    void this.drain();
  }
}
