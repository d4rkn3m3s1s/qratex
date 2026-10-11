'use client';

import { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { SEO_ROUTES } from '@/lib/admin-seo/contract';
import { cn } from '@/lib/utils';
import type { Draft } from './seo-draft';
import { useSeoCopy } from './copy';

/**
 * Canlı önizleme: Google sonucu (gerçek düzen — site adı/URL üstte küçük, başlık mavi ve büyük;
 * kırpma karakterle değil piksel genişliğiyle) + sosyal kart. Kaydedilmemiş taslağı gösterir.
 */
let ctx: CanvasRenderingContext2D | null | undefined;
function measure(text: string, font: string): number {
  if (ctx === undefined) {
    try {
      ctx = document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
  }
  if (!ctx) return text.length * (parseInt(font, 10) * 0.5);
  ctx.font = font;
  return ctx.measureText(text).width;
}

function clip(text: string, font: string, maxPx: number): string {
  if (measure(text, font) <= maxPx) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${text.slice(0, mid)} …`, font) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()} …`;
}

const LIMITS = {
  desktop: { title: 600, desc: 920 * 2 },
  mobile: { title: 2 * 330, desc: 3 * 330 },
} as const;

export function SeoPreview({ draft, base, focusPath, onFocusPath }: { draft: Draft; base: string; focusPath: string; onFocusPath: (p: string) => void }) {
  const fz = useSeoCopy().fx;
  const uy = useSeoCopy().ui2;
  const ux = useSeoCopy().ui;
  const sx = useSeoCopy();
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const g = draft.global;
  const ov = draft.pageOverrides.find((o) => o.path === focusPath);
  const isHome = focusPath === '/';
  const routeLabel = SEO_ROUTES.find((r) => r.path === focusPath)?.label ?? 'Ana sayfa';
  const title = (ov?.title.trim() || (isHome ? g.defaultTitle : `${routeLabel} | ${g.siteName}`)).trim();
  const desc = (ov?.description.trim() || (isHome ? g.defaultDescription : '')).trim();
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return 'site';
    }
  })();
  const crumbs = [host, ...focusPath.split('/').filter(Boolean)].join(' › ');
  const lim = LIMITS[device];
  const shownTitle = mounted ? clip(title, '20px arial', lim.title) : title;
  const shownDesc = mounted ? clip(desc, '14px arial', lim.desc) : desc;
  const ogSrc = g.ogImageUrl ? (/^https?:/i.test(g.ogImageUrl) ? g.ogImageUrl : `${base}${g.ogImageUrl}`) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <span>{uy.sayfa}</span>
          <select
            value={focusPath}
            onChange={(e) => onFocusPath(e.target.value)}
            className="min-h-10 rounded-control border border-border bg-surface-1 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {SEO_ROUTES.map((r) => <option key={r.path} value={r.path}>{r.label}</option>)}
          </select>
        </label>
        <div role="radiogroup" aria-label={ux.cihaz} className="inline-flex rounded-control border border-border p-0.5">
          {(['desktop', 'mobile'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              onClick={() => setDevice(d)}
              className={cn('inline-flex min-h-10 items-center gap-1.5 rounded-chip px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus', device === d ? 'bg-surface-3 text-fg' : 'text-fg-muted')}
            >
              {d === 'desktop' ? <Monitor className="h-4 w-4" aria-hidden /> : <Smartphone className="h-4 w-4" aria-hidden />}
              {d === 'desktop' ? ux.masaustu : 'Mobil'}
            </button>
          ))}
        </div>
      </div>

      <figure className={cn('rounded-card border border-border bg-surface-1 p-4', device === 'mobile' && 'max-w-[360px]')} aria-label={ux.googleSonucOnizlemesi}>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg" aria-hidden>
            {(g.siteName || 'S').slice(0, 1)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm text-fg">{g.siteName || ux.siteAdi}</p>
            <p className="truncate text-xs text-fg-muted">{crumbs}</p>
          </div>
        </div>
        <p className={cn('mt-2 text-info', device === 'desktop' ? 'text-xl leading-7' : 'text-lg leading-6')}>{shownTitle || ux.baslik}</p>
        <p className="mt-1 text-sm leading-5 text-fg-muted">{shownDesc || (isHome ? ux.aciklamaYok : ux.aciklamaSayfaninKendiMetninden)}</p>
        {!g.robotsIndex ? <p className="mt-2 text-xs font-medium text-danger">{sx.noindexOn}</p> : null}
        <figcaption className="sr-only">{sx.serpCaption}</figcaption>
      </figure>

      <figure className="overflow-hidden rounded-card border border-border bg-surface-1" aria-label={ux.sosyalPaylasimKartiOnizlemesi}>
        <div className="aspect-[1.91/1] w-full bg-surface-3">
          {isHome ? (
            // Ana sayfada dosya tabanlı dinamik görsel (app/opengraph-image.tsx) ayardaki görseli ezer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/opengraph-image" alt={ux.yayindakiAnaSayfaPaylasim} className="h-full w-full object-cover" loading="lazy" />
          ) : ogSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ogSrc} alt={ux.paylasimGorseli} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-fg-muted">{sx.noImage}</div>
          )}
        </div>
        <div className="space-y-0.5 border-t border-border p-3">
          <p className="text-xs uppercase text-fg-subtle">{host}</p>
          <p className="line-clamp-1 font-semibold text-fg">{title || ux.baslik}</p>
          <p className="line-clamp-2 text-sm text-fg-muted">{desc}</p>
        </div>
        <figcaption className="border-t border-border px-3 py-2 text-xs text-fg-muted">
          {isHome
            ? ux.anaSayfaBaslikVe
            : fz.otherPagesOg(g.twitterCard === 'summary')}
        </figcaption>
      </figure>
    </div>
  );
}
