import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/api-auth';
import { isPrismaConnectivityError } from '@/lib/prisma';
import { getServerLocale } from '@/lib/server-locale';
import { resolveSettingsSection, type CustomerSettingsSnapshot } from '@/lib/customer-settings/contract';
import { loadCustomerSettings } from '@/lib/customer-settings/load.server';
import { PageHeader, PanelPage } from '@/components/ds/page';
import { EmptyState } from '@/components/states';
import { getSettingsCopy } from '@/components/customer/m-ayarlar/copy';
import { SettingsExperience } from '@/components/customer/m-ayarlar/settings-experience';

/**
 * /customer/me/settings — Ayarlar (Ben → Ayarlar). Eski `/customer/settings` buraya kalıcı
 * yönlenir (sorgu korunur; `?tab=privacy` gibi e-posta/yasal sayfa derin linkleri dahil).
 *
 * Sunucu önce: yetki DB'den (`requireAuth`: rol, askı, oturum sürümü), tüm okuma modeli tek
 * paralel turda sunucuda (`lib/customer-settings/load.server.ts`) yüklenip istemci adasına
 * `initial` olarak geçer — ilk boyamada istek yok. Yükleme düşerse ada yeniden dener ve hatayı
 * görünür gösterir (varsayılan değerlerle form açılmaz). Bölümler sekme başına ayrı parça.
 */
export const dynamic = 'force-dynamic';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function toQuery(sp: Record<string, string | string[] | undefined>, override: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (typeof v === 'string') q.set(k, v);
  }
  for (const [k, v] of Object.entries(override)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function generateMetadata(): Promise<Metadata> {
  const c = getSettingsCopy((await getServerLocale()) === 'en' ? 'en' : 'tr');
  return { title: c.title, description: c.description, robots: { index: false, follow: false } };
}

export default async function CustomerSettingsPage({ searchParams }: PageProps) {
  const [sp, locale] = await Promise.all([searchParams, getServerLocale()]);
  const copy = getSettingsCopy(locale === 'en' ? 'en' : 'tr');

  // Eski sekme adları (preferences, cosmetics) yeni bölümlere: tek kanonik URL.
  const rawTab = first(sp.tab);
  const section = resolveSettingsSection(rawTab);
  if (rawTab && section && section !== rawTab) redirect(`/customer/me/settings${toQuery(sp, { tab: section })}`);

  const auth = await requireAuth(['CUSTOMER']);
  if ('error' in auth) {
    if (auth.error.status === 401) {
      redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/customer/me/settings${toQuery(sp, {})}`)}`);
    }
    if (auth.error.status === 403) {
      return (
        <PanelPage register="ops" width="narrow" header={<PageHeader title={copy.title} description={copy.description} />}>
          <EmptyState variant="permission" title={copy.forbiddenTitle} description={copy.forbiddenBody} />
        </PanelPage>
      );
    }
    // Geçici kimlik altyapısı hatası: ada kendi isteğinde aynı yetkiyi tekrar dener ve hatayı gösterir.
    return <SettingsExperience initial={null} />;
  }

  let initial: CustomerSettingsSnapshot | null = null;
  try {
    const h = await headers();
    initial = await loadCustomerSettings(auth.session.user.id, {
      jti: (auth.session as { jti?: string }).jti ?? null,
      userAgent: h.get('user-agent'),
    });
  } catch (error) {
    if (!isPrismaConnectivityError(error)) console.error('[customer/me/settings] sunucu yüklemesi başarısız; ada yeniden deneyecek', error);
  }

  return <SettingsExperience initial={initial} />;
}
