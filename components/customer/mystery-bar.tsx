'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { m as Motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * MYSTERY BAR — sade ama merak uyandıran gizemli ilerleme çubuğu.
 *
 * BAĞLAM: Kullanıcı yorum yazdıkça arka planda GİZLİ bir kategori/rozet barı dolar.
 * Kullanıcı HANGİ kategoriyi/rozeti doldurduğunu BİLMEZ — tamamen sürpriz. Sadece bu
 * barı görür. Dolunca (ready) ayrı bir reveal ekranı açılır.
 *
 * TASARIM (tek, temiz): Uzun akışkan enerji çubuğu — içinde karışık renk (mor/fuşya/
 * mavi/camgöbeği) yumuşak akıp parıldar; ucunda tek küçük gizem sembolü "?". Doldukça
 * akış hızlanır ve uç parlar; dolunca (ready) güçlü aura. Rozet adı/görseli ASLA yok.
 */

export interface MysteryBarProps {
  /** Dolgu oranı 0..1. */
  progress: number;
  /** Şu anki sayı (ör. "3/6"deki 3). */
  current: number;
  /** Eşik (ör. "3/6"daki 6). */
  threshold: number;
  /** Eşik dolu mu — dolunca güçlü aura. */
  ready?: boolean;
  className?: string;
}

// Enerjinin karışık renk paleti (akan gradient + parçacık + uç glow).
const PALETTE = {
  violet: '#8b5cf6',
  fuchsia: '#d946ef',
  sky: '#0ea5e9',
  cyan: '#22d3ee',
  white: '#ffffff',
} as const;

/** Hex → rgba (canvas glow'ları için). */
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function MysteryBar({ progress, current, threshold, ready = false, className }: MysteryBarProps) {
  // 0..1 aralığına sıkıştır (savunmacı).
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const slots = Math.max(1, Math.floor(threshold) || 1);
  const filled = Math.max(0, Math.min(slots, Math.floor(current) || 0));

  // reduceMotion — gövdede koşulsuz hesaplanır (hook sırası korunur).
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // Yoğunluk: %70 üstünde uç parlaması artar; %95+ yoğun; ready en üst.
  const intensity = ready ? 1 : Math.max(0, (p - 0.7) / 0.3);

  return (
    <div className={cn('relative w-full select-none', className)}>
      <div className="flex items-center gap-2.5">
        {/* Akışkan enerji çubuğu (canvas) */}
        <div className="relative min-w-0 flex-1">
          <MysteryEnergyBar progress={p} intensity={intensity} ready={ready} reduceMotion={reduceMotion} />
        </div>

        {/* Uçta tek gizem sembolü — "?" (dolunca parlar). */}
        <MysterySymbol intensity={intensity} ready={ready} reduceMotion={reduceMotion} />
      </div>

      {/* Sayaç — gizli, sadece "3/6" (rozet adı YOK). */}
      <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-muted-foreground/70">
        {filled}/{slots}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Uçtaki tek gizem sembolü — "?" içinde parlayan küçük yuvarlak.
// ─────────────────────────────────────────────────────────────────────────
function MysterySymbol({ intensity, ready, reduceMotion }: { intensity: number; ready: boolean; reduceMotion: boolean }) {
  const glow = ready ? 0.8 : 0.3 + intensity * 0.5;
  return (
    <Motion.div
      className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold"
      style={{
        borderColor: rgba(PALETTE.fuchsia, 0.45 + intensity * 0.3),
        background: `radial-gradient(circle at 35% 30%, ${rgba(PALETTE.white, 0.5)}, ${rgba(PALETTE.violet, 0.4)} 60%, ${rgba(PALETTE.fuchsia, 0.28)})`,
        boxShadow: `0 0 ${8 + intensity * 12}px ${rgba(PALETTE.fuchsia, glow)}`,
        color: '#fff',
      }}
      animate={
        reduceMotion
          ? undefined
          : ready
            ? { scale: [1, 1.15, 1] }
            : intensity > 0
              ? { scale: [1, 1.06, 1] }
              : { scale: 1 }
      }
      transition={
        ready
          ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
          : intensity > 0
            ? { duration: 1.4 - intensity * 0.4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.3 }
      }
    >
      <span className="drop-shadow-[0_0_3px_rgba(255,255,255,0.7)]">?</span>
    </Motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Akışkan sihirli enerji çubuğu — canvas: akan gradient + glow uç + spark
// ─────────────────────────────────────────────────────────────────────────
function MysteryEnergyBar({
  progress,
  intensity,
  ready,
  reduceMotion,
}: {
  progress: number;
  intensity: number;
  ready: boolean;
  reduceMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Canlı değerler ANIMASYON içinde ref'ten okunur (render'da ref yazma YOK —
  // react-hooks/refs kuralı; değerler effect'te senkronlanır).
  const progRef = useRef(progress);
  const intenRef = useRef(intensity);
  const readyRef = useRef(ready);
  useEffect(() => {
    progRef.current = progress;
    intenRef.current = intensity;
    readyRef.current = ready;
  }, [progress, intensity, ready]);

  // Yukarı süzülen spark parçacıkları — bir kez üretilir (render'da RNG yok).
  const sparks = useMemo(
    () =>
      Array.from({ length: reduceMotion ? 0 : 14 }, (_, i) => ({
        seed: i * 12.9898,
        x: (i * 0.61803398875) % 1, // altın oran ile düzgün serpiştirme
        speed: 0.5 + (i % 4) * 0.22,
        size: 0.8 + (i % 3) * 0.5,
        drift: (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.1),
      })),
    [reduceMotion],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = wrap.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener('resize', resize);

    let raf = 0;
    let t = 0;
    const cols = [PALETTE.violet, PALETTE.sky, PALETTE.cyan, PALETTE.fuchsia, PALETTE.violet];

    const draw = () => {
      const prog = progRef.current;
      const inten = intenRef.current;
      const rdy = readyRef.current;

      // Akış hızı doldukça ARTAR (enerji birikiyor hissi). reduceMotion'da durur.
      const flowSpeed = reduceMotion ? 0 : 0.6 + inten * 2.4 + (rdy ? 1.0 : 0);
      t += 0.016 * flowSpeed;

      ctx.clearRect(0, 0, W, H);

      const radius = H / 2;
      const fillW = Math.max(prog > 0 ? radius * 2 : 0, prog * W);

      // Boş kanal (track).
      roundRect(ctx, 0, 0, W, H, radius);
      ctx.fillStyle = 'rgba(120,120,140,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (fillW > 0.5) {
        ctx.save();
        roundRect(ctx, 0, 0, Math.min(fillW, W), H, radius);
        ctx.clip();

        // Akan çok-renkli gradient (soldan sağa kayar).
        const span = Math.max(W, 220);
        const shift = ((t * 60) % span) - span;
        const grad = ctx.createLinearGradient(shift, 0, shift + span * 1.4, 0);
        const n = cols.length;
        for (let i = 0; i < n; i++) grad.addColorStop(i / (n - 1), rgba(cols[i], rdy ? 1 : 0.92));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Cam hacim (dikey ışık).
        const vol = ctx.createLinearGradient(0, 0, 0, H);
        vol.addColorStop(0, rgba(PALETTE.white, 0.35));
        vol.addColorStop(0.5, rgba(PALETTE.white, 0));
        vol.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = vol;
        ctx.fillRect(0, 0, W, H);

        // Kayan parlak bantlar.
        if (!reduceMotion) {
          for (let b = 0; b < 3; b++) {
            const bx = (((t * 40) + b * (W / 3)) % (W + 80)) - 40;
            const bw = 26;
            const bg = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
            bg.addColorStop(0, rgba(PALETTE.white, 0));
            bg.addColorStop(0.5, rgba(PALETTE.white, 0.2 + inten * 0.18));
            bg.addColorStop(1, rgba(PALETTE.white, 0));
            ctx.fillStyle = bg;
            ctx.fillRect(bx - bw, 0, bw * 2, H);
          }
        }

        // Yukarı süzülen spark parçacıkları (dolgu içinde).
        for (const s of sparks) {
          const life = (t * s.speed * 0.5 + s.x) % 1;
          const px = s.x * fillW + Math.sin(t * 2 + s.seed) * (H * 0.3) * s.drift;
          const py = H - life * H;
          if (px < 0 || px > fillW) continue;
          const alpha = Math.sin(life * Math.PI) * (0.3 + inten * 0.5);
          ctx.beginPath();
          ctx.arc(px, py, s.size * (0.7 + inten * 0.5), 0, Math.PI * 2);
          ctx.fillStyle = rgba(PALETTE.white, Math.max(0, alpha));
          ctx.fill();
        }

        ctx.restore();

        // Dolgu ucu GLOW.
        const tipX = Math.min(fillW, W);
        const pulse = reduceMotion ? 1 : 1 + Math.sin(t * (rdy ? 6 : 3)) * (0.15 + inten * 0.35);
        const glowR = radius * (1.8 + inten * 1.6) * pulse;
        const tip = ctx.createRadialGradient(tipX, H / 2, 0, tipX, H / 2, glowR);
        tip.addColorStop(0, rgba(PALETTE.white, rdy ? 0.95 : 0.7));
        tip.addColorStop(0.4, rgba(PALETTE.fuchsia, 0.55 + inten * 0.3));
        tip.addColorStop(1, rgba(PALETTE.fuchsia, 0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = tip;
        ctx.beginPath();
        ctx.arc(tipX, H / 2, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        // Uç dikey parlak çizgi.
        ctx.strokeStyle = rgba(PALETTE.white, rdy ? 0.9 : 0.55 + inten * 0.3);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tipX, 1);
        ctx.lineTo(tipX, H - 1);
        ctx.stroke();
      }

      // READY: tüm çubuk boyunca güçlü aura pulse.
      if (rdy && !reduceMotion) {
        const auraPulse = 0.5 + Math.sin(t * 5) * 0.5;
        roundRect(ctx, 0, 0, W, H, radius);
        ctx.strokeStyle = rgba(PALETTE.fuchsia, 0.35 + auraPulse * 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [sparks, reduceMotion]);

  return (
    <div
      ref={wrapRef}
      className="relative h-3.5 w-full overflow-hidden rounded-full"
      style={{
        boxShadow: ready
          ? `0 0 18px ${rgba(PALETTE.fuchsia, 0.45)}`
          : intensity > 0
            ? `0 0 ${8 + intensity * 10}px ${rgba(PALETTE.violet, 0.25 + intensity * 0.2)}`
            : 'none',
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}

// ── Yardımcı: yuvarlak köşeli dikdörtgen yolu ──
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
