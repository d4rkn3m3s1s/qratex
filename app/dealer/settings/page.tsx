import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { requireAuth } from '@/lib/api-auth';
import { isPrismaConnectivityError } from '@/lib/prisma';
import { resolveDealerSettingsTab } from '@/lib/dealer-settings/contract';
import { loadDealerSettings } from '@/lib/dealer-settings/load.server';
import { loadBillingSummary } from '@/lib/dealer-settings/billing.server';
import { SettingsScreen } from '@/components/dealer/b-ayarlar/settings-screen';
import { BILLING_KEY, SETTINGS_KEY } from '@/components/dealer/b-ayarlar/keys';

/**
 * Bayi › Ayarlar — İşletme · Hesabım · Bildirimler · Güvenlik · AI · Abonelik.
 * Eski `/dealer/ai-settings` ve `/dealer/billing` buraya kalıcı yönlenir (sorgu korunur).
 *
 * Sunucu önce: yetki DB'den (`requireAuth`), ayarlar + abonelik özeti tek paralel turda sunucuda
 * yüklenir ve React Query önbelleğine gömülür → ilk boyamada istek yok. Bir yükleme düşerse o
 * önbellek boş kalır; ada BFF'i çağırır ve hatayı görünür gösterir (yükleme-kilidi: veri gelmeden
 * form AÇILMAZ, varsayılanlarla kayıt olmaz).
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ayarlar',
  description: 'İşletme profili, hesabınız, bildirimler, güvenlik, AI ve abonelik.',
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function toQuery(sp: SearchParams, override: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (typeof v === 'string') q.set(k, v);
  }
  for (const [k, v] of Object.entries(override)) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export default async function DealerSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;

  // Eski/Türkçe sekme adları (onboarding "profil/konum", "abonelik") → tek kanonik URL.
  const rawTab = first(sp.tab) ?? first(sp.section);
  const tab = resolveDealerSettingsTab(rawTab);
  if (rawTab && tab && (tab !== rawTab || sp.section !== undefined)) {
    const rest = { ...sp };
    delete rest.section;
    redirect(`/dealer/settings${toQuery(rest, { tab })}`);
  }

  const auth = await requireAuth(['DEALER']);
  const queryClient = new QueryClient();
  if (!('error' in auth)) {
    const dealerId = auth.session.user.id;
    const h = await headers();
    const [settings, billing] = await Promise.allSettled([
      loadDealerSettings(dealerId, {
        jti: (auth.session as { jti?: string }).jti ?? null,
        userAgent: h.get('user-agent'),
      }),
      loadBillingSummary(dealerId),
    ]);
    if (settings.status === 'fulfilled') queryClient.setQueryData(SETTINGS_KEY, settings.value);
    if (billing.status === 'fulfilled') queryClient.setQueryData(BILLING_KEY, billing.value);
    for (const r of [settings, billing]) {
      if (r.status === 'rejected' && !isPrismaConnectivityError(r.reason)) {
        console.error('[dealer/settings] SSR yüklemesi başarısız; ada yeniden deneyecek', r.reason);
      }
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsScreen />
    </HydrationBoundary>
  );
}
