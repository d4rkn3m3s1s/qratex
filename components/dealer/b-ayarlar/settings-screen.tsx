'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, Bot, CreditCard, ShieldCheck, Store, UserRound } from 'lucide-react';
import { PanelPage, PageHeader, SectionTabs } from '@/components/ds/page';
import { QueryState, SkeletonForm } from '@/components/states';
import { StatusBadge } from '@/components/ds/data';
import { openStateFor } from '@/lib/places/business-hours';
import type { DealerSettingsSnapshot, DealerSettingsTab } from '@/lib/dealer-settings/contract';
import type { BillingSummary } from '@/lib/dealer-settings/billing.server';
import { weekToStored } from '@/lib/dealer-settings/hours';
import { BILLING_KEY, SETTINGS_KEY, fetchBilling, fetchSettings } from './api';
import { SUBSCRIPTION_STATUS } from './format';
import { BusinessTab } from './business-tab';

const AccountTab = dynamic(() => import('./account-tab').then((m) => m.AccountTab), { loading: () => <SkeletonForm /> });
const NotificationsTab = dynamic(() => import('./notifications-tab').then((m) => m.NotificationsTab), { loading: () => <SkeletonForm /> });
const SecurityTab = dynamic(() => import('./security-tab').then((m) => m.SecurityTab), { loading: () => <SkeletonForm /> });
const AiTab = dynamic(() => import('./ai-tab').then((m) => m.AiTab), { loading: () => <SkeletonForm /> });
const BillingTab = dynamic(() => import('./billing-tab').then((m) => m.BillingTab), { loading: () => <SkeletonForm /> });

const TABS: ReadonlyArray<{ value: DealerSettingsTab; label: string; icon: ReactNode }> = [
  { value: 'business', label: 'İşletme', icon: <Store /> },
  { value: 'account', label: 'Hesabım', icon: <UserRound /> },
  { value: 'notifications', label: 'Bildirimler', icon: <Bell /> },
  { value: 'security', label: 'Güvenlik', icon: <ShieldCheck /> },
  { value: 'ai', label: 'AI', icon: <Bot /> },
  { value: 'billing', label: 'Abonelik', icon: <CreditCard /> },
];

/**
 * Ayarlar istemci adası. Veri sunucuda gömülü gelir (React Query hidrasyonu). Yükleme düşerse
 * `QueryState` hata + "Tekrar dene" gösterir; formlar veri gelmeden açılmaz (yükleme-kilidi).
 * Abonelik sekmesi kendi sorgusunu kullanır: Stripe/ödeme tarafı diğer ayarları bekletmez.
 */
export function SettingsScreen() {
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal) });
  const billing = useQuery({ queryKey: BILLING_KEY, queryFn: () => fetchBilling() });

  return (
    <PanelPage
      register="ops"
      width="default"
      header={
        <PageHeader
          title="Ayarlar"
          description="İşletme profiliniz, hesabınız, bildirimler, güvenlik, AI ve aboneliğiniz tek yerde."
        />
      }
    >
      <Overview snapshot={settings.data} billing={billing.data} />
      <SectionTabs tabs={TABS} ariaLabel="Ayar bölümleri" defaultValue="business" touchTarget resetKeys={['status', 'session_id', 'plan']}>
        {(tab) =>
          tab === 'billing' ? (
            <BillingTab />
          ) : (
            <QueryState query={settings} skeleton="form" error={{ title: 'Ayarlar yüklenemedi' }}>
              {(data: DealerSettingsSnapshot) => <TabBody tab={tab as DealerSettingsTab} data={data} />}
            </QueryState>
          )
        }
      </SectionTabs>
    </PanelPage>
  );
}

function TabBody({ tab, data }: { tab: DealerSettingsTab; data: DealerSettingsSnapshot }) {
  switch (tab) {
    case 'business':
      return <BusinessTab data={data.business} />;
    case 'account':
      return <AccountTab data={data.account} />;
    case 'notifications':
      return <NotificationsTab ai={data.ai} pushDevices={data.pushDevices} />;
    case 'security':
      return <SecurityTab data={data.security} />;
    case 'ai':
      return <AiTab section={data.ai} />;
    default:
      return null;
  }
}

/** Üst özet: "müşterim beni nasıl görüyor + hesabım güvende mi" tek bakışta; dokununca ilgili sekme. */
function Overview({ snapshot, billing }: { snapshot?: DealerSettingsSnapshot; billing?: BillingSummary }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (tab: DealerSettingsTab) => {
    const q = new URLSearchParams(params.toString());
    ['status', 'session_id', 'plan'].forEach((k) => q.delete(k));
    if (tab === 'business') q.delete('tab');
    else q.set('tab', tab);
    const s = q.toString();
    router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
  };

  // Saat istemcide, hidrasyondan sonra hesaplanır (sunucu/istemci dakika farkı uyuşmazlık üretmesin).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const open = useMemo(() => {
    if (!snapshot || !now) return null;
    return openStateFor(weekToStored(snapshot.business.hours), snapshot.business.holidayMode, now);
  }, [snapshot, now]);

  if (!snapshot) return null;
  const { business, security, ai } = snapshot;
  const status = billing?.current.status ? SUBSCRIPTION_STATUS[billing.current.status] : null;

  const tiles: Array<{ tab: DealerSettingsTab; title: string; value: ReactNode; meta: ReactNode }> = [
    {
      tab: 'business',
      title: 'Müşterinin gördüğü',
      value: business.businessName || 'İşletme adı yok',
      meta: business.holidayMode ? (
        <StatusBadge label="Geçici olarak kapalı" tone="warning" size="sm" />
      ) : open?.status === 'open' ? (
        <StatusBadge label={open.closesAt ? `Açık · ${open.closesAt}'de kapanır` : 'Açık'} tone="success" size="sm" />
      ) : open?.status === 'closed' ? (
        <StatusBadge label="Şu an kapalı" tone="neutral" size="sm" />
      ) : now ? (
        <StatusBadge label="Çalışma saati yok" tone="warning" size="sm" />
      ) : null,
    },
    {
      tab: 'security',
      title: 'Güvenlik',
      value: security.twoFactor.enabled ? 'İki adımlı doğrulama açık' : 'İki adımlı doğrulama kapalı',
      meta: <StatusBadge label={security.twoFactor.enabled ? 'Korunuyor' : 'Önerilir'} tone={security.twoFactor.enabled ? 'success' : 'warning'} size="sm" />,
    },
    {
      tab: 'ai',
      title: 'AI motoru',
      value: !ai.moduleEnabled ? 'Yönetici tarafından kapalı' : ai.settings.isEnabled ? (ai.settings.autoAnalyze ? 'Açık · otomatik analiz' : 'Açık · elle') : 'Kapalı',
      meta: <StatusBadge label={ai.settings.isEnabled && ai.moduleEnabled ? 'Çalışıyor' : 'Durdu'} tone={ai.settings.isEnabled && ai.moduleEnabled ? 'success' : 'neutral'} size="sm" />,
    },
    {
      tab: 'billing',
      title: 'Plan',
      value: billing ? billing.current.planName : '—',
      meta: status ? <StatusBadge label={status.label} tone={status.tone} size="sm" /> : <StatusBadge label="Ücretsiz kademe" tone="neutral" size="sm" />,
    },
  ];

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ayar özeti">
      {tiles.map((t) => (
        <li key={t.tab} className="min-w-0">
          <button
            type="button"
            onClick={() => go(t.tab)}
            className="group flex h-full min-h-11 w-full flex-col items-start gap-1.5 rounded-card border border-subtle bg-surface-1 p-4 text-left transition-colors duration-fast ease-standard hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="qx-caption text-fg-muted">{t.title}</span>
            <span className="qx-body w-full truncate font-semibold text-fg">{t.value}</span>
            {t.meta}
          </button>
        </li>
      ))}
    </ul>
  );
}
