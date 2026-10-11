/**
 * Admin API kataloğu normalizasyonu (lib/integrations/catalog.ts) — politika özeti (mimari-api B14):
 * yeni üretim `policy` alanını taşır; eski üretimde alan yoksa uydurulmaz (null).
 */
import { normalizeCatalog } from '@/lib/integrations/catalog';

describe('normalizeCatalog', () => {
  it('politika özetini tipli geçirir, bozuk alanları eler', () => {
    const out = normalizeCatalog({
      generatedAt: '2026-10-11T00:00:00.000Z',
      routes: [
        {
          path: '/api/admin/users',
          methods: ['GET', 'POST'],
          file: 'app/api/admin/users/route.ts',
          auth: { kind: 'role', roles: ['ADMIN'] },
          policy: { rateLimited: true, modules: ['campaigns', 7], bodySchema: true, retired: false },
          usedBy: ['app/admin/users/page.tsx'],
        },
      ],
    });
    expect(out.routes[0].policy).toEqual({ rateLimited: true, modules: ['campaigns'], bodySchema: true, retired: false });
    expect(out.routes[0].domain).toBe('users');
  });

  it('eski üretimde policy yok → null (sahte "korumasız" işareti üretilmez)', () => {
    const out = normalizeCatalog({ routes: [{ path: '/api/admin/x', methods: ['GET'] }] });
    expect(out.routes[0].policy).toBeNull();
    expect(out.routes[0].auth).toEqual({ kind: 'unknown' });
  });
});
