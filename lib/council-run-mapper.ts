import { AGENT_PERSONAS } from '@/lib/agent-personas';

/** Tur bazlı UI mesajı */
export interface CouncilUiMessage {
  id: string;
  agentName: string;
  stance: string;
  content: string;
  round: number;
}

export interface CouncilUiState {
  topic: string;
  round: number;
  messages: CouncilUiMessage[];
  decision?: {
    winner: string;
    summary: string;
    actions: Array<{ title: string; owner: string; priority: string }>;
  };
}

function roleToStance(role: string, agentName: string): string {
  if (role === 'consensus') return 'consensus';
  if (role === 'critique') return 'captain';
  if (role === 'proposal') {
    if (agentName === 'Harper') return 'research';
    if (agentName === 'Benjamin') return 'logic';
    if (agentName === 'Lucas') return 'creative';
    if (agentName === 'Grok') return 'captain';
    if (/risk/i.test(agentName)) return 'research';
    if (/growth/i.test(agentName)) return 'creative';
    if (/cx/i.test(agentName)) return 'logic';
    if (/compliance/i.test(agentName)) return 'captain';
    return 'research';
  }
  return 'research';
}

function parseActions(raw: unknown): Array<{ title: string; owner: string; priority: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((a: Record<string, unknown>) => ({
    title: String(a.title ?? ''),
    owner: String(a.owner ?? ''),
    priority: ['high', 'medium', 'low'].includes(String(a.priority)) ? String(a.priority) : 'medium',
  }));
}

/**
 * GET /api/admin/agents/run/[id] veya memory run gövdesini konsey UI şekline çevirir.
 */
export function mapAgentApiRunToCouncilUi(run: Record<string, unknown>): CouncilUiState {
  const goal = typeof run.goal === 'string' ? run.goal : '';
  const rawMsgs = Array.isArray(run.messages) ? run.messages : [];
  const messages: CouncilUiMessage[] = rawMsgs.map((m: Record<string, unknown>, i: number) => {
    let agentName = String(m.agentName ?? 'Grok');
    if (agentName === 'Orchestrator Agent') agentName = 'Grok';
    const role = String(m.role ?? 'proposal');
    const stance =
      typeof m.stance === 'string' && m.stance.length > 0 ? String(m.stance) : roleToStance(role, agentName);
    return {
      id: typeof m.id === 'string' ? m.id : `m-${i}-${Date.now()}`,
      agentName,
      stance,
      content: String(m.content ?? ''),
      round: typeof m.round === 'number' ? m.round : 1,
    };
  });

  let decision: CouncilUiState['decision'];
  const decisions = run.decisions;
  if (Array.isArray(decisions) && decisions.length > 0) {
    const d = decisions[0] as Record<string, unknown>;
    decision = {
      winner: String(d.winnerAgent ?? 'Harper'),
      summary: String(d.rationale ?? ''),
      actions: parseActions(d.suggestedActions),
    };
  }

  const maxRoundFromMessages = messages.length ? Math.max(...messages.map((x) => x.round)) : 0;
  const round =
    typeof run.round === 'number' && run.round > 0 ? run.round : maxRoundFromMessages;

  return {
    topic: goal,
    round,
    messages,
    decision,
  };
}

export function councilPersonasForUi() {
  return AGENT_PERSONAS as unknown as Record<
    string,
    {
      codename: string;
      soulFile: string;
      thinkingStyle: string;
      grokRole?: string;
      sprite: { body: string; accent: string; speedMs: number };
    }
  >;
}
