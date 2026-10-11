import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { SkeletonStats, SkeletonTable } from '@/components/states';
import { auditListQuerySchema, buildAuditQs, FILTER_KEYS } from '@/lib/admin-audit/contract';
import { getSummary, listAudit } from '@/lib/admin-audit/server';
import { AuditCenter, type AuditInitial } from '@/components/admin/a-denetim/audit-center';

/**
 * Admin → Denetim günlüğü (/admin/audit) — platformun kanonik denetim gezgini.
 *
 * Sunucu önce: özet göstergeler ve URL'deki süzgeçle ilk liste sayfası sunucuda okunur; istemci
 * adası `initialData` alır. Kaynak düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene"
 * gösterir ("kayıt yok" yanılgısı yok).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Denetim günlüğü',
  description: 'Yönetimsel ve hassas değişikliklerin kim tarafından, ne zaman yapıldığı ve neyi değiştirdiği.',
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(',') : v) ?? '';

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.error('[admin/audit] sunucu ön yüklemesi başarısız:', err);
    return null;
  }
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const auth = await requireAuth(['ADMIN']);
  const initial: AuditInitial = { summary: null, page: null };

  if (!('error' in auth)) {
    const raw = Object.fromEntries([...FILTER_KEYS, 'siralama'].map((k) => [k, first(sp[k])]));
    const limit = first(sp.limit);
    const parsed = auditListQuerySchema.safeParse({ ...raw, limit: '25' });
    const [summary, page] = await Promise.all([
      settle(getSummary(prisma)),
      parsed.success && (!limit || limit === '25') ? settle(listAudit(prisma, parsed.data)) : Promise.resolve(null),
    ]);
    initial.summary = summary;
    if (page && parsed.success) {
      const d = parsed.data;
      initial.page = {
        qs: buildAuditQs({
          q: d.q,
          varlik: d.varlik,
          eylem: d.eylem,
          kategori: d.kategori,
          onem: d.onem,
          aktor: d.aktor,
          rol: d.rol,
          tur: d.tur,
          donem: d.donem,
          from: d.from,
          to: d.to,
          siralama: d.siralama === 'eski' ? 'eski' : undefined,
        }),
        data: page,
      };
    }
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6">
          <SkeletonStats />
          <SkeletonTable />
        </div>
      }
    >
      <AuditCenter initial={initial} />
    </Suspense>
  );
}
