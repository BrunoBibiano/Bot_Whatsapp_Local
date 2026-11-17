export function estimateSchedule(count, min, max) {
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > 3600) {
    throw new Error('Use intervalos entre 1 e 3.600 segundos, com máximo ≥ mínimo.');
  }
  const pauses = Math.max(0, count - 1);
  return { count, minimumMs: pauses * min * 1000, averageMs: pauses * (min + max) / 2 * 1000, maximumMs: pauses * max * 1000 };
}

export function estimateRemaining(state, now = Date.now()) {
  if (!state.running) return 0;
  const remaining = Math.max(0, state.total - state.processed);
  const averageProcess = state.timingSamples > 0 ? state.processingMs / state.timingSamples : 0;
  const currentElapsed = state.contactStartedAt ? Math.max(0, now - state.contactStartedAt) : 0;
  const processing = Math.max(0, remaining * averageProcess - currentElapsed);
  const waiting = state.nextAt ? Math.max(0, state.nextAt - now) : 0;
  const futurePauses = Math.max(0, remaining - 1);
  return processing + waiting + futurePauses * (state.delayMin + state.delayMax) / 2 * 1000;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  if (ms < 60000) return `${Math.ceil(ms / 1000)}s`;
  const minutes = Math.ceil(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, '0')}min` : `${minutes}min`;
}
