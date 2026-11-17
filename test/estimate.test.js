import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateSchedule, estimateRemaining, formatDuration } from '../shared/estimate.js';

test('mil contatos têm 999 pausas; zero/um contato não têm pausas', () => {
  assert.deepEqual(estimateSchedule(1000, 5, 10), { count: 1000, minimumMs: 4995000, averageMs: 7492500, maximumMs: 9990000 });
  assert.equal(formatDuration(7492500), '2h 05min');
  assert.equal(estimateSchedule(1, 5, 10).averageMs, 0);
  assert.equal(estimateSchedule(0, 5, 10).averageMs, 0);
  assert.throws(() => estimateSchedule(10, 10, 5));
});
test('tempo restante soma processamento observado e espera atual sem duplicar pausas', () => {
  const state = { running: true, total: 10, processed: 2, timingSamples: 2, processingMs: 4000, delayMin: 5, delayMax: 5, nextAt: 13000 };
  assert.equal(estimateRemaining(state, 10000), 54000); // 8*2s + 7*5s + 3s
  assert.equal(estimateRemaining({ ...state, nextAt: null, contactStartedAt: 9000 }, 10000), 50000);
  assert.equal(estimateRemaining({ ...state, running: false }, 10000), 0);
  assert.equal(estimateRemaining({ ...state, total: 2 }, 14000), 0);
});
