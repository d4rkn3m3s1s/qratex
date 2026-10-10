/**
 * b-asistan ajan döngüsü: araç çağrısı → dayanak kartı → atıflı yanıt → kayıt; hatada kayıt yok;
 * maliyet/limit hataları kodlu olay olarak döner.
 */
const mockTurn = jest.fn();
jest.mock('@/lib/ai-engine', () => ({ streamToolChatTurn: (...a: unknown[]) => mockTurn(...a) }));
jest.mock('@/lib/ai-cost-guard', () => ({
  isAiGuardError: (e: unknown) => !!e && typeof e === 'object' && 'statusCode' in e && 'code' in e,
}));
const mockExec = jest.fn();
jest.mock('@/lib/dealer-assistant/tools', () => {
  const actual = jest.requireActual('@/lib/dealer-assistant/tools');
  return { ...actual, executeTool: (...a: unknown[]) => mockExec(...a) };
});
const mockSave = jest.fn();
jest.mock('@/lib/dealer-assistant/server', () => ({ saveTurn: (...a: unknown[]) => mockSave(...a) }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/dealer-analytics/load', () => ({ loadAnalyticsOverview: jest.fn(), loadActivityHeatmap: jest.fn() }));
jest.mock('@/lib/ai-learning', () => ({ findSimilarFeedback: jest.fn() }));

import { runAssistantTurn } from '@/lib/dealer-assistant/agent';
import type { AssistantStreamEvent } from '@/lib/dealer-assistant/types';

const ok = (content: string, toolCalls: Array<{ id: string; name: string; arguments: string }> = []) => ({
  ok: true,
  content,
  toolCalls,
  modelUsed: 'groq/test',
  finishReason: toolCalls.length ? 'tool_calls' : 'stop',
  inputTokens: 1,
  outputTokens: 1,
});

function run(overrides: Partial<Parameters<typeof runAssistantTurn>[0]> = {}) {
  const events: AssistantStreamEvent[] = [];
  const p = runAssistantTurn({
    dealerId: 'D1',
    locale: 'tr',
    period: 'last30',
    question: 'En çok neden şikâyet ediliyor?',
    conversationId: null,
    history: [],
    regenerate: false,
    emit: (e) => events.push(e),
    ...overrides,
  });
  return p.then(() => events);
}

beforeEach(() => jest.clearAllMocks());

it('araç çağırır, kartı ve kaynakları yayınlar, uydurma atıfı temizleyip kaydeder', async () => {
  mockTurn
    .mockImplementationOnce(async (p: { onDelta: (t: string) => void }) => {
      p.onDelta('taslak');
      return ok('taslak', [{ id: 'c1', name: 'search_feedback', arguments: '{"query":"bekleme"}' }]);
    })
    .mockImplementationOnce(async (p: { onDelta: (t: string) => void; tools?: unknown; skipRateGuard?: boolean }) => {
      expect(p.skipRateGuard).toBe(true);
      p.onDelta('Bekleme şikâyeti öne çıkıyor [K1] [K7].');
      return ok('Bekleme şikâyeti öne çıkıyor [K1] [K7].');
    });
  const source = { ref: 'K1', kind: 'qr', id: 'f1', excerpt: 'Çok bekledik', rating: 2, sentiment: 'negative', createdAt: '2026-10-05T00:00:00Z', href: '/dealer/inbox?id=qr-f1' };
  mockExec.mockResolvedValue({ forModel: { feedback: [] }, fact: { tool: 'search_feedback', period: 'last30' }, sources: [source] });
  mockSave.mockResolvedValue({ id: 'conv1', title: 'En çok neden şikâyet ediliyor?' });

  const events = await run();
  const types = events.map((e) => e.type);
  expect(types).toEqual(['start', 'delta', 'reset', 'tool', 'fact', 'sources', 'delta', 'done']);
  // Kiracı kimliği araca bağlamdan gider (LLM argümanından değil).
  expect(mockExec.mock.calls[0][2].dealerId).toBe('D1');
  const done = events.find((e) => e.type === 'done') as Extract<AssistantStreamEvent, { type: 'done' }>;
  expect(done.message.content).toBe('Bekleme şikâyeti öne çıkıyor [K1] .');
  expect(done.message.sources?.map((s) => s.ref)).toEqual(['K1']);
  expect(done.message.facts).toHaveLength(1);
  expect(mockSave.mock.calls[0][0]).toMatchObject({ dealerId: 'D1', conversationId: null, regenerate: false });
});

it('sağlayıcı hatasında tur KAYDEDİLMEZ, yeniden denenebilir hata döner', async () => {
  mockTurn.mockResolvedValue({ ok: false, reason: 'provider_error' });
  const events = await run();
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'PROVIDER_ERROR', retryable: true });
  expect(mockSave).not.toHaveBeenCalled();
});

it('günlük kota aşımı kodlu olay olarak döner (500 değil)', async () => {
  mockTurn.mockRejectedValue(Object.assign(new Error('limit'), { statusCode: 429, code: 'AI_BUDGET_EXCEEDED' }));
  const events = await run();
  expect(events.at(-1)).toMatchObject({ type: 'error', code: 'AI_BUDGET_EXCEEDED', retryable: false });
  expect(mockSave).not.toHaveBeenCalled();
});

it('kullanıcı durdurursa yarım yanıt "stopped" olarak kaydedilir', async () => {
  mockTurn.mockImplementationOnce(async (p: { onDelta: (t: string) => void }) => {
    p.onDelta('Yarım');
    return { ok: false, reason: 'aborted' };
  });
  mockSave.mockResolvedValue({ id: 'c', title: 't' });
  await run();
  expect(mockSave.mock.calls[0][0].assistant).toMatchObject({ content: 'Yarım', status: 'stopped' });
});

it('son tur araçsız zorlanır (sonsuz araç döngüsü yok)', async () => {
  mockTurn.mockImplementation(async (p: { tools?: unknown }) =>
    p.tools ? ok('', [{ id: 'x', name: 'get_overview', arguments: '{}' }]) : ok('Özet hazır.'),
  );
  mockExec.mockResolvedValue({ forModel: {}, fact: null, sources: [] });
  mockSave.mockResolvedValue({ id: 'c', title: 't' });
  const events = await run();
  expect(mockTurn).toHaveBeenCalledTimes(4);
  expect(mockTurn.mock.calls[3][0].tools).toBeUndefined();
  expect(events.at(-1)?.type).toBe('done');
});

it('araç hatası isteği düşürmez; model "veri okunamadı" bilgisini alır', async () => {
  mockTurn
    .mockResolvedValueOnce(ok('', [{ id: 'c1', name: 'get_topics', arguments: '{}' }]))
    .mockResolvedValueOnce(ok('Konu verisine şu an ulaşılamadı.'));
  mockExec.mockRejectedValue(new Error('db'));
  mockSave.mockResolvedValue({ id: 'c', title: 't' });
  const events = await run();
  const second = mockTurn.mock.calls[1][0].messages.at(-1);
  expect(second.role).toBe('tool');
  expect(second.content).toContain('okunamadı');
  expect(events.at(-1)?.type).toBe('done');
});
