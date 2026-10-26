import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OfficialBudget} from './officialBudget';
test('one active, three waiting, cancellation and FIFO', async () => {
  const budget = new OfficialBudget();
  const controllers = Array.from({length: 5}, () => new AbortController());
  await budget.acquire('a', controllers[0].signal);
  const b = budget.acquire('b', controllers[1].signal);
  const c = budget.acquire('c', controllers[2].signal);
  const d = budget.acquire('d', controllers[3].signal);
  await assert.rejects(budget.acquire('e', controllers[4].signal), /QUEUE_FULL/);
  controllers[2].abort(); await assert.rejects(c, /TURN_CANCELLED/);
  budget.release('a'); await b;
  assert.deepEqual(budget.size, {active: 1, waiting: 1});
  budget.release('a'); assert.equal(budget.size.waiting, 1);
  budget.release('b'); await d; budget.release('d');
  assert.deepEqual(budget.size, {active: 0, waiting: 0});
});
