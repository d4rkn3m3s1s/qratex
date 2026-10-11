/**
 * Güven Merkezi (/admin/trust) sunucu mantığı.
 *  - Saf: önem sözlüğü, çözüm kodu, kural normalizasyonu, aday üretimi, tekilleştirme, sorgu filtresi.
 *  - Aksiyonlar: vaka çöz/yeniden aç (409), sahtekârlık durumu iyimser kilit, puan geri alma yalnız
 *    lib/economy üzerinden (tek-kez anahtarı), kurallar 409, tarama tekilleştirmesi.
 * Prisma mock'lanır; gerçek DB'ye gidilmez.
 */
jest.mock('@/lib/prisma', () => {
  const p = require('../helpers/prisma-proxy');
  const queryRaw = jest.fn();
  const prisma = new Proxy(p.prisma, {
    get(t: Record<string, unknown>, k: string) {
      return k === '$queryRaw' ? queryRaw : t[k];
    },
  });
  return { ...p, prisma, __queryRaw: queryRaw };
});
jest.mock('@prisma/client', () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
    join: (values: unknown[]) => ({ join: values }),
  },
}));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/scope', () => ({ resolveDealerScope: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn() }));
jest.mock('@/lib/economy', () => ({
  adjustPointsByAdmin: jest.fn(),
  isEconomyError: (e: unknown) => Boolean(e && typeof e === 'object' && (e as { name?: string }).name === 'EconomyError'),
}));
jest.mock('@/lib/points-wallet', () => {
  class InsufficientPointsError extends Error {
    constructor() {
      super('yetersiz');
      this.name = 'InsufficientPointsError';
    }
  }
  return { InsufficientPointsError };
});
jest.mock('@/lib/admin-users/actions.server', () => ({ setSuspension: jest.fn() }));

import { db, resetDb } from '../helpers/prisma-proxy';
import { adjustPointsByAdmin } from '@/lib/economy';
import { InsufficientPointsError } from '@/lib/points-wallet';
import {
  CaseListQuery,
  DEFAULT_TRUST_RULES,
  caseQsFromParams,
  encodeResolution,
  normalizeSeverity,
  parseResolution,
} from '@/lib/admin-trust/contract';
import {
  dedupeCandidates,
  dedupeKeyFor,
  isRoutableIp,
  normalizeRules,
  sharedIpCandidates,
  velocityCandidates,
} from '@/lib/admin-trust/rules';
import {
  buildCaseWhere,
  caseAction,
  exportCasesCsv,
  reverseLedgerEntry,
  runScan,
  subjectAction,
  updateRules,
} from '@/lib/admin-trust/trust.server';

const queryRaw: jest.Mock = require('@/lib/prisma').__queryRaw;
const ctx = { actor: { id: 'admin-1', email: 'a@x.com', role: 'ADMIN', name: 'Ayşe', type: 'user' as const }, request: null };

beforeEach(() => {
  resetDb();
  queryRaw.mockReset();
  (adjustPointsByAdmin as jest.Mock).mockReset();
  db.auditLog.create.mockResolvedValue({});
});

describe('sözlükler', () => {
  it('önem değerleri tek sözlüğe iner (eski küçük harf ve SecurityAlert değerleri dahil)', () => {
    expect(normalizeSeverity('high')).toBe('HIGH');
    expect(normalizeSeverity('ERROR')).toBe('HIGH');
    expect(normalizeSeverity('WARNING')).toBe('MEDIUM');
    expect(normalizeSeverity('CRITICAL')).toBe('CRITICAL');
    expect(normalizeSeverity('INFO')).toBe('LOW');
    expect(normalizeSeverity(null)).toBe('LOW');
  });
  it('çözüm kodu kodlanır ve geri okunur; kodsuz eski metin korunur', () => {
    expect(parseResolution(encodeResolution('false_positive', '  ofis NAT  '))).toEqual({ code: 'false_positive', note: 'ofis NAT' });
    expect(parseResolution('eski serbest metin')).toEqual({ code: null, note: 'eski serbest metin' });
  });
  it('URL → sorgu dizesi varsayılanları yazmaz, sırası sabittir', () => {
    const qs = caseQsFromParams((k) => ({ severity: 'HIGH,CRITICAL', q: 'x@y.com', foo: 'bar' } as Record<string, string>)[k] ?? null);
    expect(qs).toBe('severity=HIGH%2CCRITICAL&q=x%40y.com');
  });
});

describe('kurallar (saf)', () => {
  it('bozuk ayar sunucu varsayılanına düşer; kısmi ayar varsayılanla birleşir', () => {
    expect(normalizeRules(null)).toEqual({ rules: DEFAULT_TRUST_RULES, isDefault: true });
    expect(normalizeRules({ velocity: { points: 'çok' } })).toEqual({ rules: DEFAULT_TRUST_RULES, isDefault: true });
    const r = normalizeRules({ velocity: { points: 900 } });
    expect(r.isDefault).toBe(false);
    expect(r.rules.velocity).toEqual({ ...DEFAULT_TRUST_RULES.velocity, points: 900 });
    expect(r.rules.sharedIp).toEqual(DEFAULT_TRUST_RULES.sharedIp);
  });
  it('puan hızı: eşik altı elenir, 3 katı kritik olur, kapalı kural aday üretmez', () => {
    const rule = { ...DEFAULT_TRUST_RULES.velocity, points: 500 };
    const c = velocityCandidates(
      [
        { userId: 'a', total: 499 },
        { userId: 'b', total: 600 },
        { userId: 'c', total: 1600 },
      ],
      rule,
    );
    expect(c.map((x) => [x.userId, x.severity])).toEqual([
      ['b', 'HIGH'],
      ['c', 'CRITICAL'],
    ]);
    expect(velocityCandidates([{ userId: 'b', total: 9999 }], { ...rule, enabled: false })).toEqual([]);
  });
  it('ortak IP: özel ağ adresleri ve tekrarlı kullanıcılar sayılmaz', () => {
    expect(isRoutableIp('192.168.1.4')).toBe(false);
    expect(isRoutableIp('172.20.0.1')).toBe(false);
    expect(isRoutableIp('::1')).toBe(false);
    expect(isRoutableIp('85.105.1.2')).toBe(true);
    const rule = { ...DEFAULT_TRUST_RULES.sharedIp, accounts: 3 };
    const c = sharedIpCandidates(
      [
        { ip: '10.0.0.1', userIds: ['a', 'b', 'c', 'd'] },
        { ip: '85.105.1.2', userIds: ['a', 'a', 'b'] },
        { ip: '85.105.1.3', userIds: ['a', 'b', 'c'] },
      ],
      rule,
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ ipAddress: '85.105.1.3', userId: null });
  });
  it('tekilleştirme mevcut anahtarları ve aynı tarama içi tekrarı eler', () => {
    const rule = DEFAULT_TRUST_RULES.velocity;
    const c = velocityCandidates(
      [
        { userId: 'a', total: 900 },
        { userId: 'b', total: 900 },
        { userId: 'b', total: 950 },
      ],
      rule,
    );
    const out = dedupeCandidates(c, new Set([dedupeKeyFor('POINTS_VELOCITY', 'a', null)]));
    expect(out.map((x) => x.userId)).toEqual(['b']);
  });
});

describe('vaka sorgusu', () => {
  it('varsayılan açık vakalar; önem filtresi eski küçük harfleri de yakalar', () => {
    const p = CaseListQuery.parse({ severity: 'HIGH,BOGUS', window: '24h' });
    const w = buildCaseWhere(p, Date.parse('2026-10-11T12:00:00Z')) as { AND: Record<string, unknown>[] };
    expect(w.AND).toEqual(
      expect.arrayContaining([
        { isResolved: false },
        { severity: { in: ['HIGH', 'high'] } },
        { createdAt: { gte: new Date('2026-10-10T12:00:00Z') } },
      ]),
    );
  });
});

describe('vaka aksiyonları', () => {
  it('çözülmüş vakayı tekrar çözmek 409 verir ve denetim yazılmaz', async () => {
    db.suspiciousActivity.updateMany.mockResolvedValue({ count: 0 });
    db.suspiciousActivity.findUnique.mockResolvedValue({ id: 'c1' });
    await expect(caseAction(ctx, 'c1', { action: 'resolve', code: 'confirmed', note: 'kanıt yeterli' })).rejects.toMatchObject({ status: 409 });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('olmayan vaka 404', async () => {
    db.suspiciousActivity.updateMany.mockResolvedValue({ count: 0 });
    db.suspiciousActivity.findUnique.mockResolvedValue(null);
    await expect(caseAction(ctx, 'yok', { action: 'reopen', note: 'yeniden bakılacak' })).rejects.toMatchObject({ status: 404 });
  });
  it('çözüm koşullu güncellenir, kod+not yazılır ve denetime düşer', async () => {
    db.suspiciousActivity.updateMany.mockResolvedValue({ count: 1 });
    db.suspiciousActivity.findUnique.mockResolvedValue(null); // ardından detay okuması: 404 beklenir (yalnız yazımı doğruluyoruz)
    await expect(caseAction(ctx, 'c1', { action: 'resolve', code: 'false_positive', note: 'ofis ağı' })).rejects.toMatchObject({ status: 404 });
    const upd = db.suspiciousActivity.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'c1', isResolved: false });
    expect(upd.data).toMatchObject({ isResolved: true, resolvedBy: 'admin-1', resolution: 'false_positive: ofis ağı' });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'TRUST_CASE_RESOLVE', entityId: 'c1', userId: 'admin-1' });
  });
});

describe('özne aksiyonları', () => {
  it('yönetici hesabının durumu değiştirilemez', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', role: 'ADMIN', fraudStatus: 'clean', anonymizedAt: null });
    await expect(subjectAction(ctx, 'u1', { action: 'fraud_status', status: 'flagged', from: 'clean', reason: 'deneme amaçlı' })).rejects.toMatchObject({
      status: 403,
    });
  });
  it('kendi hesabına aksiyon yok', async () => {
    await expect(subjectAction(ctx, 'admin-1', { action: 'suspend', reason: 'kendimi askıya al' })).rejects.toMatchObject({ status: 403 });
  });
  it('durum siz bakarken değiştiyse 409 (iyimser kilit), denetim yok', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', role: 'CUSTOMER', fraudStatus: 'flagged', anonymizedAt: null });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(subjectAction(ctx, 'u1', { action: 'fraud_status', status: 'shadow_ban', from: 'clean', reason: 'puan hızı doğrulandı' })).rejects.toMatchObject({
      status: 409,
    });
    expect(db.user.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'u1', fraudStatus: 'clean' });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('puan geri alma (yalnız lib/economy)', () => {
  it('kazanım satırını negatif yönetici düzeltmesiyle ve tek-kez anahtarıyla geri alır', async () => {
    db.pointsLedger.findUnique
      .mockResolvedValueOnce({ id: 'l1', userId: 'u1', delta: 300, status: 'posted', source: 'game', currency: 'POINTS' })
      .mockResolvedValueOnce(null);
    (adjustPointsByAdmin as jest.Mock).mockResolvedValue({ points: 200, ledgerId: 'l2', duplicate: false });
    const r = await reverseLedgerEntry(ctx, 'l1', { reason: 'oyun hilesi doğrulandı', caseId: 'c1' });
    expect(r).toEqual({ reversed: 300, balance: 200, duplicate: false });
    expect((adjustPointsByAdmin as jest.Mock).mock.calls[0][1]).toMatchObject({
      adminId: 'admin-1',
      userId: 'u1',
      delta: -300,
      idempotencyKey: 'trust-reverse:l1',
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'TRUST_LEDGER_REVERSE', entityId: 'l1' });
  });
  it('bakiyeye yansımamış (void) satır geri alınamaz', async () => {
    db.pointsLedger.findUnique.mockResolvedValueOnce({ id: 'l1', userId: 'u1', delta: 300, status: 'void', source: 'game', currency: 'POINTS' });
    await expect(reverseLedgerEntry(ctx, 'l1', { reason: 'gölge yasak satırı' })).rejects.toMatchObject({ status: 409 });
    expect(adjustPointsByAdmin).not.toHaveBeenCalled();
  });
  it('ikinci geri alma 409', async () => {
    db.pointsLedger.findUnique
      .mockResolvedValueOnce({ id: 'l1', userId: 'u1', delta: 300, status: 'posted', source: 'game', currency: 'POINTS' })
      .mockResolvedValueOnce({ id: 'l2' });
    await expect(reverseLedgerEntry(ctx, 'l1', { reason: 'tekrar deneme' })).rejects.toMatchObject({ status: 409 });
    expect(adjustPointsByAdmin).not.toHaveBeenCalled();
  });
  it('bakiye yetmezse eksiye düşürmez, anlaşılır 409 döner', async () => {
    db.pointsLedger.findUnique
      .mockResolvedValueOnce({ id: 'l1', userId: 'u1', delta: 300, status: 'posted', source: 'game', currency: 'POINTS' })
      .mockResolvedValueOnce(null);
    (adjustPointsByAdmin as jest.Mock).mockRejectedValue(new (InsufficientPointsError as unknown as new () => Error)());
    await expect(reverseLedgerEntry(ctx, 'l1', { reason: 'harcanmış puan' })).rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_POINTS' });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('kalite turu: yarışan ikinci istek tek-kez anahtarına çarparsa 409 ve İKİNCİ denetim satırı yok', async () => {
    db.pointsLedger.findUnique
      .mockResolvedValueOnce({ id: 'l1', userId: 'u1', delta: 300, status: 'posted', source: 'game', currency: 'POINTS' })
      .mockResolvedValueOnce(null);
    (adjustPointsByAdmin as jest.Mock).mockResolvedValue({ points: 200, ledgerId: 'l2', duplicate: true });
    await expect(reverseLedgerEntry(ctx, 'l1', { reason: 'çift tıklama' })).rejects.toMatchObject({ status: 409 });
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
  it('kalite turu: geri alma (reversal) satırı sunucuda da geri alınamaz', async () => {
    db.pointsLedger.findUnique.mockResolvedValueOnce({ id: 'l9', userId: 'u1', delta: 50, status: 'posted', source: 'reversal_refund', currency: 'POINTS' });
    await expect(reverseLedgerEntry(ctx, 'l9', { reason: 'iade satırı' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(adjustPointsByAdmin).not.toHaveBeenCalled();
  });
  it('kalite turu: CSV dışa aktarım (e-posta/IP taşır) denetime yazılır', async () => {
    db.suspiciousActivity.findMany.mockResolvedValueOnce([
      {
        id: 'c1', type: 'VELOCITY', severity: 'HIGH', description: '=cmd', userId: 'u1', ipAddress: '1.2.3.4', metadata: null,
        isResolved: false, resolution: null, resolvedAt: null, createdAt: new Date('2026-10-01T00:00:00Z'),
        user: { id: 'u1', name: 'A', email: 'a@b.c', role: 'CUSTOMER', fraudStatus: 'clean', suspendedAt: null }, dealer: null,
      },
    ]);
    const csv = await exportCasesCsv(ctx, CaseListQuery.parse({}));
    expect(csv).toContain("'=cmd");
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'TRUST_CASES_EXPORT',
      userId: 'admin-1',
      newData: expect.objectContaining({ rows: 1, truncated: false }),
    });
  });
});

describe('kurallar ve tarama', () => {
  it('sürüm uyuşmazsa 409, yazım yok', async () => {
    db.settings.findUnique.mockResolvedValue({ key: 'trust.rules.v1', value: {}, updatedAt: new Date('2026-10-10T10:00:00Z') });
    await expect(updateRules(ctx, { rules: DEFAULT_TRUST_RULES, baseVersion: null, reason: 'eşik düşürüldü' })).rejects.toMatchObject({ status: 409 });
    expect(db.settings.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('tarama yalnız yeni adayları vaka olarak yazar, kullanıcıya dokunmaz, özeti saklar', async () => {
    db.settings.findUnique.mockResolvedValue(null); // varsayılan kurallar
    queryRaw
      .mockResolvedValueOnce([
        { userId: 'u-old', total: 900 },
        { userId: 'u-new', total: 800 },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ip: '85.105.1.3', userIds: ['a', 'b', 'c', 'd'] }]);
    db.suspiciousActivity.findMany.mockResolvedValue([{ type: 'POINTS_VELOCITY', userId: 'u-old', ipAddress: null, isResolved: false, resolvedAt: null }]);
    db.suspiciousActivity.createMany.mockResolvedValue({ count: 2 });
    db.settings.upsert.mockResolvedValue({});

    const s = await runScan(ctx, new Date('2026-10-11T12:00:00Z'));
    expect(s.created).toBe(2);
    expect(s.byRule.velocity).toEqual({ enabled: true, candidates: 2, created: 1 });
    expect(s.byRule.sharedIp.created).toBe(1);
    const rows = db.suspiciousActivity.createMany.mock.calls[0][0].data;
    expect(rows.map((r: { type: string; userId: string | null }) => [r.type, r.userId])).toEqual([
      ['POINTS_VELOCITY', 'u-new'],
      ['SHARED_IP', null],
    ]);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'TRUST_SCAN' });
  });
});
