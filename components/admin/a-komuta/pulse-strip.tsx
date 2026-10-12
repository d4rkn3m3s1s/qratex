'use client';

/**
 * "Platform nabzı" — admin'deki TEK canvas şeridi (yol haritası §4.2 3D/canvas politikası).
 *
 * Her kova (24 sa → saat, 7/30 g → İstanbul günü) üç katmanlı bir sütundur: geri bildirim
 * (QR + tüketim yorumu), tüketim, yeni kullanıcı. Son kova "sürüyor" olarak soluk + kesikli
 * çizilir (kısmi gün düşüş gibi okunmasın — platform-pulse B3). Veriler KPI kartlarıyla aynı
 * kovalardan gelir; toplamlar birebir eşleşir.
 *
 * Hareket: ilk veri geldiğinde sütunlar 320 ms'de bir kez yükselir (`slow`); azaltılmış
 * harekette doğrudan son hâl. Sonsuz döngü yok. Renkler tema token'larından JS ile okunur
 * ve tema değişince yeniden çizilir (scroll-scene tuzağı: canvas CSS değişkeni bilmez).
 * Erişilebilirlik: ← → / Home / End ile kova seçimi, seçili kovanın dökümü canlı bölgede,
 * tüm veri ayrıca açılır bir tabloda.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotionPref } from '@/lib/motion';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PulseSeries } from '@/lib/admin-command/types';
import { bucketLabel, formatInt } from './format';
import { AdminKomutaText } from './copy';
import { useDsLocale } from '@/components/ds/a11y/copy';

const PULSE_COPY = {
  tr: {
    layer: { feedback: 'Geri bildirim', consumptions: 'Tüketim', newUsers: 'Yeni kullanıcı' },
    ongoing: ' (sürüyor)',
    ongoingLegend: 'Sürüyor (kısmi)',
    readout: (fb: string, co: string, nu: string) => `${fb} geri bildirim · ${co} tüketim · ${nu} yeni kullanıcı`,
    hour: 'Saat',
    day: 'Gün',
    summary: (n: number, hourly: boolean, total: string, max: string) =>
      `Platform nabzı: ${n} ${hourly ? 'saatlik' : 'günlük'} kovada toplam ${total} olay. En yoğun kova ${max} olay.`,
    stripAria: 'Nabız şeridi. Kovalar arasında sol ve sağ ok tuşlarıyla gezin.',
    now: 'şimdi',
    today: 'bugün',
    showTable: 'Veri tablosunu göster',
    csv: 'CSV indir',
  },
  en: {
    layer: { feedback: 'Feedback', consumptions: 'Consumptions', newUsers: 'New users' },
    ongoing: ' (in progress)',
    ongoingLegend: 'In progress (partial)',
    readout: (fb: string, co: string, nu: string) => `${fb} feedback · ${co} consumptions · ${nu} new users`,
    hour: 'Hour',
    day: 'Day',
    summary: (n: number, hourly: boolean, total: string, max: string) =>
      `Platform pulse: ${total} events across ${n} ${hourly ? 'hourly' : 'daily'} buckets. Busiest bucket: ${max} events.`,
    stripAria: 'Pulse strip. Use the left and right arrow keys to move between buckets.',
    now: 'now',
    today: 'today',
    showTable: 'Show data table',
    csv: 'Download CSV',
  },
} as const;

type Props = {
  keys: string[];
  unit: 'hour' | 'day';
  series: PulseSeries;
  className?: string;
};

const LAYERS = [
  { id: 'feedback', label: 'Geri bildirim', token: '--category-1' },
  { id: 'consumptions', label: 'Tüketim', token: '--category-2' },
  { id: 'newUsers', label: 'Yeni kullanıcı', token: '--category-3' },
] as const;

type Palette = { layers: string[]; axis: string; focus: string };

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    layers: LAYERS.map((l, i) => `hsl(${v(l.token, ['262 83% 58%', '199 89% 48%', '160 84% 39%'][i]!)})`),
    axis: `hsl(${v('--border', '220 14% 82%')})`,
    focus: `hsl(${v('--ring', '262 83% 58%')})`,
  };
}

const HEIGHT = 88;

export function PulseStrip({ keys, unit, series, className }: Props) {
  const isEn = useDsLocale() === 'en';
  const P = isEn ? PULSE_COPY.en : PULSE_COPY.tr;
  const reduce = useReducedMotionPref();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const progressRef = useRef(reduce ? 1 : 0);
  const playedRef = useRef(false);

  const totals = useMemo(
    () => keys.map((_, i) => (series.feedback[i] ?? 0) + (series.consumptions[i] ?? 0) + (series.newUsers[i] ?? 0)),
    [keys, series]
  );
  const max = Math.max(1, ...totals);
  const grand = totals.reduce((a, b) => a + b, 0);

  // Genişlik: ebeveyn ölçekli olabilir → clientWidth (proje hafızası).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Tema token'ları: ilk boyamada ve tema/erişilebilirlik sınıfı değişince.
  useEffect(() => {
    setPalette(readPalette());
    const mo = new MutationObserver(() => setPalette(readPalette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    return () => mo.disconnect();
  }, []);

  const draw = useCallback(
    (progress: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !palette || width <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
      if (canvas.height !== Math.round(HEIGHT * dpr)) canvas.height = Math.round(HEIGHT * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, HEIGHT);

      const n = keys.length;
      const slot = width / n;
      const gap = Math.min(4, slot * 0.25);
      const barW = Math.max(1, slot - gap);
      const base = HEIGHT - 1;

      ctx.fillStyle = palette.axis;
      ctx.fillRect(0, base, width, 1);

      for (let i = 0; i < n; i++) {
        const x = i * slot + gap / 2;
        const partial = i === n - 1;
        let y = base;
        const values = [series.feedback[i] ?? 0, series.consumptions[i] ?? 0, series.newUsers[i] ?? 0];
        ctx.globalAlpha = partial ? 0.5 : active == null || active === i ? 1 : 0.55;
        values.forEach((val, li) => {
          const h = ((val / max) * (HEIGHT - 6)) * progress;
          if (h <= 0) return;
          ctx.fillStyle = palette.layers[li]!;
          ctx.fillRect(x, y - h, barW, h);
          y -= h;
        });
        ctx.globalAlpha = 1;
        if (partial && totals[i]! > 0) {
          ctx.strokeStyle = palette.focus;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, base - y - 1);
          ctx.setLineDash([]);
        }
        if (active === i) {
          ctx.strokeStyle = palette.focus;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 1, 1, barW + 2, base - 1);
        }
      }
    },
    [palette, width, keys.length, series, max, totals, active]
  );

  // Tek seferlik yükseliş (azaltılmış harekette yok); sonraki çizimler doğrudan.
  useEffect(() => {
    if (!palette || width <= 0) return;
    if (reduce || playedRef.current) {
      progressRef.current = 1;
      draw(1);
      return;
    }
    playedRef.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 320);
      progressRef.current = 1 - Math.pow(1 - p, 3);
      draw(progressRef.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, palette, width, reduce]);

  const indexFromX = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const rel = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.max(0, Math.min(keys.length - 1, Math.floor(rel * keys.length)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = keys.length - 1;
    const cur = active ?? last;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'ArrowRight') next = Math.min(last, cur + 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  const shown = active ?? keys.length - 1;
  const readout =
    keys.length === 0
      ? ''
      : `${bucketLabel(keys[shown]!, unit, true, isEn)}${shown === keys.length - 1 ? P.ongoing : ''}: ` +
        P.readout(formatInt(series.feedback[shown] ?? 0), formatInt(series.consumptions[shown] ?? 0), formatInt(series.newUsers[shown] ?? 0));

  const downloadCsv = () => {
    // BOM + ';' ayraç (TR Excel); hücreler yalnız sayı/tarih — formül enjeksiyonu yüzeyi yok.
    const head = [unit === 'hour' ? P.hour : P.day, ...LAYERS.map((l) => P.layer[l.id])].join(';');
    const lines = keys.map((k, i) =>
      [bucketLabel(k, unit, true, isEn) + (i === keys.length - 1 ? P.ongoing : ''), series.feedback[i] ?? 0, series.consumptions[i] ?? 0, series.newUsers[i] ?? 0].join(';')
    );
    const blob = new Blob(['\uFEFF' + [head, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-nabzi-${keys[0] ?? 'veri'}-${keys[keys.length - 1] ?? ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const summary = P.summary(keys.length, unit === 'hour', formatInt(grand), formatInt(max));

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        {LAYERS.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: `hsl(var(${l.token}))` }} />
            {P.layer[l.id]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm border border-dashed border-fg-muted" />
          {P.ongoingLegend}
        </span>
      </div>

      <div
        ref={wrapRef}
        role="group"
        tabIndex={0}
        aria-label={P.stripAria}
        aria-describedby="pulse-readout"
        onKeyDown={onKeyDown}
        onPointerMove={(e) => setActive(indexFromX(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="relative w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ height: HEIGHT }}
      >
        <canvas ref={canvasRef} role="img" aria-label={summary} className="block h-full w-full" style={{ height: HEIGHT }} />
      </div>

      <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-fg-muted">
        <span>{keys[0] ? bucketLabel(keys[0], unit, false, isEn) : ''}</span>
        <p id="pulse-readout" aria-live="polite" className="min-w-0 flex-1 truncate text-center text-fg">
          {readout}
        </p>
        <span>{keys.length ? (unit === 'hour' ? P.now : P.today) : ''}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
      <details className="group min-w-0 flex-1 text-sm">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-1 text-xs font-medium text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          {P.showTable}
        </summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only"><AdminKomutaText k="pulseData" /></caption>
            <thead className="sticky top-0 bg-surface-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{unit === 'hour' ? P.hour : P.day}</th>
                {LAYERS.map((l) => (
                  <th key={l.id} scope="col" className="px-3 py-2 text-right font-medium">{P.layer[l.id]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => (
                <tr key={k} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 font-normal">
                    {bucketLabel(k, unit, true, isEn)}
                    {i === keys.length - 1 ? P.ongoing : ''}
                  </th>
                  <td className="px-3 py-1.5 text-right">{formatInt(series.feedback[i] ?? 0)}</td>
                  <td className="px-3 py-1.5 text-right">{formatInt(series.consumptions[i] ?? 0)}</td>
                  <td className="px-3 py-1.5 text-right">{formatInt(series.newUsers[i] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
        <Button type="button" variant="ghost" size="sm" className="min-h-[44px] gap-1.5" onClick={downloadCsv} disabled={keys.length === 0}>
          <Download className="h-4 w-4" aria-hidden />
          {P.csv}
        </Button>
      </div>
    </div>
  );
}
