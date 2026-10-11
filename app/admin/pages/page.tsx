import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/api-auth';
import { cmsListQuerySchema, type CmsListQuery, type CmsPageList } from '@/lib/cms-pages/contract';
import { listCmsPages } from '@/lib/cms-pages/pages.server';
import { PagesConsole } from '@/components/admin/a-seo-sayfalar/pages-console';
import { SkeletonTable } from '@/components/states';

/**
 * Admin → İçerik sayfaları (/admin/pages). Sunucu önce: URL'deki filtreyle ilk sayfa sunucuda
 * okunur; düşerse istemci kendi sorgusunda görünür hata + "Tekrar dene" gösterir.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'İçerik sayfaları',
  description: 'Sitede /sayfa/… adresinde yayınlanan bilgi sayfaları: oluştur, düzenle, yayınla, geçmiş.',
};

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminPagesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const parsed = cmsListQuerySchema.safeParse({
    status: one(sp.durum) || 'all',
    q: one(sp.q) || undefined,
    page: one(sp.sayfa) || 1,
    pageSize: 20,
    sort: one(sp.sirala) === 'title' ? 'title' : 'updated',
  });
  const query: CmsListQuery = parsed.success ? parsed.data : { status: 'all', page: 1, pageSize: 20, sort: 'updated' };
  let initial: CmsPageList | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await listCmsPages(query);
    } catch (err) {
      console.error('[admin/pages] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return (
    <Suspense fallback={<SkeletonTable />}>
      <PagesConsole initial={initial} initialQuery={query} />
    </Suspense>
  );
}
