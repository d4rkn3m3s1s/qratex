/**
 * Komuta Merkezi (lib/admin-command) — denetim bulgularının regresyonları:
 *  - admin B3 / platform-pulse B3: kart toplamı = nabız kovalarının toplamı; İstanbul kovaları;
 *    önceki pencere aynı geçen süre; önceki 0 iken sahte "+%100" yok.
 *  - admin B2: en iyi bayiler SQL sırasıyla döner (istemcide yeniden sıralanmaz).
 *  - admin B5/B6: sağlık okunamazsa "bilinmiyor"; kaçırılmış cron kırmızı.
 *  - platform-pulse B2/B9: entity büyük/küçük harf birleşir, eylem insan dilinde.
 *  - Bölüm hatası yalnız o bölümü düşürür.
 */
import {
  actionVerb,
  actorKindOf,
  aiHealth,
  cronHealth,
  dbStatus,
  entityLabel,
  fillSeries,
  istanbulKey,
  normalizeEntity,
  outboxHealth,
  overallHealth,
  pctChange,
  ratioPct,
  resolveWindow,
} from '@/lib/admin-command/core';

// jest `@prisma/client`'ı node_modules taslağına çözer; `Prisma.sql/raw` üretilmiş istemcide.
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));

const queryRaw = jest.fn();
const mockPrisma = {
  $queryRaw: queryRaw,
  dataSubjectRequest: { count: jest.fn() },
  suspiciousActivity: { count: jest.fn() },
  incident: { count: jest.fn() },
  securityAlert: { count: jest.fn() },
  aIQualitySample: { count: jest.fn() },
  user: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
  segmentCampaignProposal: { count: jest.fn() },
  pointsLedger: { count: jest.fn() },
  auditLog: { findMany: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => null), redisSetJson: jest.fn(async () => undefined), isRedisConfigured: () => false }));
jest.mock('@/lib/mail-sender', () => ({ getMailDeliverySummary: () => ({ configured: true, smtp: true, resend: false }) }));
jest.mock('@/lib/cron-state', () => ({ loadCronState: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const server = require('@/lib/admin-command/server') as typeof import('@/lib/admin-command/server');

beforeEach(() => jest.clearAllMocks());

describe('pencere (İstanbul)', () => {
  it('7 gün: bugün dahil 7 İstanbul günü; UTC 21:30 ertesi gündür', () => {
    const now = new Date('2026-10-09T21:30:00Z'); // İstanbul 10 Ekim 00:30
    const w = resolveWindow('7d', now);
    expect(w.unit).toBe('day');
    expect(w.keys).toEqual(['2026-10-04T00', '2026-10-05T00', '2026-10-06T00', '2026-10-07T00', '2026-10-08T00', '2026-10-09T00', '2026-10-10T00']);
    expect(w.start).toBe('2026-10-03T21:00:00.000Z');
    // Önceki pencere aynı geçen süre (6 gün 30 dk) → kısmi bugün tam günle kıyaslanmaz.
    expect(new Date(w.start).getTime() - new Date(w.prevStart).getTime()).toBe(now.getTime() - new Date(w.start).getTime());
  });

  it('24 saat: 24 saatlik kova, son kova şimdiki saat', () => {
    const now = new Date('2026-10-10T08:15:00Z'); // İstanbul 11:15
    const w = resolveWindow('24h', now);
    expect(w.keys).toHaveLength(24);
    expect(w.keys[23]).toBe('2026-10-10T11');
    expect(w.keys[0]).toBe('2026-10-09T12');
    expect(istanbulKey(new Date('2026-10-10T08:59:59Z'), 'hour')).toBe('2026-10-10T11');
  });

  it('fillSeries eksik kovayı 0 yapar, sırayı korur', () => {
    expect(fillSeries(['a', 'b', 'c'], [{ key: 'c', n: 2 }, { key: 'a', n: 1 }, { key: 'x', n: 9 }])).toEqual([1, 0, 2]);
  });

  it('değişim: önceki 0 iken null (sahte +%100 yok); oran payda 0 iken null', () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(80, 100)).toBe(-20);
    expect(ratioPct(3, 0)).toBeNull();
    expect(ratioPct(62, 100)).toBe(62);
  });
});

describe('sağlık sınıflandırması', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('DB gecikmesi eşikleri ve ulaşılamaz', () => {
    expect(dbStatus(null)).toBe('error');
    expect(dbStatus(120)).toBe('ok');
    expect(dbStatus(450)).toBe('warn');
    expect(dbStatus(1500)).toBe('error');
  });
  it('cron: okunamazsa bilinmiyor, 26 sa+ kırmızı, kısmi sarı', () => {
    expect(cronHealth(null, now).status).toBe('unknown');
    expect(cronHealth({ lastRun: null, running: null }, now).status).toBe('warn');
    expect(cronHealth({ lastRun: { startedAt: '2026-10-09T05:00:00Z', finishedAt: null, overall: 'ok', failed: [] }, running: null }, now).status).toBe('error');
    expect(cronHealth({ lastRun: { startedAt: '2026-10-10T03:00:00Z', finishedAt: null, overall: 'partial', failed: ['a'] }, running: null }, now).status).toBe('warn');
    expect(cronHealth({ lastRun: { startedAt: '2026-10-10T03:00:00Z', finishedAt: null, overall: 'ok', failed: [] }, running: null }, now).status).toBe('ok');
  });
  it('AI: çağrı yoksa bilinmiyor (yeşil değil); yüksek hata kırmızı', () => {
    expect(aiHealth(0, 0).status).toBe('unknown');
    expect(aiHealth(100, 30).status).toBe('error');
    expect(aiHealth(100, 8).status).toBe('warn');
    expect(aiHealth(100, 1).status).toBe('ok');
  });
  it('outbox ve genel durum en kötüyü alır', () => {
    expect(outboxHealth(0, 0).status).toBe('ok');
    expect(outboxHealth(3, 0).status).toBe('warn');
    expect(overallHealth(['ok', 'unknown', 'warn'])).toBe('warn');
    expect(overallHealth(['ok', 'error', 'warn'])).toBe('error');
  });
});

describe('denetim olayını insan diline çevirme', () => {
  it('settings/Settings ve company_task/CompanyTask birleşir', () => {
    expect(normalizeEntity('Settings')).toBe(normalizeEntity('settings'));
    expect(normalizeEntity('company_task')).toBe(normalizeEntity('CompanyTask'));
    expect(entityLabel('Settings')).toBe('Ayarlar');
    expect(entityLabel('user_automation_rule')).toBe('User automation rule');
  });
  it('eylem fiilleri', () => {
    expect(actionVerb('UPDATE_SETTINGS')).toBe('güncelledi');
    expect(actionVerb('updateSettings')).toBe('güncelledi');
    expect(actionVerb('create_quest')).toBe('oluşturdu');
    expect(actionVerb('DELETE')).toBe('sildi');
    expect(actionVerb('quest_claim')).toBe('talep etti');
    expect(actionVerb('weird')).toBe('işlem yaptı');
  });
  it('aktör türü: sistem/cron, STAFF bayi tarafında', () => {
    expect(actorKindOf('cron', 'ADMIN')).toBe('system');
    expect(actorKindOf('user', 'STAFF')).toBe('dealer');
    expect(actorKindOf('user', 'ADMIN')).toBe('admin');
    expect(actorKindOf('user', null)).toBe('system');
  });
});

describe('sunucu yükleyicileri', () => {
  it('KPI: kart toplamı = nabız kovaları toplamı; CSAT birleşik; önceki dönem kıyası', async () => {
    const now = new Date('2026-10-10T08:15:00Z');
    const w = resolveWindow('7d', now);
    queryRaw
      .mockResolvedValueOnce([
        { src: 'feedback', key: w.keys[5], n: 4n, pos: 3n, rated: 4n },
        { src: 'feedback', key: w.keys[6], n: 6n, pos: 6n, rated: 6n },
        { src: 'feedback', key: 'prev', n: 5n, pos: 2n, rated: 5n },
        { src: 'consumption', key: w.keys[6], n: 9n, pos: 0n, rated: 0n },
        { src: 'user', key: 'prev', n: 2n, pos: 0n, rated: 0n },
      ])
      .mockResolvedValueOnce([
        { key: w.keys[6], minted: 120n, spent: 40n },
        { key: 'prev', minted: 100n, spent: 0n },
      ])
      .mockResolvedValueOnce([
        { key: w.keys[6], n: 2n },
        { key: 'cur_total', n: 3n },
        { key: 'prev_total', n: 0n },
      ]);
    const k = await server.computeKpis(w);
    const by = Object.fromEntries(k.kpis.map((e) => [e.key, e]));
    expect(by.feedback!.metric.value).toBe(10);
    expect(k.pulse.feedback.reduce((a, b) => a + b, 0)).toBe(10);
    expect(by.feedback!.metric.delta?.value).toBe(100);
    expect(by.csat!.metric.value).toBe(90); // 9/10
    expect(by.csat!.metric.delta).toMatchObject({ kind: 'points', value: 50 }); // 90 − 40
    expect(by.newUsers!.metric.value).toBe(0);
    expect(by.newUsers!.metric.delta?.value).toBe(-100);
    expect(by.pointsMinted!.metric.value).toBe(120);
    expect(by.pointsMinted!.metric.delta?.goodDirection).toBe('neutral');
    expect(by.pointsMinted!.footnote).toContain('40');
    expect(by.activeDealers!.metric.value).toBe(3);
    expect(by.activeDealers!.metric.delta).toBeNull(); // önceki 0
  });

  it('en iyi bayiler SQL sırasını korur; ad yoksa "İsimsiz işletme"', async () => {
    queryRaw.mockResolvedValueOnce([
      { d: 'b', n: 9n, avg: 4.44 },
      { d: 'a', n: 3n, avg: null },
    ]);
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'a', businessName: 'Kahve A', name: null }]);
    const t = await server.computeTopDealers(resolveWindow('30d'));
    expect(t.dealers.map((d) => d.dealerId)).toEqual(['b', 'a']);
    expect(t.dealers[0]).toMatchObject({ name: 'İsimsiz işletme', volume: 9, avgRating: 4.4 });
    expect(t.dealers[1]).toMatchObject({ name: 'Kahve A', avgRating: null });
  });

  it('kuyruklar: süresi geçen DSR ve yüksek vaka dikkat sayısına girer', async () => {
    mockPrisma.dataSubjectRequest.count.mockResolvedValueOnce(4).mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockPrisma.suspiciousActivity.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    mockPrisma.incident.count.mockResolvedValueOnce(1);
    mockPrisma.securityAlert.count.mockResolvedValueOnce(0);
    mockPrisma.aIQualitySample.count.mockResolvedValueOnce(7);
    mockPrisma.user.count.mockResolvedValueOnce(1);
    mockPrisma.segmentCampaignProposal.count.mockResolvedValueOnce(0);
    mockPrisma.pointsLedger.count.mockResolvedValueOnce(3);
    const q = await server.computeQueues(new Date('2026-10-10T12:00:00Z'));
    expect(q.attention).toBe(3);
    const dsr = q.groups.find((g) => g.id === 'dsr')!;
    expect(dsr.tone).toBe('danger');
    expect(dsr.total).toBe(4);
    expect(q.groups.find((g) => g.id === 'review')!.total).toBe(11);
  });

  it('genel bakış: bir bölüm düşerse yalnız o bölüm hata taşır', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    queryRaw.mockRejectedValue(new Error('db down'));
    mockPrisma.dataSubjectRequest.count.mockResolvedValue(0);
    mockPrisma.suspiciousActivity.count.mockResolvedValue(0);
    mockPrisma.incident.count.mockResolvedValue(0);
    mockPrisma.securityAlert.count.mockResolvedValue(0);
    mockPrisma.aIQualitySample.count.mockResolvedValue(0);
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.segmentCampaignProposal.count.mockResolvedValue(0);
    mockPrisma.pointsLedger.count.mockResolvedValue(0);
    mockPrisma.user.groupBy.mockResolvedValue([{ role: 'CUSTOMER', _count: { _all: 5 } }]);
    const o = await server.loadCommandOverview('7d');
    expect(o.kpis.ok).toBe(false);
    expect(o.topDealers.ok).toBe(false);
    expect(o.queues.ok).toBe(true);
    expect(o.ecosystem).toMatchObject({ ok: true, data: { total: 5 } });
    queryRaw.mockReset();
  });

  it('son olaylar: insan diline çevrilir, imleç yalnız devamı varsa döner', async () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({
      id: `id${i}`,
      action: 'UPDATE_SETTINGS',
      entity: 'settings',
      entityId: null,
      createdAt: new Date(Date.UTC(2026, 9, 10, 12, 0, 60 - i)),
      actorType: 'user',
      actorSnapshot: null,
      user: { name: 'Ayşe', email: 'a@x.com', role: 'ADMIN' },
    }));
    mockPrisma.auditLog.findMany.mockResolvedValueOnce(rows);
    const p = await server.loadCommandEvents('admin', null);
    expect(p.events).toHaveLength(15);
    expect(p.events[0]).toMatchObject({ actorName: 'Ayşe', verb: 'güncelledi', entityLabel: 'Ayarlar', actorKind: 'admin' });
    const c = server.decodeCursor(p.nextCursor);
    expect(c?.id).toBe('id14');
    expect(server.decodeCursor('bozuk!!')).toBeNull();
  });
});
