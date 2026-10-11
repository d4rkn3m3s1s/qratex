/**
 * /admin/ai/studio — Prompt ve Model Stüdyosu sözleşmesi ve sunucu çekirdeği. Gerçek DB yok; prisma sahte.
 *
 * Kapsanan bulgular (docs/audit/2026-10-08/admin/admin_ai-learning.md, admin_ai-settings.md, admin_modules_ai-tones.md):
 *  - Not taslağı → yayın → geçmiş (sürümlü, tek açık taslak, yayın öncekini "superseded" yapar).
 *  - Not uzunluğu modele ulaşan tavanla sınırlı (sessiz kesme yok).
 *  - Üslup anahtarı biçimi; yerleşik aileler DB'deki override ile birleşir; yerleşik tarif motorla aynı.
 *  - Model seçimi yalnız etkin sağlayıcının kataloğundan uygulanır.
 *  - Eğitim: veri eşiği (422) ve atomik kilit (409).
 *  - Bayi politikası: yalnız değişen ve tüketilen alanlar; filtreler User tabanlı.
 */
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/redis', () => ({ redisGetJson: async () => null, redisSetJson: async () => undefined }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));

import {
  BUILTIN_TONES,
  MODEL_CATALOG,
  NOTE_LIMITS,
  dealerPolicyPatchSchema,
  diffStats,
  legacyStudioHref,
  lineDiff,
  noteDraftSchema,
  parseStudioTab,
  proposalDecisionSchema,
  toneCreateSchema,
  type NoteVersion,
} from '@/lib/ai-studio/contract';
import { applyDiscard, applyDraft, applyPublish, parseNoteVersions, pruneVersions } from '@/lib/ai-studio/prompts.server';
import { __resetAiModelRoutingCache, getRoutedModel, parseModelRouting, refreshAiModelRouting } from '@/lib/ai-studio/model-routing';
import { mergeTones } from '@/lib/ai-studio/tones.server';
import { isTrainingLockActive, runSystemTraining } from '@/lib/ai-studio/learning.server';
import { dealerWhere, policyChanges, toProfileView } from '@/lib/ai-studio/dealers.server';
import { slotStates } from '@/lib/ai-studio/models.server';
import { auditSummary } from '@/lib/ai-studio/overview.server';
import { buildAutoReplySystemPrompt } from '@/lib/ai-engine';

const actor = { id: 'admin1', name: 'Yönetici', email: 'a@x.com', type: 'user' as const };

function version(over: Partial<NoteVersion>): NoteVersion {
  return {
    id: 'v1',
    key: 'system',
    body: 'Kısa yaz',
    note: 'ilk',
    status: 'draft',
    createdAt: '2026-10-01T10:00:00.000Z',
    createdBy: { id: 'a', name: null, email: null },
    publishedAt: null,
    publishedBy: null,
    basedOn: null,
    ...over,
  };
}

describe('sözleşme', () => {
  it('sekme ve eski rota yönlendirmesi sorgu parametrelerini korur', () => {
    expect(parseStudioTab('bayiler')).toBe('bayiler');
    expect(parseStudioTab('yok')).toBe('promptlar');
    expect(legacyStudioHref('usluplar', { a: '1', tab: 'x', b: ['2', '3'] })).toBe('/admin/ai/studio?a=1&b=2&b=3&tab=usluplar');
  });

  it('not, modele ulaşan tavanı aşarsa reddedilir; boş gövde null olur', () => {
    const base = { key: 'system' as const, note: 'Gerekçe', baseVersion: 'none' };
    expect(noteDraftSchema.safeParse({ ...base, body: 'x'.repeat(NOTE_LIMITS.system + 1) }).success).toBe(false);
    expect(noteDraftSchema.safeParse({ ...base, key: 'chat', body: 'x'.repeat(NOTE_LIMITS.system + 1) }).success).toBe(true);
    const r = noteDraftSchema.parse({ ...base, body: '   ' });
    expect(r.body).toBeNull();
    expect(noteDraftSchema.safeParse({ ...base, body: 'a', note: 'x' }).success).toBe(false);
  });

  it('üslup anahtarı biçimi ve talimat sınırları', () => {
    const ok = { slug: 'sicak-kisa', name: 'Sıcak', systemPrompt: 'Sıcak ve kısa bir dille yanıt ver lütfen.', reason: 'yeni' };
    expect(toneCreateSchema.safeParse(ok).success).toBe(true);
    expect(toneCreateSchema.safeParse({ ...ok, slug: 'Samimi Ton!' }).success).toBe(false);
    expect(toneCreateSchema.safeParse({ ...ok, slug: '-a' }).success).toBe(false);
    expect(toneCreateSchema.safeParse({ ...ok, systemPrompt: 'kısa' }).success).toBe(false);
    expect(toneCreateSchema.safeParse({ ...ok, systemPrompt: 'x'.repeat(601) }).success).toBe(false);
  });

  it('reddetme gerekçe ister, onay istemez', () => {
    expect(proposalDecisionSchema.safeParse({ action: 'reject', proposalId: 'p' }).success).toBe(false);
    expect(proposalDecisionSchema.safeParse({ action: 'reject', proposalId: 'p', reason: 'Kurallar genel' }).success).toBe(true);
    expect(proposalDecisionSchema.safeParse({ action: 'approve', proposalId: 'p' }).success).toBe(true);
  });

  it('bayi politika yaması: boş bağlam null olur, bilinmeyen alan (modül anahtarı) reddedilir', () => {
    expect(dealerPolicyPatchSchema.parse({ customPrompt: '  ', reason: 'abc', baseVersion: 'none' }).customPrompt).toBeNull();
    expect(dealerPolicyPatchSchema.safeParse({ sentimentEnabled: false, reason: 'abc', baseVersion: 'none' }).success).toBe(false);
  });

  it('satır farkı', () => {
    const d = lineDiff('a\nb\nc', 'a\nx\nc');
    expect(d).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
    ]);
    expect(diffStats(lineDiff(null, 'a\nb'))).toEqual({ added: 2, removed: 0 });
    expect(lineDiff('', '')).toEqual([]);
  });
});

describe('not sürümleri', () => {
  it('tek açık taslak: yeni taslak öncekini "discarded" yapar', () => {
    const v = applyDraft([version({ id: 'd1' })], version({ id: 'd2', createdAt: '2026-10-02T00:00:00.000Z' }));
    expect(v.find((x) => x.id === 'd1')?.status).toBe('discarded');
    expect(v.find((x) => x.id === 'd2')?.status).toBe('draft');
  });

  it('yayınla: önceki yayın superseded, taslak olmayan yayınlanamaz', () => {
    const list = [version({ id: 'p1', status: 'published' }), version({ id: 'd1' }), version({ id: 'c1', key: 'chat', status: 'published' })];
    const r = applyPublish(list, 'd1', { id: 'a', name: null, email: null }, '2026-10-03T00:00:00.000Z');
    expect(r.published.status).toBe('published');
    expect(r.versions.find((x) => x.id === 'p1')?.status).toBe('superseded');
    expect(r.versions.find((x) => x.id === 'c1')?.status).toBe('published');
    expect(() => applyPublish(r.versions, 'p1', null, 'x')).toThrow();
    expect(() => applyDiscard(r.versions, 'd1')).toThrow();
  });

  it('budama yayındaki sürümü asla silmez', () => {
    const many = Array.from({ length: 40 }, (_, i) => version({ id: `s${i}`, status: 'superseded', createdAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:${String(i).padStart(2, '0')}.000Z` }));
    const pub = version({ id: 'pub', status: 'published', createdAt: '2020-01-01T00:00:00.000Z' });
    const out = pruneVersions([...many, pub]);
    expect(out.some((x) => x.id === 'pub')).toBe(true);
    expect(out.length).toBe(31);
  });

  it('bozuk depo öğeleri düşer', () => {
    expect(parseNoteVersions({ versions: [{ id: 1 }, version({}), { id: 'x', key: 'other', status: 'draft' }] })).toHaveLength(1);
    expect(parseNoteVersions(null)).toEqual([]);
  });
});

describe('model yönlendirmesi', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    __resetAiModelRoutingCache();
  });

  it('yalnız etkin sağlayıcının kataloğundaki model uygulanır', async () => {
    process.env.GROQ_API_KEY = 'k';
    mockPrisma.settings = { findUnique: jest.fn().mockResolvedValue({ value: { volume: 'openai/gpt-oss-120b', dealerLearning: 'gpt-4o', junk: 1 } }) };
    await refreshAiModelRouting(true);
    expect(getRoutedModel('volume')).toBe('openai/gpt-oss-120b');
    expect(getRoutedModel('dealerLearning')).toBeNull(); // OpenAI modeli, Groq etkin
    expect(getRoutedModel('systemLearning')).toBeNull();
  });

  it('okuma hatası fırlatmaz, seçim yoksa null', async () => {
    mockPrisma.settings = { findUnique: jest.fn().mockRejectedValue(new Error('db')) };
    await expect(refreshAiModelRouting(true)).resolves.toBeUndefined();
    expect(getRoutedModel('volume')).toBeNull();
    expect(parseModelRouting('x')).toEqual({});
  });

  it('slot durumu: geçersiz seçim yok sayılır', () => {
    const s = slotStates({ volume: 'yok-model', systemLearning: MODEL_CATALOG.groq[1].id }, 'groq');
    expect(s[0]).toMatchObject({ slot: 'volume', overrideIgnored: true, source: expect.not.stringMatching('override') });
    expect(s[2]).toMatchObject({ slot: 'systemLearning', effective: MODEL_CATALOG.groq[1].id, source: 'override' });
    expect(slotStates({}, 'none')[0]).toMatchObject({ effective: null, source: 'none' });
  });
});

describe('üsluplar', () => {
  it('yerleşik tarif motorun otomatik yanıt promptuyla aynı', () => {
    for (const b of BUILTIN_TONES) expect(buildAutoReplySystemPrompt(b.slug)).toContain(b.descriptor);
  });

  it('yerleşik + override + özel birleşir; kullanım eklenir', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    const rows = [
      { id: 't1', slug: 'friendly', name: 'Samimi+', systemPrompt: 'Sıcak yaz', isActive: true, updatedAt: now },
      { id: 't2', slug: 'witty', name: 'Esprili Plus', systemPrompt: 'Şakacı', isActive: false, updatedAt: now },
    ];
    const out = mergeTones(rows, new Map([['friendly', { rules: 3, activeRules: 2, dealers: 2 }]]));
    expect(out).toHaveLength(5);
    expect(out.find((t) => t.slug === 'friendly')).toMatchObject({ source: 'override', id: 't1', usage: { rules: 3 } });
    expect(out.find((t) => t.slug === 'formal')).toMatchObject({ source: 'builtin', id: null, isActive: false });
    expect(out.find((t) => t.slug === 'witty')).toMatchObject({ source: 'custom', isActive: false });
  });
});

describe('sistem eğitimi', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'k';
    mockPrisma.auditLog = { create: jest.fn().mockResolvedValue({}) };
  });

  it('kilit 5 dk sonra bayatlar', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');
    expect(isTrainingLockActive('training', new Date(now - 60_000), now)).toBe(true);
    expect(isTrainingLockActive('training', new Date(now - 6 * 60_000), now)).toBe(false);
    expect(isTrainingLockActive('ready', new Date(now), now)).toBe(false);
  });

  it('yetersiz veri → 422, LLM çağrılmaz', async () => {
    mockPrisma.feedback = { count: jest.fn().mockResolvedValue(3) };
    await expect(runSystemTraining(actor)).rejects.toMatchObject({ status: 422 });
  });

  it('başka eğitim sürüyorsa → 409', async () => {
    mockPrisma.feedback = { count: jest.fn().mockResolvedValue(500) };
    mockPrisma.aISystemLearningProfile = {
      findFirst: jest.fn().mockResolvedValue({ id: 'p1', status: 'training', updatedAt: new Date() }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    await expect(runSystemTraining(actor)).rejects.toMatchObject({ status: 409 });
  });
});

describe('bayiler', () => {
  it('filtreler User tabanlı (ayar satırı olmayan bayi de listelenir)', () => {
    expect(dealerWhere({})).toEqual({ role: 'DEALER' });
    expect(dealerWhere({ filter: 'ai_off' }).AND).toEqual([{ aiSettings: { is: { isEnabled: false } } }]);
    expect(dealerWhere({ filter: 'no_profile', q: 'kafe' }).AND).toHaveLength(2);
  });

  it('yalnız değişen alanlar yazılır', () => {
    const before = { isEnabled: true, autoAnalyze: true, customPrompt: null };
    const patch = dealerPolicyPatchSchema.parse({ isEnabled: true, autoAnalyze: false, customPrompt: '', reason: 'abc', baseVersion: 'none' });
    expect(policyChanges(before, patch)).toEqual({ autoAnalyze: false });
  });

  it('profil JSON yapılandırılır, bilinmeyen alan düşer', () => {
    const v = toProfileView({
      version: 2,
      status: 'ready',
      lastTrainedAt: null,
      trainingFeedbackCount: 10,
      correctionsUsed: 1,
      profile: { businessContext: { sector: 'Kafe', keyTerms: ['latte', 3] }, riskSignals: [{ pattern: 'soğuk', action: 'özür' }], learnedThemes: [{ theme: 'servis' }, 'x'] },
    });
    expect(v.businessContext).toEqual({ sector: 'Kafe', keyTerms: ['latte'] });
    expect(v.risks).toEqual([{ pattern: 'soğuk', action: 'özür' }]);
    expect(v.themes).toEqual([{ theme: 'servis', priority: 'medium', note: null }]);
  });
});

describe('denetim özeti', () => {
  it('eylem etiketi + gerekçe', () => {
    expect(auditSummary('AI_TONE_ARCHIVE', { reason: 'Kullanılmıyor' })).toBe('Üslup arşivlendi · “Kullanılmıyor”');
    expect(auditSummary('AI_SYSTEM_LEARNING_TRAIN', { outcome: 'ok' })).toBe('Sistem öğrenmesi çalıştırıldı · öneri üretildi');
  });
});
