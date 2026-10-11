import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import type { CmsPageDetail } from '@/lib/cms-pages/contract';
import { getCmsPage } from '@/lib/cms-pages/pages.server';
import { PageEditor } from '@/components/admin/a-seo-sayfalar/page-editor';

/** Admin → İçerik sayfası editörü. `yeni` → oluşturma; aksi hâlde sayfa sunucuda ön yüklenir. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sayfa düzenle' };

export default async function AdminPageEditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === 'yeni') return <PageEditor id={null} initial={null} />;
  let initial: CmsPageDetail | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await getCmsPage(id);
    } catch (err) {
      // Bulunamadı/erişilemedi: istemci sorgusu görünür hata ya da 404 durumu gösterir.
      console.error('[admin/pages/[id]] ön yükleme başarısız:', err);
    }
  }
  return <PageEditor id={id} initial={initial} />;
}
