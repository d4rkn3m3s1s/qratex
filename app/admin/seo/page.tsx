import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/api-auth';
import { getLastSeoHealth, getSeoState } from '@/lib/admin-seo/seo.server';
import { siteUrl } from '@/lib/site-config';
import { SeoConsole } from '@/components/admin/a-seo-sayfalar/seo-console';
import type { SeoBundle } from '@/components/admin/a-seo-sayfalar/api';
import { SkeletonForm } from '@/components/states';

/**
 * Admin → SEO Motoru (/admin/seo). Sunucu önce: güncel ayarlar (önbelleği atlayarak, `updatedAt`
 * ile) ve son sağlık raporu sunucuda okunur. Ön yükleme düşerse istemci görünür hata + "Tekrar dene".
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SEO Motoru',
  description: 'Meta etiketleri, sosyal kartlar, yapısal veri, robots.txt, sitemap ve sayfa ezmeleri; sağlık kontrolü ve sürüm geçmişi.',
};

export default async function AdminSeoPage() {
  let initial: SeoBundle | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      const [state, health] = await Promise.all([getSeoState(), getLastSeoHealth()]);
      initial = { state, health };
    } catch (err) {
      console.error('[admin/seo] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return (
    <Suspense fallback={<SkeletonForm />}>
      <SeoConsole initial={initial} envSiteUrl={siteUrl} />
    </Suspense>
  );
}
