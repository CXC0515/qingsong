import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingQueue, type RecordingJob } from './recordingQueue';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = () => { let resolve!: (value: number) => void; let reject!: (error: unknown) => void; const promise = new Promise<number>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
type Request = { id: string; value: number; version: number };
function fixture(initial: RecordingJob<number, Request>[] = []) {
  let stored = structuredClone(initial), version = 0;
  const calls: Request[] = [], replies: ReturnType<typeof deferred>[] = [], errors: boolean[] = [];
  const queue = new RecordingQueue<number, Request, number>({
    read: () => stored, write: next => { stored = structuredClone(next); },
    prepare: async (value, id) => ({ id, value, version }),
    execute: async request => { calls.push(request); const reply = deferred(); replies.push(reply); return reply.promise; },
    query: async () => 7,
    saved: value => { version = value; },
    rejected: (_error, _label, unknown) => { errors.push(unknown); },
    definitive: error => error === 'conflict',
  });
  queue.start();
  return { queue, calls, replies, errors, stored: () => stored };
}
test('immediate feedback accepts another student, sends serially and prepares against confirmed state', async () => {
  const f = fixture(); f.queue.enqueue(1, 'one', 'id1'); f.queue.enqueue(2, 'two', 'id2');
  assert.equal(f.queue.jobs.length, 2); assert.equal(f.queue.jobs[0].status, 'saving');
  await tick(); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].version, 0);
  f.replies[0].resolve(4); await tick(); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].version, 4);
  f.replies[1].resolve(5); await tick(); assert.deepEqual(f.stored(), []); assert.deepEqual(f.errors, []);
});
test('lost response pauses later students; retry preserves operation ID and exact request', async () => {
  const f = fixture(); f.queue.enqueue(1, 'one', 'id1'); f.queue.enqueue(2, 'two', 'id2'); await tick();
  f.replies[0].reject('network'); await tick(); assert.equal(f.calls.length, 1); assert.equal(f.queue.jobs[0].status, 'unknown');
  f.queue.enqueue(3, 'three', 'id3');
  assert.equal(f.queue.jobs.length,3);
  f.queue.retry('id1'); await tick(); assert.deepEqual(f.calls[1], f.calls[0]);
  f.replies[1].resolve(4); await tick(); assert.equal(f.calls[2].id, 'id2');
  f.replies[2].resolve(5); await tick();
  assert.equal(f.calls[3].id,'id3'); f.replies[3].resolve(6); await tick(); assert.equal(f.queue.jobs.length, 0);
});
test('operation lookup resolves a lost response without resending it, then drains the remaining queue', async () => {
  const f = fixture(); f.queue.enqueue(1, 'one', 'id1'); f.queue.enqueue(2, 'two', 'id2'); await tick();
  f.replies[0].reject('network'); await tick(); await f.queue.reconcile('id1'); await tick();
  assert.equal(f.calls.length, 2); assert.equal(f.calls[1].id, 'id2'); assert.equal(f.calls[1].version, 7);
  f.replies[1].resolve(8); await tick(); assert.equal(f.queue.jobs.length, 0);
});
test('reload preserves the request and requires confirmation before replay', async () => {
  const f = fixture(); f.queue.enqueue(1, 'one', 'id1'); await tick();
  const recovered = fixture(f.stored()); await tick(); assert.equal(recovered.calls.length, 0);
  assert.equal(recovered.queue.jobs[0].status, 'unknown'); recovered.queue.retry('id1'); await tick();
  assert.deepEqual(recovered.calls[0], f.calls[0]); recovered.replies[0].resolve(1); await tick();
  f.queue.stop(); f.replies[0].resolve(1); await tick();
});
test('definitive conflict rolls back that intent and does not silently lose later students', async () => {
  const f = fixture(); f.queue.enqueue(1, 'one', 'id1'); f.queue.enqueue(2, 'two', 'id2'); await tick();
  f.replies[0].reject('conflict'); await tick(); assert.deepEqual(f.errors, [false]); assert.equal(f.calls[1].id, 'id2');
  f.replies[1].resolve(1); await tick(); assert.equal(f.queue.jobs.length, 0);
});
test('unmount finishes the in-flight request but retains unsent students for recovery', async () => {
  const f = fixture(); f.queue.enqueue(1, 'one', 'id1'); f.queue.enqueue(2, 'two', 'id2'); await tick();
  f.queue.stop(); f.replies[0].resolve(1); await tick(); assert.equal(f.calls.length, 1); assert.equal(f.stored()[0].id, 'id2');
});
test('unavailable storage never sends an untracked write', async () => {
  let writes = 0;
  const queue = new RecordingQueue<number, number, number>({ read: () => [], write: () => { throw new Error('storage'); }, prepare: async v => v, execute: async v => { writes++; return v; }, query: async () => 0, saved: () => {}, rejected: () => {}, definitive: () => false });
  queue.start(); assert.throws(() => queue.enqueue(1, 'one', 'id1')); await tick(); assert.equal(writes, 0);
});

test('cancel only an unsent intent; an in-flight write must use a compensating event', async () => {
  const f=fixture(); f.queue.enqueue(1,'one','id1'); f.queue.enqueue(2,'two','id2'); await tick();
  assert.equal(f.queue.cancelQueued('id1'),false);
  assert.equal(f.queue.cancelQueued('id2'),true);
  f.replies[0].resolve(1); await tick(); assert.equal(f.calls.length,1); assert.equal(f.queue.jobs.length,0);
});
test('ten repeated taps stay distinct and an inverse waits for its original acknowledgement', async () => {
  const f=fixture(); for(let i=0;i<10;i++)f.queue.enqueue(1,'same student','tap'+i);
  f.queue.enqueue(-1,'undo','undo');
  assert.equal(f.queue.jobs.length,11);
  for(let i=0;i<11;i++){await tick();assert.equal(f.calls[i].id,i===10?'undo':'tap'+i);f.replies[i].resolve(i+1);}
  await tick(); assert.equal(f.queue.jobs.length,0);
});
