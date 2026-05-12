type AnyRun = Record<string, unknown>;

const globalForAgentRuns = globalThis as unknown as {
  agentRunsMemory: AnyRun[] | undefined;
};

function getStore() {
  if (!globalForAgentRuns.agentRunsMemory) {
    globalForAgentRuns.agentRunsMemory = [];
  }
  return globalForAgentRuns.agentRunsMemory;
}

export function memoryAddRun(run: AnyRun) {
  const store = getStore();
  store.unshift(run);
  if (store.length > 200) store.pop();
}

export function memoryGetRuns(take: number) {
  return getStore().slice(0, take);
}

export function memoryGetRunById(id: string) {
  return getStore().find((r) => r.id === id) ?? null;
}

export function memoryAttachOutcome(runId: string, outcome: Record<string, unknown>) {
  const run = memoryGetRunById(runId) as any;
  if (!run) return null;
  const decision = run.decisions?.[0];
  if (!decision) return null;
  if (!Array.isArray(decision.outcomes)) decision.outcomes = [];
  decision.outcomes.push(outcome);
  return outcome;
}
