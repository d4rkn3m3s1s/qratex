/**
 * P0-39: "Yeni Görev → Oluştur" her seferinde 500 dönüyordu.
 *  - Form tür değeri `DAILY/WEEKLY/MONTHLY/SPECIAL`, şema `z.enum(['daily','weekly','special'])`.
 *  - `<input type="date">` metin gönderiyor, şema `z.date()` (JSON'da Date yok).
 *  - Route `createQuestSchema.parse` → ZodError → catch → 500.
 * Bu testler formun ürettiği gövdenin sunucu şemasından geçtiğini ve POST'un
 * geçersiz gövdede 500 değil 400 döndüğünü doğrular.
 */
import { NextRequest } from 'next/server';
import { createQuestSchema, updateQuestSchema } from '@/lib/validations';
import {
  initialQuestForm,
  normalizeQuestType,
  questToFormValues,
  toDateInputValue,
  toQuestPayload,
  validateQuestPayload,
  dateInputToIso,
} from '@/app/admin/quests/quest-form-model';

const mockGetServerSession = jest.fn();
jest.mock('next-auth', () => ({
  __esModule: true,
  getServerSession: (...a: unknown[]) => mockGetServerSession(...a),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
// P0-01: görev oluşturma yönetici ucu `requireAuth(['ADMIN'])` (gizli kapı + DB rolü) kullanır.
const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/request-metadata', () => ({ getAuditRequestMeta: () => ({}) }));
jest.mock('@/lib/points-rules', () => ({ getPointsMatrix: jest.fn(), getQuestReward: jest.fn() }));
jest.mock('@/lib/quests/reward', () => ({ isAutoRewardQuest: () => false }));
jest.mock('@/lib/auth/subject-user', () => ({ resolveSubjectUserId: jest.fn() }));
jest.mock('@/lib/api-http', () => ({
  PRIVATE_NO_STORE_HEADERS: {},
  responseIfDatabaseUnavailable: () => null,
}));

const mockQuestCreate = jest.fn();
const mockAuditCreate = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    quest: { create: (...a: unknown[]) => mockQuestCreate(...a) },
    auditLog: { create: (...a: unknown[]) => mockAuditCreate(...a) },
  },
}));

/** JSON üzerinden gidiş-dönüş: istemcinin gerçekten gönderdiği şekil. */
function overTheWire<T>(v: T): unknown {
  return JSON.parse(JSON.stringify(v));
}

describe('createQuestSchema ↔ admin görev formu uyumu', () => {
  it('formun varsayılan gövdesi şemadan geçer', () => {
    const payload = toQuestPayload({ ...initialQuestForm, name: 'Günlük Geri Bildirim', description: 'Bugün 1 yorum bırak' });
    expect(validateQuestPayload(payload)).toBeNull();
    expect(createQuestSchema.safeParse(overTheWire(payload)).success).toBe(true);
  });

  it('eski formun gönderdiği BÜYÜK harfli tür ve metin tarih artık 500 değil, geçerli', () => {
    const legacyBody = {
      name: 'Haftalık Ziyaret',
      description: '3 farklı işletmeyi ziyaret et',
      icon: '🎯',
      type: 'WEEKLY',
      requirement: { type: 'visit_category', count: 3 },
      reward: { points: 100, xp: 50 },
      expiresAt: '2026-10-20',
    };
    const parsed = createQuestSchema.safeParse(legacyBody);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.type).toBe('weekly');
    expect(parsed.data.expiresAt).toBeInstanceOf(Date);
    // Yalnız tarih → o günün sonu, Türkiye saati (UTC+3) → 20:59:59.999Z
    expect((parsed.data.expiresAt as Date).toISOString()).toBe('2026-10-20T20:59:59.999Z');
  });

  it('aylık tür kabul edilir (form sunuyor, müşteri ekranı destekliyor)', () => {
    expect(createQuestSchema.safeParse({ ...baseBody(), type: 'MONTHLY' }).success).toBe(true);
  });

  it('boş/null tarih → null (süresiz görev)', () => {
    for (const expiresAt of ['', '   ', null]) {
      const r = createQuestSchema.safeParse({ ...baseBody(), expiresAt });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.expiresAt).toBeNull();
    }
    const missing = createQuestSchema.safeParse(baseBody());
    expect(missing.success).toBe(true);
  });

  it('geçersiz değerler Türkçe mesajla reddedilir', () => {
    const badType = createQuestSchema.safeParse({ ...baseBody(), type: 'yearly' });
    expect(badType.success).toBe(false);
    if (!badType.success) expect(badType.error.issues[0].message).toMatch(/görev türü/i);

    const badDate = createQuestSchema.safeParse({ ...baseBody(), expiresAt: 'yarın' });
    expect(badDate.success).toBe(false);
    if (!badDate.success) expect(badDate.error.issues[0].message).toMatch(/bitiş tarihi/i);

    const zeroTarget = createQuestSchema.safeParse({ ...baseBody(), requirement: { type: 'custom', count: 0 } });
    expect(zeroTarget.success).toBe(false);

    const negativeReward = createQuestSchema.safeParse({ ...baseBody(), reward: { points: -5, xp: 0 } });
    expect(negativeReward.success).toBe(false);

    const hugeReward = createQuestSchema.safeParse({ ...baseBody(), reward: { points: 10_000_000, xp: 0 } });
    expect(hugeReward.success).toBe(false);
  });

  it('istemci doğrulaması boş açıklamayı yakalar (sunucuya gitmeden)', () => {
    const p = toQuestPayload({ ...initialQuestForm, name: 'Ad', description: '   ' });
    expect(validateQuestPayload(p)).toBe('Açıklama gerekli');
  });

  it('updateQuestSchema kısmi gövdeyi kabul eder', () => {
    expect(updateQuestSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateQuestSchema.safeParse({ type: 'SPECIAL' }).success).toBe(true);
  });
});

describe('görev formu modeli', () => {
  it('eski BÜYÜK harfli kayıtlar düzenleme formunda doğru türle açılır', () => {
    expect(normalizeQuestType('SPECIAL')).toBe('special');
    expect(normalizeQuestType('mystery')).toBeNull();
    const values = questToFormValues({
      name: 'Başarım',
      description: 'x',
      icon: '🏆',
      type: 'SPECIAL',
      requirement: { count: 3 },
      reward: { points: 75 },
      isActive: true,
      expiresAt: '2026-10-20T20:59:59.999Z',
    });
    expect(values.type).toBe('special');
    expect(values.target).toBe('3');
    expect(values.reward).toBe('75');
    expect(values.expiresAt).toBe('2026-10-20');
  });

  it('bilinmeyen mekanik düzenlemede KORUNUR (sessizce custom yapılmaz)', () => {
    const v = questToFormValues({
      name: 'Geri bildirim',
      description: 'x',
      type: 'weekly',
      requirement: { type: 'give_feedback', count: 2 },
      reward: { points: 10 },
      isActive: true,
    });
    expect(v.requirementType).toBe('give_feedback');
    expect(toQuestPayload(v).requirement.type).toBe('give_feedback');
  });

  it('tarih dönüşümü gidiş-dönüş tutarlı', () => {
    const iso = dateInputToIso('2026-12-31');
    expect(iso).toBe('2026-12-31T20:59:59.999Z');
    expect(toDateInputValue(iso)).toBe('2026-12-31');
    expect(dateInputToIso('')).toBeNull();
    expect(toDateInputValue('bozuk')).toBe('');
  });
});

describe('POST /api/gamification/quests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: 'admin1', role: 'ADMIN' } });
    mockRequireAuth.mockResolvedValue({ session: { user: { id: 'admin1', role: 'ADMIN' } } });
    mockQuestCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'q1', ...data }));
    mockAuditCreate.mockResolvedValue({});
  });

  async function post(body: unknown) {
    const { POST } = await import('@/app/api/gamification/quests/route');
    const req = new NextRequest('http://localhost/api/gamification/quests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('admin formunun gönderdiği gövde ile görev oluşturulur (eskiden 500)', async () => {
    const payload = toQuestPayload({
      ...initialQuestForm,
      name: 'Aylık Sadakat',
      description: 'Ay içinde 5 ziyaret',
      type: 'monthly',
      target: '5',
      reward: '200',
      expiresAt: '2026-11-30',
      requirementType: 'visit_category',
      category: 'cafe',
    });
    const res = await post(payload);
    expect(res.status).toBe(200);
    expect(mockQuestCreate).toHaveBeenCalledTimes(1);
    const data = mockQuestCreate.mock.calls[0][0].data;
    expect(data.type).toBe('monthly');
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.requirement).toEqual({ type: 'visit_category', count: 5, category: 'cafe' });
  });

  it('geçersiz gövde 400 + Türkçe mesaj döner, DB’ye yazılmaz', async () => {
    const res = await post({ ...baseBody(), type: 'yearly' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.error).toMatch(/görev türü/i);
    expect(mockQuestCreate).not.toHaveBeenCalled();
  });
});

function baseBody() {
  return {
    name: 'Görev',
    description: 'Açıklama',
    icon: '🎯',
    type: 'daily',
    requirement: { type: 'custom', count: 1 },
    reward: { points: 50, xp: 25 },
  };
}
