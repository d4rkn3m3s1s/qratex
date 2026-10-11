import type { Metadata } from 'next';
import { requireAuth } from '@/lib/api-auth';
import type { TemplatesView } from '@/lib/mail-center/templates-contract';
import { loadTemplatesView } from '@/lib/mail-center/templates.server';
import { TemplatesCenter } from '@/components/admin/a-iletisim/templates/templates-center';

/**
 * Admin → İletişim → Mail şablonları (/admin/intern-emails). Sunucu önce: şablonlar (sürümlü),
 * gönderim/açılma/yanıt özeti ve hatırlatma durumu sunucuda hazırlanır. `?t=<id>` derin bağlantı
 * (gelen kutusundaki "görev şablonunu aç" bağlantısı buraya gelir).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mail şablonları',
  description: 'Stajyer görev, karşılama, hatırlatma ve genel mail şablonları; canlı önizleme, test, gönderim ve açılma/yanıt takibi.',
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminInternEmailsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const t = Array.isArray(sp.t) ? sp.t[0] : sp.t;
  let initial: TemplatesView | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await loadTemplatesView();
    } catch (err) {
      console.error('[admin/intern-emails] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return <TemplatesCenter initial={initial} initialSelected={t?.slice(0, 64) ?? null} />;
}
