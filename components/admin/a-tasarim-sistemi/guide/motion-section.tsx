'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, m as Motion, type Variants } from 'framer-motion';
import { Play, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/states';
import {
  Ambient,
  DURATION_MS,
  EASE_CSS,
  SPRING,
  fadeIn,
  fadeUp,
  interactive,
  listContainer,
  listItem,
  popIn,
  prefersReducedMotionApp,
  prefersReducedMotionOS,
  scaleIn,
  sheetBottom,
  subscribeReducedMotion,
  useMotionPolicy,
} from '@/lib/motion';
import { useDesignSystemCopy } from '../copy';

type PresetKey = 'fadeUp' | 'fadeIn' | 'scaleIn' | 'popIn' | 'sheet' | 'stagger';

const PRESETS: Array<{ key: PresetKey; label: string; note: string; variants: Variants; register: 'ops' | 'play' }> = [
  { key: 'fadeUp', label: 'fadeUp', note: 'kart, bölüm, satır girişi', variants: fadeUp, register: 'ops' },
  { key: 'fadeIn', label: 'fadeIn', note: 'metin / durum değişimi', variants: fadeIn, register: 'ops' },
  { key: 'scaleIn', label: 'scaleIn', note: 'popover, kart açılışı', variants: scaleIn, register: 'ops' },
  { key: 'sheet', label: 'sheet(bottom)', note: 'alt sayfa / detay paneli', variants: sheetBottom, register: 'ops' },
  { key: 'popIn', label: 'popIn', note: 'yalnız play: ödül, rozet', variants: popIn, register: 'play' },
  { key: 'stagger', label: 'listContainer + listItem', note: 'ilk 12 öğe, toplam ≤ 0,6 sn', variants: listContainer, register: 'ops' },
];

function usePolicySources() {
  const [state, setState] = useState({ os: false, app: false });
  useEffect(() => {
    const read = () => setState({ os: prefersReducedMotionOS(), app: prefersReducedMotionApp() });
    read();
    return subscribeReducedMotion(read);
  }, []);
  return state;
}

export function MotionSection() {
  const dx = useDesignSystemCopy();
  const policy = useMotionPolicy();
  const sources = usePolicySources();
  const [active, setActive] = useState<PresetKey>('fadeUp');
  const [run, setRun] = useState(0);
  const preset = PRESETS.find((p) => p.key === active)!;

  return (
    <SectionCard
      title="Motion dili"
      description="Hareket durum değişikliğini anlatır, dekor değildir. Tek kaynak: lib/motion (README: lib/motion/README.md)."
    >
      <div className="space-y-6">
        <div
          role="status"
          className={cn(
            'qx-small flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control border px-3 py-2',
            policy.reduce ? 'border-warning-border bg-warning-subtle' : 'border-success-border bg-success-subtle',
          )}
        >
          <span className={cn('font-semibold', policy.reduce ? 'text-warning' : 'text-success')}>
            Hareket politikası: {policy.reduce ? 'azaltılmış' : 'normal'}
          </span>
          <span className="text-fg-muted">İşletim sistemi tercihi: {sources.os ? 'açık' : 'kapalı'}</span>
          <span className="text-fg-muted">Uygulama ayarı (Animasyonları azalt): {sources.app ? 'açık' : 'kapalı'}</span>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <h3 className="qx-overline text-fg-muted">Token'lar</h3>
            <div className="overflow-x-auto rounded-control border">
              <table className="w-full text-left">
                <tbody className="qx-small">
                  {(Object.keys(DURATION_MS) as Array<keyof typeof DURATION_MS>).map((k) => (
                    <tr key={k} className="border-b last:border-b-0">
                      <th scope="row" className="px-3 py-1.5 font-mono font-normal text-fg">
                        duration.{k}
                      </th>
                      <td className="qx-num px-3 py-1.5 text-right text-fg-muted">{DURATION_MS[k]} ms</td>
                    </tr>
                  ))}
                  {(Object.keys(EASE_CSS) as Array<keyof typeof EASE_CSS>).map((k) => (
                    <tr key={k} className="border-b last:border-b-0">
                      <th scope="row" className="px-3 py-1.5 font-mono font-normal text-fg">
                        ease.{k}
                      </th>
                      <td className="px-3 py-1.5 text-right font-mono text-fg-muted">{EASE_CSS[k].replace('cubic-bezier', '')}</td>
                    </tr>
                  ))}
                  {(Object.keys(SPRING) as Array<keyof typeof SPRING>).map((k) => (
                    <tr key={k} className="border-b last:border-b-0">
                      <th scope="row" className="px-3 py-1.5 font-mono font-normal text-fg">
                        spring.{k}
                      </th>
                      <td className="qx-num px-3 py-1.5 text-right font-mono text-fg-muted">
                        {SPRING[k].stiffness}/{SPRING[k].damping}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="qx-overline text-fg-muted">{dx.presetPlayer}</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Varyant ön ayarı">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={active === p.key}
                  onClick={() => {
                    setActive(p.key);
                    setRun((r) => r + 1);
                  }}
                  className={cn(
                    'qx-caption min-h-9 rounded-chip border px-2.5 font-mono transition-colors duration-fast',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active === p.key ? 'border-brand-border bg-brand-subtle text-brand' : 'bg-surface-1 text-fg-muted hover:text-fg',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative grid h-56 place-items-center overflow-hidden rounded-card border bg-surface-muted">
              <AnimatePresence mode="wait">
                {preset.key === 'stagger' ? (
                  <Motion.ul
                    key={`stagger-${run}`}
                    variants={listContainer}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="w-56 space-y-1.5"
                  >
                    {Array.from({ length: 6 }, (_, i) => (
                      <Motion.li key={i} variants={listItem} className="qx-caption rounded-chip border bg-surface-1 px-3 py-1.5 text-fg">
                        Satır {i + 1}
                      </Motion.li>
                    ))}
                  </Motion.ul>
                ) : (
                  <Motion.div
                    key={`${preset.key}-${run}`}
                    variants={preset.variants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className={cn(
                      'qx-small rounded-card border bg-surface-1 px-5 py-4 text-center text-fg qx-elevation-2',
                      preset.key === 'sheet' && 'absolute inset-x-3 bottom-0 rounded-b-none',
                    )}
                  >
                    <p className="font-semibold">{preset.label}</p>
                    <p className="qx-caption text-fg-muted">{preset.note}</p>
                  </Motion.div>
                )}
              </AnimatePresence>
              <span
                className={cn(
                  'qx-caption absolute left-2 top-2 rounded-chip px-1.5 py-0.5 font-semibold',
                  preset.register === 'play' ? 'bg-category-8/15 text-brand' : 'bg-surface-1 text-fg-muted',
                )}
              >
                {preset.register === 'play' ? 'play kaydı' : 'ops kaydı'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setRun((r) => r + 1)}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Tekrar oynat
              </Button>
              <Motion.button
                type="button"
                {...interactive}
                className="qx-small min-h-9 rounded-control border bg-surface-1 px-3 font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                interactive (hover/basış)
              </Motion.button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <Ambient
            className="relative h-16 w-16"
            fallback={
              <span className="absolute inset-0 grid place-items-center rounded-full border border-brand-border bg-brand-subtle text-brand">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
            }
          >
            <span className="absolute inset-0 grid place-items-center rounded-full border border-brand-border bg-brand-subtle text-brand">
              <Sparkles className="h-5 w-5" aria-hidden />
            </span>
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-brand [animation-duration:2.4s]" />
          </Ambient>
          <p className="qx-small text-fg-muted">
            <code className="font-mono text-fg">&lt;Ambient&gt;</code>: sonsuz döngüler yalnız play kaydında ve bu sarmalayıcıyla — azaltılmış harekette hiç
            render edilmez (statik kare), ekran dışındayken ve sekme gizliyken durur.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
