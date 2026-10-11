'use client';

import { useCallback, useEffect, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { m as Motion } from 'framer-motion';
import { Construction, Eye, History, KeyRound, Settings2, ShieldCheck } from 'lucide-react';
import { PageHeader, QueryState, SkeletonList } from '@/components/states';
import { cn } from '@/lib/utils';
import { fadeUp, useMotionPolicy } from '@/lib/motion';
import type { PlatformSettingsState } from '@/lib/platform-settings/server';
import { SETTINGS_KEYS } from '@/lib/platform-settings/registry';
import { fetchState, settingsKeys } from './api';
import { GeneralSection } from './section-general';
import { IdentitySection } from './section-identity';
import { SecuritySection } from './section-security';
import { MaintenanceSection } from './section-maintenance';

const AccessSection = dynamic(() => import('./section-access').then((x) => x.AccessSection), {
  ssr: false,
  loading: () => <SkeletonList />,
});
const HistorySection = dynamic(() => import('./section-history').then((x) => x.HistorySection), {
  ssr: false,
  loading: () => <SkeletonList />,
});

export const SECTION_IDS = ['genel', 'kimlik', 'guvenlik', 'bakim', 'erisim', 'gecmis'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

const SECTIONS: Array<{ id: SectionId; label: string; hint: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'genel', label: 'Genel', hint: 'Kimlik özeti, arka plan, e-posta', icon: Settings2 },
  { id: 'kimlik', label: 'Kimlik', hint: 'Kayıt ve giriş yolları', icon: KeyRound },
  { id: 'guvenlik', label: 'Güvenlik ve kapı', hint: 'Gizli kapı, hesabım, şifre', icon: ShieldCheck },
  { id: 'bakim', label: 'Bakım', hint: 'Panelleri geçici kapatma', icon: Construction },
  { id: 'erisim', label: 'Erişim', hint: 'Rol bazlı görünürlük', icon: Eye },
  { id: 'gecmis', label: 'Geçmiş', hint: 'Değişiklikler ve geri alma', icon: History },
];

/** Eski `?tab=` derin bağlantıları (diğer sayfalardan) → yeni bölümler. */
const LEGACY_TAB: Record<string, SectionId> = {
  profile: 'guvenlik',
  general: 'genel',
  appearance: 'genel',
  auth: 'kimlik',
  ai: 'genel',
  gamification: 'genel',
  modules: 'erisim',
  'page-settings': 'erisim',
};

export function resolveSection(bolum: string | null, tab: string | null): SectionId {
  if (bolum && (SECTION_IDS as readonly string[]).includes(bolum)) return bolum as SectionId;
  if (tab && LEGACY_TAB[tab]) return LEGACY_TAB[tab];
  return 'genel';
}

export function SettingsCenter({ initial }: { initial: PlatformSettingsState | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [section, setSection] = useState<SectionId>(() => resolveSection(params.get('bolum'), params.get('tab')));
  const motion = useMotionPolicy();

  const query = useQuery({
    queryKey: settingsKeys.state,
    queryFn: ({ signal }) => fetchState(signal),
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });

  useEffect(() => {
    setSection(resolveSection(params.get('bolum'), params.get('tab')));
  }, [params]);

  const go = useCallback(
    (id: SectionId) => {
      setSection(id);
      const next = new URLSearchParams(params.toString());
      next.delete('tab');
      next.set('bolum', id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        icon={<Settings2 aria-hidden />}
        eyebrow="Yönetim · Platform"
        title="Ayarlar"
        description="Yalnız gerçekten bir şeyi değiştiren ayarlar burada. Diğer ayarların asıl sahibi olan sayfalara bağlantı verilir."
      />

      {query.data ? <StatusStrip state={query.data} onGo={go} /> : null}

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Ayar bölümleri" className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-20 lg:mx-0 lg:self-start lg:overflow-visible lg:px-0">
          <ul className="flex gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s) => {
              const active = s.id === section;
              const Icon = s.icon;
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      active ? 'bg-brand-subtle text-brand' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="qx-small block whitespace-nowrap font-medium">{s.label}</span>
                      <span className="qx-caption hidden text-fg-muted lg:block">{s.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <Motion.section
          key={section}
          aria-label={SECTIONS.find((s) => s.id === section)?.label}
          variants={motion.variants(fadeUp)}
          initial="hidden"
          animate="visible"
          className="min-w-0"
        >
          {section === 'erisim' ? (
            <AccessSection />
          ) : section === 'gecmis' ? (
            <HistorySection />
          ) : (
            <QueryState query={query} skeleton="form" loadingLabel="Ayarlar yükleniyor">
              {(state) =>
                section === 'genel' ? (
                  <GeneralSection state={state} />
                ) : section === 'kimlik' ? (
                  <IdentitySection state={state} />
                ) : section === 'guvenlik' ? (
                  <SecuritySection state={state} />
                ) : (
                  <MaintenanceSection state={state} />
                )
              }
            </QueryState>
          )}
        </Motion.section>
      </div>
    </div>
  );
}

function Chip({ label, value, tone, onClick }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'off'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-2 rounded-chip border px-3 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        tone === 'ok' && 'border-success-border bg-success-subtle',
        tone === 'warn' && 'border-warning-border bg-warning-subtle',
        tone === 'bad' && 'border-danger-border bg-danger-subtle',
        tone === 'off' && 'border-border bg-surface-muted'
      )}
    >
      <span className="qx-caption text-fg-muted">{label}</span>
      <span
        className={cn(
          'qx-small font-semibold',
          tone === 'ok' && 'text-success',
          tone === 'warn' && 'text-warning',
          tone === 'bad' && 'text-danger',
          tone === 'off' && 'text-fg'
        )}
      >
        {value}
      </span>
    </button>
  );
}

/** Acil durum anahtarlarının tek bakışta özeti; çip ilgili bölüme götürür. */
function StatusStrip({ state, onGo }: { state: PlatformSettingsState; onGo: (id: SectionId) => void }) {
  const v = state.values;
  const c = state.context;
  const maint = v[SETTINGS_KEYS.maintenance];
  const googleOn = c.googleEnvConfigured && v[SETTINGS_KEYS.googleAuth];
  const magicOn = v[SETTINGS_KEYS.magicLink] && c.mail.configured;
  return (
    <div className="space-y-3">
      {maint.enabled ? (
        <div role="status" className="qx-small rounded-card border border-danger-border bg-danger-subtle px-4 py-3 text-fg">
          <strong className="text-danger">Bakım modu açık.</strong> Müşteri ve bayi panelleri şu an kapalı.{' '}
          <button type="button" className="font-medium underline underline-offset-4" onClick={() => onGo('bakim')}>
            Bakım ayarına git
          </button>
        </div>
      ) : null}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Platform durumu">
        <Chip label="Bakım" value={maint.enabled ? 'AÇIK' : 'Kapalı'} tone={maint.enabled ? 'bad' : 'ok'} onClick={() => onGo('bakim')} />
        <Chip
          label="Kayıt"
          value={v[SETTINGS_KEYS.registrationOpen] ? 'Açık' : 'Kapalı'}
          tone={v[SETTINGS_KEYS.registrationOpen] ? 'ok' : 'warn'}
          onClick={() => onGo('kimlik')}
        />
        <Chip label="Google" value={!c.googleEnvConfigured ? 'Ortamda yok' : googleOn ? 'Açık' : 'Kapalı'} tone={googleOn ? 'ok' : 'off'} onClick={() => onGo('kimlik')} />
        <Chip label="Bağlantıyla giriş" value={magicOn ? 'Açık' : 'Kapalı'} tone={magicOn ? 'ok' : 'off'} onClick={() => onGo('kimlik')} />
        <Chip
          label="E-posta"
          value={c.mail.configured ? [c.mail.smtp && 'SMTP', c.mail.resend && 'Resend'].filter(Boolean).join(' + ') : 'Yok'}
          tone={c.mail.configured ? 'ok' : 'bad'}
          onClick={() => onGo('genel')}
        />
        <Chip
          label="Gizli kapı"
          value={c.gate === null ? 'Okunamadı' : c.gate.isDefaultAnswer ? 'Varsayılan cevap' : c.gate.locks24h > 0 ? `${c.gate.locks24h} kilit` : 'Etkin'}
          tone={c.gate === null ? 'warn' : c.gate.isDefaultAnswer ? 'bad' : c.gate.locks24h > 0 ? 'warn' : 'ok'}
          onClick={() => onGo('guvenlik')}
        />
      </div>
    </div>
  );
}
