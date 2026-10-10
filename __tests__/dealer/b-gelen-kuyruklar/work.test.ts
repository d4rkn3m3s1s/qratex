/**
 * Bana atananlar — saf çekirdek + sunucu mantığı (prisma mock; gerçek DB YOK).
 *  - Görev durum makinesi: geçersiz geçiş reddedilir, atama pending↔assigned türetir.
 *  - Sıralama: geciken → öncelik → son tarih.
 *  - A3: görev oluştururken başka işletmenin kişisine atama reddedilir; personel görev açamaz.
 *  - Personel (STAFF) kapsam ne olursa olsun yalnız kendine atananları görür.
 */
const mockFindMany = jest.fn(async (_a?: unknown) => [] as unknown[]);
const mockCount = jest.fn(async (_a?: unknown) => 0);
const mockValidate = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    actionItem: { findMany: (a: unknown) => mockFindMany(a), count: (a: unknown) => mockCount(a) },
    incident: { findMany: (a: unknown) => mockFindMany(a), count: (a: unknown) => mockCount(a) },
    $transaction: jest.fn(() => {
      throw new Error('transaction should not run');
    }),
  },
}));
jest.mock('@/lib/dealer/assignee', () => ({ validateAssignee: (...a: unknown[]) => mockValidate(...a) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/lib/dealer-queues/notify', () => ({ notifyAssignment: jest.fn() }));

import { applyTaskPatch, compareOpenWork, normalizeWorkScope, type TaskState } from '@/lib/dealer-queues/work-core';
import { createTask, listWork } from '@/lib/dealer-queues/work-server';
import type { AssigneeDirectory } from '@/lib/dealer-queues/assignees';

const NOW = new Date('2026-10-11T09:00:00Z');
const dir: AssigneeDirectory = { list: [], get: () => null };

describe('görev durum makinesi', () => {
  const base: TaskState = { status: 'pending', assignedToId: null, priority: 'medium', dueAt: null, completedAt: null } as TaskState;

  it('atama pending → assigned türetir', () => {
    const r = applyTaskPatch(base, { assignedToId: 'u1' }, NOW);
    expect(r.ok && r.next.status).toBe('assigned');
  });

  it('tamamlama completedAt yazar, yeniden açma siler', () => {
    const done = applyTaskPatch(base, { status: 'done' }, NOW);
    expect(done.ok && done.next.completedAt).toEqual(NOW);
    if (!done.ok) return;
    const reopened = applyTaskPatch(done.next, { status: 'open' }, NOW);
    expect(reopened.ok && reopened.next.completedAt).toBeNull();
  });

  it('iptal edilmiş görev doğrudan tamamlanamaz', () => {
    const r = applyTaskPatch({ ...base, status: 'cancelled' }, { status: 'done' }, NOW);
    expect(r.ok).toBe(false);
  });

  it('bilinmeyen kapsam "mine" olur', () => {
    expect(normalizeWorkScope('hepsi')).toBe('mine');
  });
});

describe('açık iş sıralaması', () => {
  const w = (o: Partial<Parameters<typeof compareOpenWork>[0]>) => ({
    priority: 'medium' as const,
    dueAt: null,
    overdue: false,
    createdAt: '2026-10-01T00:00:00Z',
    closedAt: null,
    status: 'open' as const,
    ...o,
  });
  it('geciken iş, yüksek öncelikliden önce gelir', () => {
    const list = [w({ priority: 'critical' }), w({ priority: 'low', overdue: true })];
    list.sort(compareOpenWork);
    expect(list[0].overdue).toBe(true);
  });
});

describe('createTask (A3)', () => {
  beforeEach(() => mockValidate.mockReset());

  it('başka işletmenin kişisine atama VALIDATION hatası verir', async () => {
    mockValidate.mockResolvedValue({ ok: false, error: 'Seçilen kişi bu işletmeye ait değil.' });
    await expect(
      createTask('dealer-a', { id: 'dealer-a', name: null, role: 'DEALER' }, { text: 'Masa 4 temizlensin', assignedToId: 'foreign' }, dir, NOW)
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mockValidate).toHaveBeenCalledWith('dealer-a', 'foreign');
  });

  it('personel görev oluşturamaz', async () => {
    await expect(
      createTask('dealer-a', { id: 'staff-1', name: null, role: 'STAFF' }, { text: 'Masa 4 temizlensin' }, dir, NOW)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockValidate).not.toHaveBeenCalled();
  });
});

describe('listWork kapsamı', () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockCount.mockClear();
  });

  it('personel "ekip" istese de yalnız kendine atananları görür', async () => {
    await listWork(
      'dealer-a',
      { id: 'staff-1', name: null, role: 'STAFF' },
      { scope: 'team', kind: 'all', q: '', offset: 0, limit: 25 },
      dir,
      { incidentsEnabled: true },
      NOW
    );
    expect(mockFindMany).toHaveBeenCalledTimes(2);
    for (const [arg] of mockFindMany.mock.calls) {
      const where = (arg as { where: { AND: unknown[] } }).where;
      expect(where.AND).toEqual(expect.arrayContaining([{ dealerId: 'dealer-a' }, { assignedToId: 'staff-1' }]));
    }
  });

  it('vaka modülü kapalıysa vaka sorgulanmaz', async () => {
    const r = await listWork(
      'dealer-a',
      { id: 'dealer-a', name: null, role: 'DEALER' },
      { scope: 'mine', kind: 'all', q: '', offset: 0, limit: 25 },
      dir,
      { incidentsEnabled: false },
      NOW
    );
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(r.incidentsIncluded).toBe(false);
  });
});
