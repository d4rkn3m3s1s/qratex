'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRatio } from '@/lib/design/contrast';
import {
  contrastChecks,
  paletteFor,
  resolvePaletteTokens,
  type ColorMode,
  type ThemeDraft,
  type ResolvedTokens,
} from '@/lib/design-system/theme-model';
import { useDesignSystemCopy } from '../copy';

const hsl = (t: string) => `hsl(${t})`;

/**
 * Kapsamlı önizleme: taslak paleti çalışma zamanının yazacağı değerlerle (resolvePaletteTokens)
 * yalnız bu tuvale çizer. Belge köküne hiçbir şey yazılmaz → kaydetmeden çıkınca sızıntı yok.
 */
function MiniApp({ t, mode }: { t: ResolvedTokens; mode: ColorMode }) {
  const dx = useDesignSystemCopy();
  const label = mode === 'dark' ? 'Koyu mod' : 'Açık mod';
  return (
    <figure className="min-w-0 space-y-1.5">
      <figcaption className="qx-caption font-medium text-fg-muted">{label}</figcaption>
      <div
        aria-hidden
        className="overflow-hidden rounded-card border transition-colors duration-base motion-reduce:transition-none"
        style={{ background: hsl(t.background), color: hsl(t.foreground), borderColor: hsl(t.border) }}
      >
        <div className="flex min-h-[15rem]">
          <div className="hidden w-16 shrink-0 flex-col gap-2 border-r p-2 min-[420px]:flex" style={{ borderColor: hsl(t.border), background: hsl(t.card) }}>
            <span className="h-6 rounded-md" style={{ background: hsl(t.primary) }} />
            <span className="h-2 rounded" style={{ background: hsl(t.muted) }} />
            <span className="h-2 rounded" style={{ background: hsl(t.secondary) }} />
            <span className="h-2 rounded" style={{ background: hsl(t.muted) }} />
          </div>
          <div className="min-w-0 flex-1 space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{dx.panelSummary}</span>
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: hsl(t.accent), color: hsl(t.accentFg) }}>
                Yeni
              </span>
            </div>
            <div className="space-y-2 rounded-xl border p-3" style={{ background: hsl(t.card), borderColor: hsl(t.border) }}>
              <p className="text-sm font-medium">{dx.weeklyFeedback}</p>
              <p className="text-xs" style={{ color: hsl(t.mutedFg) }}>
                İkincil metin bu renkte okunur.
              </p>
              <div className="flex h-12 items-end gap-1.5" >
                {[40, 65, 50, 85, 70, 95].map((h, i) => (
                  <span
                    key={i}
                    className="w-full rounded-sm"
                    style={{ height: `${h}%`, background: hsl(i % 3 === 0 ? t.primary : i % 3 === 1 ? t.secondary : t.accent) }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: hsl(t.border), color: hsl(t.mutedFg), boxShadow: `0 0 0 2px ${hsl(t.background)}, 0 0 0 4px ${hsl(t.primary)}` }}>
              Odaklanmış giriş alanı
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: hsl(t.primary), color: hsl(t.primaryFg) }}>
                Kaydet
              </span>
              <span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: hsl(t.secondary), color: hsl(t.secondaryFg) }}>
                İkincil
              </span>
              <span className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: hsl(t.border) }}>
                Vazgeç
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function ContrastList({ t, mode }: { t: ResolvedTokens; mode: ColorMode }) {
  const checks = contrastChecks(t);
  return (
    <div className="space-y-1.5">
      <p className="qx-caption font-medium text-fg-muted">{mode === 'dark' ? 'Koyu mod kontrastı' : 'Açık mod kontrastı'}</p>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.id} className="qx-caption flex items-center justify-between gap-2">
            <span className="text-fg">{c.label}</span>
            <span
              className={cn(
                'qx-num inline-flex shrink-0 items-center gap-1 rounded-chip border px-1.5 py-0.5 font-medium',
                c.pass ? 'border-success-border bg-success-subtle text-success' : 'border-danger-border bg-danger-subtle text-danger',
              )}
            >
              {c.pass ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
              {formatRatio(c.ratio)}
              <span className="sr-only">{c.pass ? `geçti, gereken ${c.min}:1` : `kaldı, gereken ${c.min}:1`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PreviewCanvas({ draft }: { draft: ThemeDraft }) {
  const light = resolvePaletteTokens(paletteFor(draft, 'light'), 'light');
  const dark = resolvePaletteTokens(paletteFor(draft, 'dark'), 'dark');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <MiniApp t={light} mode="light" />
        <MiniApp t={dark} mode="dark" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ContrastList t={light} mode="light" />
        <ContrastList t={dark} mode="dark" />
      </div>
    </div>
  );
}
