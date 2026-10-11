import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireAuth } from '@/lib/api-auth';
import { getPlatformSettingsState, type PlatformSettingsState } from '@/lib/platform-settings/server';
import { SettingsCenter } from '@/components/admin/a-ayarlar-kapi/settings-center';
import { SkeletonForm } from '@/components/states';

/**
 * Admin → Ayarlar (/admin/settings). Sunucu önce: kayıt defterindeki ayarlar, sürümleri ve
 * bağlam (SEO kimliği, dönemsel konsept, e-posta, Google, bakım yayını, gizli kapı özeti)
 * sunucuda okunur. Ön yükleme düşerse istemci görünür hata + "Tekrar dene" gösterir —
 * varsayılan değerlerle form AÇILMAZ (B6).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ayarlar',
  description: 'Platform ayarları: genel, kimlik doğrulama, güvenlik ve gizli kapı, bakım modu, rol bazlı erişim ve değişiklik geçmişi.',
};

export default async function AdminSettingsPage() {
  let initial: PlatformSettingsState | null = null;
  const auth = await requireAuth(['ADMIN']);
  if (!('error' in auth)) {
    try {
      initial = await getPlatformSettingsState();
    } catch (err) {
      console.error('[admin/settings] sunucu ön yüklemesi başarısız:', err);
    }
  }
  return (
    <Suspense fallback={<SkeletonForm />}>
      <SettingsCenter initial={initial} />
    </Suspense>
  );
}
