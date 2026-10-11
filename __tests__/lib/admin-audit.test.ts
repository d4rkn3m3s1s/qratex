/**
 * /admin/audit — sözleşme ve sunucu çekirdeği. Gerçek DB yok; prisma sahte.
 *
 * Kapsanan bulgular (docs/audit/2026-10-08/admin/admin_audit.md):
 *  - B3: kategori/önem SQL koşulu katalogdaki sınıflandırmayla birebir; varlık eşleşmesi duyarsız.
 *  - B4: bitiş günü dahil (İstanbul), ters aralık reddedilir.
 *  - B2/B6: gizli anahtarlar fark ve ham JSON'da maskeli; tekil gizli ayarın tamamı maskeli.
 *  - B1: silinmiş aktör anlık görüntüden okunur.
 *  - B9: imleçli sayfalama, toplam yalnız ilk sayfada.
 *  - Dışa aktarma: veri gövdesi yok, formül kaçışı, kendisi denetime yazılır.
 */
jest.mock('@prisma/client', () => jest.requireActual(require('path').join(process.cwd(), 'generated-prisma-client')));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));
jest.mock('@/lib/redis', () => ({ cachedJson: async (_k: string, _t: number, f: () => unknown) => f() }));
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: async () => ({ ok: true }) }));
jest.mock('@/lib/seo-settings', () => ({ SEO_SETTINGS_KEY: 'seo' }));
jest.mock('@/lib/admin-gate', () => ({ isProtectedSettingKey: (k: unknown) => k === 'admin_gate' }));

import { AUDIT_CATEGORIES, AUDIT_SEVERITIES, categoryOf, severityOf } from '@/lib/admin-audit/catalog';
import { auditListQuerySchema } from '@/lib/admin-audit/contract';
import {
  MASK,
  buildWhere,
  categoryWhere,
  csvCell,
  diffJson,
  exportAuditCsv,
  istanbulDayStart,
  listAudit,
  redactJson,
  resolveActor,
  revertFor,
  severityWhere,
} from '@/lib/admin-audit/server';

/** Prisma `where` alt kümesini (AND/OR/NOT + action contains insensitive) bellek içinde değerlendirir. */
function matches(where: Record<string, unknown>, action: string): boolean {
  const a = action.toLowerCase();
  if (Array.isArray(where.AND)) return (where.AND as Record<string, unknown>[]).every((w) => matches(w, action));
  if (Array.isArray(where.OR)) return (where.OR as Record<string, unknown>[]).some((w) => matches(w, action));
  if (Array.isArray(where.NOT)) return (where.NOT as Record<string, unknown>[]).every((w) => !matches(w, action));
  const f = where.action as { contains: string } | undefined;
  if (f) return a.includes(f.contains.toLowerCase());
  throw new Error(`beklenmeyen koşul ${JSON.stringify(where)}`);
}

const ACTIONS = [
  'batch_update', 'update', 'create', 'delete', 'rollback', 'BULK_DELETE_USERS', 'BULK_ANONYMIZE_USERS', 'DELETE_API_KEY',
  'CREATE_API_KEY', 'UPDATE_POINTS_MATRIX', 'CLAIM_REWARD', 'COMPLETED_ACHIEVEMENT', 'CHANGE_PASSWORD', 'USER_ROLE_CHANGE',
  'USERS_EXPORT', 'ADMIN_GATE_PASSED', 'ADMIN_GATE_FAILED', 'RESTORE_REWARD', 'ARCHIVE_BADGE', 'agent_council.session.create',
  'SCANNED', 'incident.note', 'ADMIN_POINTS_ADJUST', 'toggle-theme', 'minigame_config_reset', 'AUDIT_EXPORT',
];

describe('katalog ↔ SQL eşdeğerliği', () => {
  it.each(AUDIT_CATEGORIES)('kategori %s: koşul yalnız o kategoriye düşen eylemleri seçer', (cat) => {
    for (const action of ACTIONS) expect([action, matches(categoryWhere(cat) as Record<string, unknown>, action)]).toEqual([action, categoryOf(action) === cat]);
  });
  it.each(AUDIT_SEVERITIES)('önem %s: koşul sınıflandırmayla aynı', (sev) => {
    for (const action of ACTIONS) expect([action, matches(severityWhere(sev) as Record<string, unknown>, action)]).toEqual([action, severityOf(action) === sev]);
  });
  it('kritik silmeler "delete" kategorisinde, oturum adlı eylemler güvenlik sayılmaz', () => {
    expect(categoryOf('BULK_DELETE_USERS')).toBe('delete');
    expect(severityOf('BULK_DELETE_USERS')).toBe('critical');
    expect(categoryOf('agent_council.session.create')).toBe('create');
    expect(severityOf('ADMIN_GATE_PASSED')).toBe('normal');
    expect(severityOf('ADMIN_GATE_FAILED')).toBe('critical');
  });
});

describe('sözleşme + tarih', () => {
  it('ters aralık reddedilir, geçersiz sayfa boyutu reddedilir', () => {
    expect(auditListQuerySchema.safeParse({ from: '2026-10-09', to: '2026-10-08' }).success).toBe(false);
    expect(auditListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(auditListQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
    expect(auditListQuerySchema.parse({ varlik: 'settings,User' }).varlik).toEqual(['settings', 'User']);
  });
  it('aynı gün seçilince tüm İstanbul günü kapsanır (bitiş dahil)', () => {
    const w = buildWhere(auditListQuerySchema.parse({ from: '2026-10-08', to: '2026-10-08' })) as { AND: Array<{ createdAt?: { gte: Date; lt: Date } }> };
    const c = w.AND.find((x) => x.createdAt)!.createdAt!;
    expect(c.gte.toISOString()).toBe('2026-10-07T21:00:00.000Z');
    expect(c.lt.toISOString()).toBe('2026-10-08T21:00:00.000Z');
    expect(istanbulDayStart('2026-01-01').toISOString()).toBe('2025-12-31T21:00:00.000Z');
  });
  it('varlık eşleşmesi büyük/küçük harfe duyarsız', () => {
    const w = buildWhere(auditListQuerySchema.parse({ varlik: 'user' })) as { AND: unknown[] };
    expect(JSON.stringify(w)).toContain('"mode":"insensitive"');
  });
});

describe('aktör', () => {
  it('silinmiş kullanıcı anlık görüntüden okunur', () => {
    const a = resolveActor({ userId: null, actorType: 'user', actorSnapshot: { email: 'b@x.com', role: 'ADMIN', name: null }, user: null });
    expect(a).toMatchObject({ kind: 'deleted', email: 'b@x.com', role: 'ADMIN', deleted: true, fromSnapshot: true });
    expect(resolveActor({ userId: null, actorType: 'user', actorSnapshot: null, user: null }).fromSnapshot).toBe(false);
    expect(resolveActor({ userId: null, actorType: 'cron', actorSnapshot: null, user: null }).kind).toBe('cron');
  });
});

describe('maskeleme + fark', () => {
  it('gizli anahtarlar maskelenir, değişim yine görünür', () => {
    const { rows } = diffJson({ openaiApiKey: 'sk-old', siteName: 'A', maxTokens: 10 }, { openaiApiKey: 'sk-new', siteName: 'B', maxTokens: 10 });
    const key = rows.find((r) => r.path === 'openaiApiKey')!;
    expect(key).toMatchObject({ change: 'changed', secret: true, before: MASK, after: MASK });
    expect(rows.find((r) => r.path === 'maxTokens')).toMatchObject({ change: 'same', secret: false, after: '10' });
    expect(rows[0].change).toBe('changed');
    expect(JSON.stringify(redactJson({ smtp: { password: 'x' }, a: 1 }).value)).not.toContain('"x"');
  });
  it('tekil gizli ayarın değeri bütünüyle maskelenir', () => {
    const { rows } = diffJson('sk-old', 'sk-new', true);
    expect(rows).toEqual([{ path: '(değer)', before: MASK, after: MASK, change: 'changed', secret: true }]);
    expect(redactJson('sk-old', true)).toEqual({ value: MASK, count: 1 });
  });
});

describe('geri alma uygunluğu', () => {
  it('yalnız mevcut uçların kabul ettiği kayıtlar', () => {
    expect(revertFor({ entity: 'settings', entityId: null, action: 'batch_update', oldData: { siteName: 'A' } }, null)?.kind).toBe('settings');
    expect(revertFor({ entity: 'settings', entityId: 's1', action: 'update', oldData: { a: 1 } }, 'pointsMatrix')).toBeNull();
    expect(revertFor({ entity: 'settings', entityId: 's1', action: 'update', oldData: { global: {} } }, 'seo')?.kind).toBe('seo');
    expect(revertFor({ entity: 'Settings', entityId: null, action: 'batch_update', oldData: { a: 1 } }, null)).toBeNull();
    expect(revertFor({ entity: 'settings', entityId: null, action: 'batch_update', oldData: { admin_gate: 1 } }, null)).toBeNull();
  });
});

const row = (id: string, at: string, action = 'update') => ({
  id,
  createdAt: new Date(at),
  action,
  entity: 'settings',
  entityId: null,
  userId: 'u1',
  actorType: 'user',
  actorSnapshot: null,
  user: { id: 'u1', email: 'a@x.com', name: 'Ayşe', role: 'ADMIN' },
  ipAddress: '10.1.2.3',
});

describe('liste + dışa aktarma', () => {
  it('imleçli sayfalama; toplam yalnız ilk sayfada', async () => {
    const findMany = jest.fn().mockResolvedValue([row('c', '2026-10-08T10:00:00Z'), row('b', '2026-10-08T09:00:00Z'), row('a', '2026-10-08T08:00:00Z')]);
    const count = jest.fn().mockResolvedValue(3);
    const db = { auditLog: { findMany, count } } as never;
    const p1 = await listAudit(db, auditListQuerySchema.parse({ limit: '10' }));
    expect(p1.total).toBe(3);
    expect(p1.nextCursor).toBeNull();
    findMany.mockResolvedValue(Array.from({ length: 11 }, (_, i) => row(`r${i}`, '2026-10-08T08:00:00Z')));
    const p2 = await listAudit(db, auditListQuerySchema.parse({ limit: '10' }));
    expect(p2.items).toHaveLength(10);
    expect(p2.nextCursor).toBeTruthy();
    count.mockClear();
    const p3 = await listAudit(db, auditListQuerySchema.parse({ limit: '10', cursor: p2.nextCursor }));
    expect(p3.total).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });
  it('CSV: BOM, formül kaçışı, maskeli IP, veri gövdesi yok, kendisi denetime yazılır', async () => {
    const create = jest.fn().mockResolvedValue({});
    const findMany = jest.fn().mockResolvedValue([{ ...row('x', '2026-10-08T10:00:00Z'), entityId: '=HYPERLINK("x")' }]);
    const db = { auditLog: { findMany, create } } as never;
    const out = await exportAuditCsv(db, auditListQuerySchema.parse({}), { id: 'u1', email: 'a@x.com', role: 'ADMIN', type: 'user' });
    expect(out.csv.charCodeAt(0)).toBe(0xfeff);
    expect(out.csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out.csv).toContain('10.1.*.*');
    expect(out.csv).not.toContain('10.1.2.3');
    expect(findMany.mock.calls[0][0].select.oldData).toBeUndefined();
    expect(create.mock.calls[0][0].data).toMatchObject({ action: 'AUDIT_EXPORT', userId: 'u1' });
    expect(csvCell('a;b')).toBe('"a;b"');
  });
});
