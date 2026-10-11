/**
 * /admin/privacy sunucu mantığı: ölçülen uyum kontrolleri, rıza istatistikleri, kaynaklar arası
 * cursor sayfalama (maskeli IP), CSV formül kaçışı ve saklama görünümü. Sahte db; gerçek DB yok.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  decodeLogCursor,
  encodeLogCursor,
  evaluateChecks,
  getConsentStats,
  getRetentionView,
  listUnifiedLogs,
  logsToCsv,
  percent,
  type CheckInputs,
} from '@/lib/admin-privacy/server';
import { isReceiptNotice, missingEvidence } from '@/lib/dsr-workflow';
import { retentionEntries } from '@/lib/pii-registry';
import type { UnifiedLogRow } from '@/lib/admin-privacy/contract';

const NOW = new Date('2026-10-11T09:00:00Z');

function inputs(over: Partial<CheckInputs> = {}): CheckInputs {
  return {
    now: NOW,
    dsr: { open: 2, overdue: 0, dueSoon: 0, completed30: 1, nearestDueDays: 20 },
    coverage: { windowDays: 7, total: 100, withIpPercent: 99, withUaPercent: 99, missingIpTop: [] },
    jobs: [
      {
        name: 'db-cleanup',
        label: '',
        lastRunAt: '2026-10-11T03:00:00Z',
        lastOkAt: '2026-10-11T03:00:00Z',
        lastStatus: 'ok',
        lastError: null,
        consecutiveFailures: 0,
      },
    ],
    consentLast30: 12,
    suspiciousHigh: 0,
    ...over,
  };
}

const byId = (checks: ReturnType<typeof evaluateChecks>, id: string) => checks.find((c) => c.id === id)!;

describe('evaluateChecks', () => {
  it('her şey ölçülüp uygunsa hepsi ok', () => {
    expect(evaluateChecks(inputs()).every((c) => c.status === 'ok')).toBe(true);
  });

  it('geciken talep → fail ve geciken filtresine bağlanır', () => {
    const c = byId(evaluateChecks(inputs({ dsr: { open: 3, overdue: 1, dueSoon: 0, completed30: 0, nearestDueDays: -2 } })), 'dsr-overdue');
    expect(c.status).toBe('fail');
    expect(c.href).toContain('status=overdue');
  });

  it('temizlik işi 48 saatten eski → fail; durum okunamazsa unknown (sessiz ok yok)', () => {
    const old = inputs({
      jobs: [{ ...inputs().jobs![0], lastOkAt: '2026-10-07T03:00:00Z' }],
    });
    expect(byId(evaluateChecks(old), 'retention-job').status).toBe('fail');
    expect(byId(evaluateChecks(inputs({ jobs: null })), 'retention-job').status).toBe('unknown');
  });

  it('IP kapsamı ölçülemezse unknown, düşükse fail', () => {
    expect(byId(evaluateChecks(inputs({ coverage: { ...inputs().coverage, total: 0, withIpPercent: null } })), 'audit-ip').status).toBe('unknown');
    expect(byId(evaluateChecks(inputs({ coverage: { ...inputs().coverage, withIpPercent: 40 } })), 'audit-ip').status).toBe('fail');
  });

  it('percent: payda 0 ise null', () => {
    expect(percent(1, 0)).toBeNull();
    expect(percent(1, 3)).toBe(33.3);
  });
});

describe('DSR kanıtı: makbuz teslim sayılmaz', () => {
  it('erişim talebinde yalnız makbuz bildirimi varsa teslim kanıtı eksik', () => {
    const events = [
      { type: 'received' },
      { type: 'notified', detail: { kind: 'receipt' } },
      { type: 'export_generated' },
    ];
    expect(isReceiptNotice(events[1])).toBe(true);
    expect(missingEvidence('access', events)).toEqual(['notified']);
    expect(missingEvidence('access', [...events, { type: 'notified', detail: { kind: 'access_ready' } }])).toEqual([]);
  });
});

describe('getConsentStats', () => {
  it('oranları kararlar içinde hesaplar, boş günleri 0 ile doldurur', async () => {
    const counts = [10, 6, 2, 3, 4]; // decisions, analytics, replay, marketing, rejectAll
    const db = {
      consentRecord: {
        count: jest.fn(async () => counts.shift()),
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([
            { version: '2', _count: { _all: 8 } },
            { version: '1', _count: { _all: 2 } },
          ])
          .mockResolvedValueOnce([{ source: 'banner', _count: { _all: 10 } }]),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ subjects: BigInt(7), signed_in: BigInt(3) }])
        .mockResolvedValueOnce([{ day: '2026-10-10', count: BigInt(4) }]),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = await getConsentStats(db as any, 7, NOW);
    expect(s.decisions).toBe(10);
    expect(s.rates).toEqual({ analytics: 60, replay: 20, marketing: 30 });
    expect(s.rejectAllRate).toBe(40);
    expect(s.subjects).toBe(7);
    expect(s.byVersion[0]).toEqual({ version: '2', count: 8, current: true });
    expect(s.daily).toHaveLength(7);
    expect(s.daily.find((d) => d.day === '2026-10-10')?.count).toBe(4);
    expect(s.daily[s.daily.length - 1].day).toBe('2026-10-11');
  });
});

function logDb(rows: { audit?: unknown[]; card?: unknown[]; suspicious?: unknown[]; runtime?: unknown[] }) {
  return {
    auditLog: { findMany: jest.fn(async () => rows.audit ?? []) },
    cardAuditLog: { findMany: jest.fn(async () => rows.card ?? []) },
    suspiciousActivity: { findMany: jest.fn(async () => rows.suspicious ?? []) },
    analyticsEvent: { findMany: jest.fn(async () => rows.runtime ?? []) },
    user: { findMany: jest.fn(async () => [{ id: 'u1', name: 'Ayşe', email: 'ayse@test.local' }]) },
  };
}

describe('listUnifiedLogs', () => {
  it('kaynakları zamana göre birleştirir, IP maskeler, sonraki cursoru verir', async () => {
    const db = logDb({
      audit: [
        { id: 'a2', action: 'dsr_erasure_executed', entity: 'DataSubjectRequest', entityId: 'r1', userId: 'u1', createdAt: new Date('2026-10-10T10:00:00Z'), ipAddress: '85.12.34.56', userAgent: 'UA' },
        { id: 'a1', action: 'login', entity: 'User', entityId: null, userId: 'u1', createdAt: new Date('2026-10-09T10:00:00Z'), ipAddress: null, userAgent: null },
      ],
      suspicious: [
        { id: 's1', type: 'velocity', userId: null, createdAt: new Date('2026-10-09T12:00:00Z'), ipAddress: '10.0.0.9', userAgent: null, severity: 'HIGH' },
      ],
      runtime: [
        { id: 'g1', event: 'module_gate_blocked', category: 'gate', userId: null, createdAt: new Date('2026-10-08T12:00:00Z'), data: { reason: 'disabled', routeKey: 'games' } },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listUnifiedLogs(db as any, { source: 'all', size: 2 } as any);
    expect(page.items.map((r) => r.id)).toEqual(['a2', 's1']);
    expect(page.items[0].ip).not.toContain('34.56');
    expect(page.items[0].user?.email).toBe('ayse@test.local');
    expect(page.items[1].severity).toBe('HIGH');
    expect(page.nextCursor).not.toBeNull();
    const c = decodeLogCursor(page.nextCursor);
    expect(c?.id).toBe('s1');
    // Her kaynaktan en fazla size+1 satır istenir.
    expect(db.auditLog.findMany.mock.calls[0][0].take).toBe(3);
  });

  it('cursor koşulu (createdAt, id) her kaynağa uygulanır', async () => {
    const db = logDb({});
    const cursor = encodeLogCursor(new Date('2026-10-09T12:00:00Z'), 's1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listUnifiedLogs(db as any, { source: 'audit', size: 30, cursor } as any);
    const where = db.auditLog.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"id":{"lt":"s1"}');
    expect(db.suspiciousActivity.findMany).not.toHaveBeenCalled();
  });

  it('kullanıcı araması eşleşmezse sorgu atmadan boş döner', async () => {
    const db = logDb({});
    db.user.findMany.mockResolvedValueOnce([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await listUnifiedLogs(db as any, { source: 'all', size: 30, user: 'yok' } as any);
    expect(page).toEqual({ items: [], nextCursor: null });
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('bozuk cursor yok sayılır', () => {
    expect(decodeLogCursor('!!!')).toBeNull();
    expect(decodeLogCursor(undefined)).toBeNull();
  });
});

describe('logsToCsv', () => {
  it('BOM ekler ve formül enjeksiyonunu kaçırır', () => {
    const row: UnifiedLogRow = {
      id: 'x',
      source: 'AUDIT',
      action: '=HYPERLINK("http://kotu")',
      entity: 'User',
      entityId: null,
      user: { id: 'u1', name: 'A; B', email: null },
      createdAt: '2026-10-10T10:00:00.000Z',
      ip: '85.12.*.*',
      userAgent: null,
      severity: null,
      reason: null,
    };
    const csv = logsToCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HYPERLINK(""http://kotu"")"`);
    expect(csv).toContain('"A; B"');
  });
});

describe('getRetentionView', () => {
  it('otomatik kurallarda bekleyen satırı sayar; sayılamayanı hata olarak bildirir', async () => {
    const rules = retentionEntries();
    expect(rules.length).toBeGreaterThan(0);
    const failing = rules[0].model.charAt(0).toLowerCase() + rules[0].model.slice(1);
    const db: Record<string, unknown> = {
      analyticsEvent: { count: jest.fn(async () => 5) },
      settings: {
        findUnique: jest.fn(async () => ({
          value: { jobs: { 'db-cleanup': { lastRunAt: 'x', lastOkAt: '2026-10-11T03:00:00Z', lastStatus: 'ok', consecutiveFailures: 0 } } },
        })),
      },
    };
    for (const r of rules) {
      const name = r.model.charAt(0).toLowerCase() + r.model.slice(1);
      db[name] = { count: jest.fn(async () => (name === failing ? Promise.reject(new Error('boom')) : 3)) };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = await getRetentionView(db as any, NOW);
    expect(v.rules.find((r) => r.model === rules[0].model)?.pending).toBeNull();
    expect(v.errors.join(' ')).toContain('boom');
    expect(v.analytics.pending).toBe(5);
    expect(v.jobs.find((j) => j.name === 'db-cleanup')?.lastOkAt).toBe('2026-10-11T03:00:00Z');
  });
});
