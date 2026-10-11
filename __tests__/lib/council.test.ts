/**
 * /admin/agent-council — Ajan Konseyi sunucu çekirdeği (lib/council).
 *
 * Korunan senaryolar (raporlar admin_agent-council + history + agents):
 *  - B1: oturum kalıcı; adım sunucuda belirlenir; tur hep-ya-hiç kaydedilir.
 *  - B2: LLM yanıt vermezse ŞABLON YOK → açık hata, hiçbir mesaj yazılmaz, lastError görünür.
 *  - B4: kazanan regex'le değil sentez JSON'undan; geçersiz JSON reddedilir.
 *  - B5: adım kilidi (eşzamanlı çift adım 409); sonlandırılan oturuma sonuç yazılmaz.
 *  - B3: yayın tek-kez (oturum, bayi, aksiyon); bayiye soru/persona/uydurma etki gitmez; denetim.
 *  - Ajanlar B1-B3: ayar zod'dan geçer, eski sürümle kayıt 409, bozuk kayıt varsayılana düşer.
 */
const mockNotify = jest.fn();
jest.mock('@/lib/notify-prefs-server', () => ({ notifyRespectingPrefs: (...a: unknown[]) => mockNotify(...a) }));
const mockConfigured = jest.fn(() => true);
jest.mock('@/lib/ai-engine', () => ({
  isAIConfigured: () => mockConfigured(),
  getAIProviderStatus: () => ({ configured: true, provider: 'groq', model: 'test-model' }),
  runChatCompletion: jest.fn(),
}));

type Fn = jest.Mock;
const db = {
  agentRun: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn(), count: jest.fn() },
  agentMessage: { createMany: jest.fn() },
  agentDecision: { create: jest.fn() },
  actionItem: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  user: { findFirst: jest.fn(), findMany: jest.fn() },
  settings: { findUnique: jest.fn(), upsert: jest.fn() },
  auditLog: { create: jest.fn(), findMany: jest.fn() },
  feedback: { count: jest.fn(), aggregate: jest.fn() },
  suspiciousActivity: { count: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: db, isPrismaConnectivityError: () => false }));

import { ApiError } from '@/lib/http/define-route';
import { DEFAULT_COUNCIL_CONFIG, parseSynthesis, unknownMetricRefs, plannedCalls, sessionToMarkdown, councilConfigSchema } from '@/lib/council/contract';
import { readConfigValue, updateCouncilConfig } from '@/lib/council/config.server';
import { publishActions, readContext, stepSession, actionItemText, sessionAction } from '@/lib/council/sessions.server';
import { transcriptText, type Completion } from '@/lib/council/engine.server';
import { dataPackPrompt } from '@/lib/council/context.server';

const ACTOR = { id: 'admin-1', type: 'user' as const, email: 'a@x.com', role: 'ADMIN', name: 'Admin' };
const T0 = new Date('2026-10-01T10:00:00.000Z');
const NOW = new Date('2026-10-11T10:00:00.000Z');

function resetAll(o: Record<string, unknown>) {
  for (const v of Object.values(o)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as Fn).mockReset();
    else if (v && typeof v === 'object') resetAll(v as Record<string, unknown>);
  }
}

const ctx = (over: Record<string, unknown> = {}) => ({
  v: 2,
  scope: { kind: 'platform' },
  config: { rounds: 1, specialists: ['Harper', 'Lucas'], includeData: false, guidance: '' },
  dataPack: null,
  lastError: null,
  stepLockUntil: null,
  published: [],
  ...over,
});

const runRow = (over: Record<string, unknown> = {}) => ({
  id: 'run1',
  goal: 'Negatif oranı nasıl düşürürüz?',
  status: 'running',
  context: ctx(),
  winnerAgent: null,
  confidence: null,
  finalDecision: null,
  createdAt: T0,
  updatedAt: T0,
  createdById: 'admin-1',
  messages: [],
  decisions: [],
  ...over,
});

const okCompletion: Completion = async (p) => ({ content: `yanıt: ${p.system.slice(0, 20)}`, modelUsed: 'groq/test' });

beforeEach(() => {
  resetAll(db as unknown as Record<string, unknown>);
  mockNotify.mockReset();
  mockConfigured.mockReturnValue(true);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.auditLog.create.mockResolvedValue({});
  db.user.findMany.mockResolvedValue([{ id: 'admin-1', name: 'Admin', email: 'a@x.com' }]);
  db.actionItem.findMany.mockResolvedValue([]);
  db.agentRun.updateMany.mockResolvedValue({ count: 1 });
});

describe('sözleşme', () => {
  it('sentez: geçerli JSON → karar; güven 0-100 ölçeğinden 0-1 ye iner', () => {
    const d = parseSynthesis(
      'öncesi {"answer":"Önce ölçümü kur, sonra bayilerle görüş.","winner":"Harper","winnerRationale":"Veri net.","confidence":72,"dissent":["Örneklem küçük"],"actions":[{"title":"Ölçüm planı","detail":"KPI","priority":"high"}]} sonrası',
      ['Harper', 'Lucas', 'Grok']
    );
    expect(d).not.toBeNull();
    expect(d!.winner).toBe('Harper');
    expect(d!.confidence).toBe(0.72);
    expect(d!.actions[0]).toEqual({ key: 'a0', title: 'Ölçüm planı', detail: 'KPI', priority: 'high' });
  });

  it('sentez: kapalı uzman kazanan seçilemez, bozuk JSON null', () => {
    const raw = '{"answer":"Yeterince uzun bir cevap metni.","winner":"Benjamin","winnerRationale":"Mantık","confidence":50,"actions":[{"title":"Bir iş","priority":"low"}]}';
    expect(parseSynthesis(raw, ['Harper', 'Grok'])).toBeNull();
    expect(parseSynthesis('{bozuk', ['Harper'])).toBeNull();
  });

  it('halüsinasyon bekçisi: veri paketinde olmayan metrik anahtarı yakalanır', () => {
    const raw = '{"answer":"negatif_oran_30g yüksek; davranis_degisiklik_30g izlenmeli.","winner":"Harper","winnerRationale":"Veri net.","confidence":60,"actions":[{"title":"Takip","detail":"acik_aksiyon azalt","priority":"high"}]}';
    const d = parseSynthesis(raw, ['Harper'])!;
    const pack = { scopeLabel: 'P', windowDays: 30, generatedAt: '', metrics: [
      { key: 'negatif_oran_30g', label: 'N', value: 10, unit: '%' as const },
      { key: 'acik_aksiyon', label: 'A', value: 2, unit: 'adet' as const },
    ] };
    expect(unknownMetricRefs(d, pack)).toEqual(['davranis_degisiklik_30g']);
    expect(unknownMetricRefs(d, null)).toEqual(['negatif_oran_30g', 'davranis_degisiklik_30g', 'acik_aksiyon']);
  });

  it('ayar şeması: en az bir uzman, tur 1-3; çağrı tahmini', () => {
    expect(councilConfigSchema.safeParse({ ...DEFAULT_COUNCIL_CONFIG, specialists: [] }).success).toBe(false);
    expect(councilConfigSchema.safeParse({ ...DEFAULT_COUNCIL_CONFIG, rounds: 4 }).success).toBe(false);
    expect(plannedCalls({ rounds: 2, specialists: ['Harper', 'Benjamin', 'Lucas'] })).toBe(9);
    expect(readConfigValue({ weights: [{ name: 'Harper', weight: 3 }] })).toEqual({ config: DEFAULT_COUNCIL_CONFIG, recovered: true });
  });

  it('veri paketi yokken istem sayı vermeyi yasaklar; eski biçim context okunmaz', () => {
    expect(dataPackPrompt(null)).toMatch(/Sayı verme/);
    expect(readContext({ goal: 'eski' })).toBeNull();
    expect(readContext(ctx())?.config.rounds).toBe(1);
  });

  it('transkript bütçesi en yenileri korur', () => {
    const prior = Array.from({ length: 60 }, (_, i) => ({ round: 1, agent: 'Harper', kind: 'turn', content: `mesaj-${i} ${'x'.repeat(200)}` }));
    const t = transcriptText(prior);
    expect(t).toContain('mesaj-59');
    expect(t).not.toContain('mesaj-0 ');
    expect(t).toContain('kısaltıldı');
  });
});

describe('adım', () => {
  it('tur: uzmanlar + Kaptan moderasyonu tek seferde kaydedilir', async () => {
    db.agentRun.findUnique.mockResolvedValueOnce(runRow()).mockResolvedValueOnce({ ...runRow(), messages: [], decisions: [] });
    await stepSession('run1', ACTOR, okCompletion, NOW);
    const created = db.agentMessage.createMany.mock.calls[0][0].data;
    expect(created.map((m: { agentName: string; role: string; round: number }) => [m.agentName, m.role, m.round])).toEqual([
      ['Harper', 'turn', 1],
      ['Lucas', 'turn', 1],
      ['Grok', 'moderation', 1],
    ]);
    expect(created[0].metadata).toEqual(expect.objectContaining({ model: 'groq/test' }));
    // Kilit: iyimser updatedAt ile alındı.
    expect(db.agentRun.updateMany.mock.calls[0][0].where).toEqual({ id: 'run1', status: 'running', updatedAt: T0 });
  });

  it('LLM null dönerse şablon YOK: hata, mesaj yazılmaz, lastError kaydedilir', async () => {
    db.agentRun.findUnique.mockResolvedValueOnce(runRow());
    const failing: Completion = async (p) => (p.system.includes('Lucas') ? null : { content: 'ok', modelUsed: 'm' });
    await expect(stepSession('run1', ACTOR, failing, NOW)).rejects.toMatchObject({ code: 'AI_FAILED', status: 502 });
    expect(db.agentMessage.createMany).not.toHaveBeenCalled();
    const last = db.agentRun.updateMany.mock.calls.at(-1)![0].data.context;
    expect(last.lastError.message).toMatch(/Lucas yanıt üretemedi/);
    expect(last.stepLockUntil).toBeNull();
  });

  it('kilit sürerken ikinci adım 409', async () => {
    db.agentRun.findUnique.mockResolvedValueOnce(runRow({ context: ctx({ stepLockUntil: new Date(NOW.getTime() + 30_000).toISOString() }) }));
    await expect(stepSession('run1', ACTOR, okCompletion, NOW)).rejects.toMatchObject({ code: 'STEP_IN_PROGRESS', status: 409 });
  });

  it('sentez: karar + oturum tamamlandı; sonlandırılmışsa kaydedilmez', async () => {
    const msgs = [
      { id: 'm1', round: 1, agentName: 'Harper', role: 'turn', content: 'a', metadata: null, createdAt: T0 },
      { id: 'm2', round: 1, agentName: 'Grok', role: 'moderation', content: 'b', metadata: null, createdAt: T0 },
    ];
    const synth: Completion = async () => ({
      content: JSON.stringify({ answer: 'Ölçümü kur ve iki hafta izle.', winner: 'Lucas', winnerRationale: 'Riskleri gördü.', confidence: 0.6, dissent: [], actions: [{ title: 'Takip et', detail: '', priority: 'medium' }] }),
      modelUsed: 'groq/test',
    });
    db.agentRun.findUnique.mockResolvedValueOnce(runRow({ messages: msgs })).mockResolvedValueOnce({ ...runRow({ status: 'completed' }), messages: msgs, decisions: [] });
    await stepSession('run1', ACTOR, synth, NOW);
    const done = db.agentRun.updateMany.mock.calls[1][0].data;
    expect(done).toEqual(expect.objectContaining({ status: 'completed', winnerAgent: 'Lucas', confidence: 0.6 }));
    expect(db.agentDecision.create).toHaveBeenCalled();

    // Sonlandırılmış: persist tx 0 satır → CONFLICT, mesaj yazılmaz.
    db.agentMessage.createMany.mockReset();
    db.agentRun.findUnique.mockResolvedValueOnce(runRow({ messages: msgs }));
    db.agentRun.updateMany.mockReset().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(stepSession('run1', ACTOR, synth, NOW)).rejects.toBeInstanceOf(ApiError);
    expect(db.agentMessage.createMany).not.toHaveBeenCalled();
  });

  it('AI yapılandırılmamışsa 503', async () => {
    mockConfigured.mockReturnValue(false);
    await expect(stepSession('run1', ACTOR, okCompletion, NOW)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
  });
});

describe('durum ve yayın', () => {
  it('süren oturum arşivlenemez; arşivden çıkınca önceki durum geri gelir', async () => {
    db.agentRun.findUnique.mockResolvedValueOnce(runRow());
    await expect(sessionAction('run1', 'archive', ACTOR)).rejects.toMatchObject({ status: 409 });

    db.agentRun.findUnique
      .mockResolvedValueOnce(runRow({ status: 'archived', context: ctx({ statusBeforeArchive: 'failed' }) }))
      .mockResolvedValueOnce(runRow({ status: 'failed' }));
    await sessionAction('run1', 'unarchive', ACTOR);
    expect(db.agentRun.updateMany.mock.calls.at(-1)![0].data.status).toBe('failed');
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it('yayın: tek-kez; bayiye soru/persona gitmez; impactScore yok; denetim + bildirim', async () => {
    const decided = runRow({
      status: 'completed',
      context: ctx({ published: [{ actionKey: 'a0', actionItemId: 'old', dealerId: 'd1', dealerName: 'Kafe', title: 'Eski', at: T0.toISOString(), byName: null }] }),
      decisions: [{ winnerAgent: 'Harper', rationale: 'r', consensusScore: 0.5, suggestedActions: { actions: [{ key: 'a0', title: 'X', detail: '', priority: 'high' }, { key: 'a1', title: 'Y', detail: 'Z', priority: 'low' }], dissent: [] } }],
    });
    db.user.findFirst.mockResolvedValue({ id: 'd1', name: 'Ali', businessName: 'Kafe', email: null });
    db.agentRun.findUnique.mockResolvedValueOnce(decided).mockResolvedValueOnce({ ...decided, messages: [] });
    db.actionItem.create.mockResolvedValue({ id: 'new1' });

    const r = await publishActions(
      'run1',
      { dealerId: 'd1', dueInDays: 7, actions: [{ key: 'a0', title: 'X', detail: '', priority: 'high' }, { key: 'a1', title: 'Y', detail: 'Z', priority: 'low' }] },
      ACTOR,
      null,
      NOW
    );
    expect(r.created).toBe(1);
    expect(r.skipped).toEqual(['X']);
    const data = db.actionItem.create.mock.calls[0][0].data;
    expect(data.suggestionText).toBe(actionItemText({ title: 'Y', detail: 'Z' }));
    expect(data.suggestionText).not.toMatch(/Negatif oranı|Harper|Agent Council/);
    expect(data.impactScore).toBeNull();
    expect(data.dueAt).toEqual(new Date(NOW.getTime() + 7 * 86400000));
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('agent_council.actions.publish');
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'd1' }));
  });

  it('yayın: tamamlanmamış oturum 409; bilinmeyen aksiyon anahtarı 400', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'd1', name: 'Ali', businessName: null, email: null });
    db.agentRun.findUnique.mockResolvedValueOnce(runRow());
    await expect(
      publishActions('run1', { dealerId: 'd1', dueInDays: 3, actions: [{ key: 'a0', title: 'XYZ', detail: '', priority: 'high' }] }, ACTOR)
    ).rejects.toMatchObject({ status: 409 });

    db.agentRun.findUnique.mockResolvedValueOnce(
      runRow({ status: 'completed', decisions: [{ winnerAgent: 'Harper', rationale: 'r', consensusScore: null, suggestedActions: { actions: [], dissent: [] } }] })
    );
    await expect(
      publishActions('run1', { dealerId: 'd1', dueInDays: 3, actions: [{ key: 'a9', title: 'XYZ', detail: '', priority: 'high' }] }, ACTOR)
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('ayarlar', () => {
  it('eski sürümle kayıt 409; doğru sürümle upsert + denetim', async () => {
    db.settings.findUnique.mockResolvedValue({ value: DEFAULT_COUNCIL_CONFIG, updatedAt: T0 });
    await expect(updateCouncilConfig({ config: DEFAULT_COUNCIL_CONFIG, expectedUpdatedAt: null }, ACTOR)).rejects.toMatchObject({ status: 409 });

    db.settings.upsert.mockResolvedValue({ updatedAt: NOW });
    const next = { ...DEFAULT_COUNCIL_CONFIG, rounds: 3 };
    const r = await updateCouncilConfig({ config: next, expectedUpdatedAt: T0.toISOString() }, ACTOR);
    expect(r.updatedAt).toBe(NOW.toISOString());
    expect(db.auditLog.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ action: 'agent_council.config.update', entityId: 'agent_council_config' }));
  });
});

describe('dışa aktarım', () => {
  it('Markdown yalnız kayıtlı veriden üretilir', () => {
    const md = sessionToMarkdown({
      id: 'r',
      topic: 'Soru',
      status: 'completed',
      statusBeforeArchive: null,
      scope: { kind: 'platform' },
      winner: 'Harper',
      confidence: 0.5,
      createdAt: T0.toISOString(),
      createdByName: 'Admin',
      legacy: false,
      publishedCount: 0,
      updatedAt: T0.toISOString(),
      config: DEFAULT_COUNCIL_CONFIG,
      dataPack: null,
      messages: [{ id: 'm', round: 1, agent: 'Harper', kind: 'turn', content: 'Merhaba', model: 'm', latencyMs: 10, createdAt: T0.toISOString() }],
      decision: { answer: 'Karar', winner: 'Harper', winnerRationale: 'Çünkü', confidence: 0.5, dissent: [], actions: [{ key: 'a0', title: 'İş', detail: '', priority: 'high' }] },
      completedRounds: 1,
      plannedRounds: 1,
      nextStep: null,
      lastError: null,
      stepInFlight: false,
      published: [],
      models: ['m'],
      callCount: 1,
    });
    expect(md).toContain('# Ajan Konseyi: Soru');
    expect(md).toContain('güven %50');
    expect(md).toContain('[Yüksek] İş');
    expect(md).toContain('**Harper · Veri:** Merhaba');
  });
});
