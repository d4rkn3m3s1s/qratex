/**
 * Sahte "demo olay" (D11 / P0-14): yeni bayi incidents sayfasını açtığında kalıcı, kapatılamaz
 * bir "açık olay" yazılıyor ve Copilot / brifing / admin sağlık skorunu kirletiyordu.
 *  - GET artık hiçbir koşulda demo olay YAZMAZ.
 *  - Eski demo kayıtları yalnız birebir imza eşleşmesiyle silinir (gerçek olaylar korunur).
 */
const mockIncidentCreate = jest.fn();
const mockIncidentDeleteMany = jest.fn();
const mockIncidentFindMany = jest.fn();
const mockIncidentCount = jest.fn();

jest.mock('@prisma/client', () => ({ Prisma: { DbNull: 'DbNull' } }));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    incident: {
      create: (...a: unknown[]) => mockIncidentCreate(...a),
      deleteMany: (...a: unknown[]) => mockIncidentDeleteMany(...a),
      findMany: (...a: unknown[]) => mockIncidentFindMany(...a),
      count: (...a: unknown[]) => mockIncidentCount(...a),
    },
    feedback: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));
jest.mock('@/lib/api-auth', () => ({
  requireAuth: jest.fn(async () => ({ session: { user: { id: 'dealer_new', role: 'DEALER' } } })),
}));

import { NextRequest } from 'next/server';
import { LEGACY_DEMO_INCIDENT, purgeLegacyDemoIncidents } from '@/lib/incident-detection';
import { GET } from '@/app/api/dealer/incidents/route';

beforeEach(() => {
  jest.clearAllMocks();
  mockIncidentDeleteMany.mockResolvedValue({ count: 0 });
  mockIncidentFindMany.mockResolvedValue([]);
  mockIncidentCount.mockResolvedValue(0);
});

describe('demo olay kaldırıldı', () => {
  it('hiç olayı olmayan yeni bayide GET hiçbir olay yazmaz; boş liste döner', async () => {
    const res = await GET(new NextRequest('http://localhost/api/dealer/incidents'));
    expect(res.status).toBe(200);
    expect(mockIncidentCreate).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ items: [], total: 0 });
  });

  it('eski demo kayıtları yalnız birebir imzayla ve bayi kapsamında temizlenir', async () => {
    mockIncidentDeleteMany.mockResolvedValue({ count: 1 });
    const n = await purgeLegacyDemoIncidents('dealer_x');
    expect(n).toBe(1);
    const where = mockIncidentDeleteMany.mock.calls[0][0].where;
    expect(where).toEqual({
      dealerId: 'dealer_x',
      type: LEGACY_DEMO_INCIDENT.type,
      severity: LEGACY_DEMO_INCIDENT.severity,
      title: LEGACY_DEMO_INCIDENT.title,
      description: LEGACY_DEMO_INCIDENT.description,
      assignedToId: null,
      thresholdValue: null,
      metadata: { equals: 'DbNull' },
    });
  });

  it('bayi verilmezse platform geneli temizlik yapılır (bakım işi)', async () => {
    await purgeLegacyDemoIncidents();
    expect(mockIncidentDeleteMany.mock.calls[0][0].where.dealerId).toBeUndefined();
  });
});
