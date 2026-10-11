/**
 * Ekip yüzeyi route testleri (gerçek DB'ye GİDİLMEZ):
 *  - PATCH /api/staff/shifts: puantaj koşullu atomik güncelleme; erken giriş 409; pasif personel 403.
 *  - PATCH /api/staff/tasks: personel iptal edemez (şema), tamamlamada koşul `status in (...)`.
 *  - POST /api/staff/field-reports: Incident olarak yazılır, konum yuvarlanır, `clientId` idempotent.
 *  - POST /api/staff/checklists/complete: zorunlu madde eksikse 400.
 *  - PATCH /api/dealer/staff/leave: yalnız bekleyen talep; personele bildirim.
 */
import { NextRequest } from 'next/server';

const mockRequireAuth = jest.fn();
jest.mock('@/lib/api-auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }));
jest.mock('next-auth', () => ({ __esModule: true, getServerSession: jest.fn(async () => null) }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimitDb: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/redis', () => ({ redisGetJson: jest.fn(async () => null), redisSetJson: jest.fn(async () => undefined) }));
jest.mock('@/lib/module-gate', () => ({ assertModuleEnabled: jest.fn(async () => null) }));
const mockNotify = jest.fn(async () => undefined);
jest.mock('@/lib/notify-prefs-server', () => ({ notifyRespectingPrefs: (...a: unknown[]) => (mockNotify as (...x: unknown[]) => unknown)(...a) }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: Record<string, any> = {};
jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma, isPrismaConnectivityError: () => false }));

const STAFF = 'staff_user_1';
const DEALER = 'dealer_1';

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({}) };

function reset(extra: Record<string, unknown>) {
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, {
    dealerStaff: { findFirst: jest.fn(async () => ({ dealerId: DEALER })) },
    auditLog: { create: jest.fn(async () => ({})) },
    ...extra,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockRequireAuth.mockResolvedValue({ session: { user: { id: STAFF, role: 'STAFF', name: 'Ayşe' } } });
});

describe('PATCH /api/staff/shifts (puantaj)', () => {
  const shiftRow = {
    id: 'sh1',
    userId: STAFF,
    dealerId: DEALER,
    date: new Date('2026-10-12T00:00:00.000Z'),
    startTime: '09:00',
    endTime: '17:00',
    note: null,
    clockInAt: null,
    clockOutAt: null,
  };

  it('pencere içinde giriş: koşul clockInAt IS NULL ile atomik', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-12T06:02:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const updateMany = jest.fn(async () => ({ count: 1 }));
    reset({
      staffShift: {
        findFirst: jest.fn(async () => shiftRow),
        updateMany,
        findUnique: jest.fn(async () => ({ ...shiftRow, clockInAt: new Date('2026-10-12T06:02:00Z') })),
      },
    });
    const { PATCH } = await import('@/app/api/staff/shifts/route');
    const res = await PATCH(req('/api/staff/shifts', 'PATCH', { shiftId: 'sh1', action: 'clock_in' }), ctx);
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sh1', userId: STAFF, clockInAt: null } })
    );
    const body = await res.json();
    expect(body.data.shift.state).toBe('working');
  });

  it('erken giriş 409 TOO_EARLY ve yazım yok', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-12T03:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const updateMany = jest.fn();
    reset({ staffShift: { findFirst: jest.fn(async () => shiftRow), updateMany } });
    const { PATCH } = await import('@/app/api/staff/shifts/route');
    const res = await PATCH(req('/api/staff/shifts', 'PATCH', { shiftId: 'sh1', action: 'clock_in' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('TOO_EARLY');
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('pasif personel (aktif bağ yok) 403', async () => {
    reset({ dealerStaff: { findFirst: jest.fn(async () => null) }, staffShift: { findFirst: jest.fn() } });
    const { PATCH } = await import('@/app/api/staff/shifts/route');
    const res = await PATCH(req('/api/staff/shifts', 'PATCH', { shiftId: 'sh1', action: 'clock_in' }), ctx);
    expect(res.status).toBe(403);
    expect(mockPrisma.staffShift.findFirst).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/staff/tasks', () => {
  it('personel iptal gönderemez (400)', async () => {
    reset({ staffTask: { findFirst: jest.fn() } });
    const { PATCH } = await import('@/app/api/staff/tasks/route');
    const res = await PATCH(req('/api/staff/tasks?id=t1', 'PATCH', { status: 'cancelled' }), ctx);
    expect(res.status).toBe(400);
    expect(mockPrisma.staffTask.findFirst).not.toHaveBeenCalled();
  });

  it('tamamlama koşullu; işletmeye bildirim', async () => {
    const task = { id: 't1', title: 'Kasa sayımı', description: null, status: 'pending', dueAt: null, completedAt: null, createdAt: new Date(), assignedTo: STAFF };
    const updateMany = jest.fn(async () => ({ count: 1 }));
    reset({
      staffTask: {
        findFirst: jest.fn(async () => task),
        updateMany,
        findUnique: jest.fn(async () => ({ ...task, status: 'completed', completedAt: new Date() })),
      },
    });
    const { PATCH } = await import('@/app/api/staff/tasks/route');
    const res = await PATCH(req('/api/staff/tasks?id=t1', 'PATCH', { status: 'completed' }), ctx);
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 't1', assignedTo: STAFF, status: { in: ['pending', 'in_progress'] } });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: DEALER, title: 'Görev tamamlandı' }));
  });
});

describe('POST /api/staff/field-reports', () => {
  it('Incident olarak yazılır, konum yuvarlanır, bayiye haber gider', async () => {
    const create = jest.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'inc1',
      status: 'open',
      description: args.data.description,
      createdAt: new Date(),
      resolvedAt: null,
      metadata: args.data.metadata,
    }));
    reset({ incident: { findFirst: jest.fn(async () => null), create } });
    const { POST } = await import('@/app/api/staff/field-reports/route');
    const res = await POST(
      req('/api/staff/field-reports', 'POST', {
        clientId: 'fr:abcdef123456',
        category: 'equipment',
        urgent: true,
        note: 'Kahve makinesi çalışmıyor',
        location: { lat: 41.015137, lng: 28.979531, accuracyM: 23.4 },
      }),
      ctx
    );
    expect(res.status).toBe(201);
    const data = create.mock.calls[0][0].data as Record<string, any>;
    expect(data).toMatchObject({ dealerId: DEALER, type: 'custom', severity: 'high', status: 'open' });
    expect(data.metadata).toMatchObject({ source: 'staff_field_report', reporterUserId: STAFF, location: { lat: 41.015, lng: 28.98, accuracyM: 23 } });
    const body = await res.json();
    expect(body.data.report.location).toBeNull(); // personele koordinat dönmez
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: DEALER, title: 'Acil saha bildirimi' }));
  });

  it('aynı clientId ikinci kez kayıt üretmez', async () => {
    const create = jest.fn();
    reset({
      incident: {
        findFirst: jest.fn(async () => ({ id: 'inc1', status: 'open', description: null, createdAt: new Date(), resolvedAt: null, metadata: { category: 'busy' } })),
        create,
      },
    });
    const { POST } = await import('@/app/api/staff/field-reports/route');
    const res = await POST(req('/api/staff/field-reports', 'POST', { clientId: 'fr:abcdef123456', category: 'busy' }), ctx);
    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('POST /api/staff/checklists/complete', () => {
  it('zorunlu madde eksikse 400 ve kayıt yok', async () => {
    const create = jest.fn();
    reset({
      checklistTemplate: { findFirst: jest.fn(async () => ({ id: 'ck1', items: [{ id: 'a', label: 'Kasa sayıldı', required: true }, { id: 'b', label: 'Işık', required: false }] })) },
      staffChecklistCompletion: { findFirst: jest.fn(async () => null), create },
    });
    const { POST } = await import('@/app/api/staff/checklists/complete/route');
    const res = await POST(req('/api/staff/checklists/complete', 'POST', { templateId: 'ck1', items: [{ itemId: 'b', done: true }] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).details).toEqual({ missing: ['Kasa sayıldı'] });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/dealer/staff/leave', () => {
  it('yalnız bekleyen talep karara bağlanır; personele bildirim', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: DEALER, role: 'DEALER' } } });
    const updateMany = jest.fn(async () => ({ count: 1 }));
    reset({
      staffLeaveRequest: {
        updateMany,
        findUnique: jest.fn(async () => ({
          id: 'l1',
          userId: STAFF,
          startDate: new Date('2026-10-20T00:00:00Z'),
          endDate: new Date('2026-10-21T00:00:00Z'),
          user: { id: STAFF, name: 'Ayşe', email: 'a@x' },
        })),
      },
    });
    const { PATCH } = await import('@/app/api/dealer/staff/leave/route');
    const res = await PATCH(req('/api/dealer/staff/leave?id=l1', 'PATCH', { status: 'approved' }), ctx);
    expect(res.status).toBe(200);
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 'l1', dealerId: DEALER, status: 'pending' });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: STAFF, title: 'İzin talebiniz onaylandı' }));
  });

  it('zaten karara bağlanmış talep 409', async () => {
    mockRequireAuth.mockResolvedValue({ session: { user: { id: DEALER, role: 'DEALER' } } });
    reset({ staffLeaveRequest: { updateMany: jest.fn(async () => ({ count: 0 })) } });
    const { PATCH } = await import('@/app/api/dealer/staff/leave/route');
    const res = await PATCH(req('/api/dealer/staff/leave?id=l1', 'PATCH', { status: 'rejected' }), ctx);
    expect(res.status).toBe(409);
  });
});
