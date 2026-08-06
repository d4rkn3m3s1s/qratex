'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MYSTERY BAR — göz alıcı, merak uyandıran "gizemli ilerleme barı".
 *
 * BAĞLAM: Kullanıcı yorum yazdıkça arka planda GİZLİ bir kategori/rozet barı dolar.
 * Kullanıcı HANGİ kategoriyi doldurduğunu BİLMEZ — tamamen sürpriz. Sadece bu barı görür.
 * Dolunca (ready) ayrı bir reveal ekranı açılır (o başka bileşen).
 *
 * ÜÇ TASARIM TEK BARDA:
 *  1) Akışkan sihirli enerji çubuğu — canvas ile animasyonlu karışık renk (mor/fuşya/mavi/
 *     camgöbeği) akıp parıldar; dolgu ucu glow'lar; doldukça akış HIZLANIR + spark parçacıkları.
 *  2) Rozet yuvaları — çubuğun üstünde threshold kadar küçük yuva; dolanlar PARLAR (✨),
 *     dolmayanlar soluk kilitli (❓). İçerik GİZLİ. Bir sonraki yuva "yakın" ise titrer.
 *  3) Kader küresi — barın SAĞ ucunda mini parlayan küre (canvas); bar doldukça daha çok
 *     parlar/enerji toplar; ready olunca patlamaya hazır gibi yoğun titrer + pulse.
 *
 * Rozet ADI/görseli ASLA gösterilmez (sürpriz korunur). reduceMotion'da animasyonlar sadeleşir.
 */

export interface MysteryBarProps {
  /** Dolgu oranı 0..1. */
  progress: number;
  /** Şu anki sayı (ör. "3/6"deki 3). */
  current: number;
  /** Eşik (ör. "3/6"daki 6). */
  threshold: number;
  /** Eşik dolu mu — dolunca güçlü aura + patlamaya hazır küre. */
  ready?: boolean;
  className?: string;
}

// Enerjinin karışık renk paleti (akan gradient + parçacık + yuva ışıltısı).
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
  const slots = Math.max(1, Math.min(24, Math.floor(threshold) || 1));
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

  // Yoğunluk: %70 üstünde titreşim/parlama artmaya başlar; %95+ yoğun; ready en üst.
  // 0..1 skala (0.7 → 0, 1.0 → 1); ready iken 1'e sabitlenir.
  const intensity = ready ? 1 : Math.max(0, (p - 0.7) / 0.3);
  const nearReady = intensity > 0; // uç sembolleri titremeye başladığı eşik

  return (
    <div className={cn('relative w-full select-none', className)}>
      {/* ── 1) ROZET YUVALARI — çubuğun üstünde koleksiyon şeridi (gizli içerik) ── */}
      <div className="mb-2 flex items-center gap-1.5">
        {Array.from({ length: slots }).map((_, i) => {
          const isFilled = i < filled;
          // Bir sonraki dolacak yuva (ilk boş yuva) ve bar %70+ ise "yakın" → titrer.
          const isNext = i === filled && !ready;
          const trembles = isNext && nearReady;
          return (
            <MysterySlot
              key={i}
              filled={isFilled}
              trembles={trembles}
              intensity={intensity}
              ready={ready}
              reduceMotion={reduceMotion}
            />
          );
        })}
      </div>

      {/* ── Çubuk + kader küresi hizada (küre sağ uçta) ── */}
      <div className="flex items-center gap-2.5">
        {/* 2) AKIŞKAN SİHİRLİ ENERJİ ÇUBUĞU (canvas) */}
        <div className="relative min-w-0 flex-1">
          <MysteryEnergyBar
            progress={p}
            intensity={intensity}
            ready={ready}
            reduceMotion={reduceMotion}
          />
        </div>

        {/* 3) KADER KÜRESİ — bar doldukça şarj olur, ready'de patlamaya hazır */}
        <MysteryOrb
          progress={p}
          intensity={intensity}
          ready={ready}
          reduceMotion={reduceMotion}
        />
      </div>

      {/* Sayaç — gizli, sadece "3/6" gibi ilerleme (rozet adı YOK) */}
      <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-muted-foreground/70">
        {filled}/{slots}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 2) ROZET YUVASI — küçük yuvarlak kart; dolu=parlar(✨), boş=soluk kilitli(❓)
// ─────────────────────────────────────────────────────────────────────────
function MysterySlot({
  filled,
  trembles,
  intensity,
  ready,
  reduceMotion,
}: {
  filled: boolean;
  trembles: boolean;
  intensity: number;
  ready: boolean;
  reduceMotion: boolean;
}) {
  // Titreme yalnızca "yakın" ve motion açıkken; yoğunlukla artar.
  const shake = trembles && !reduceMotion;
  const shakeAmp = 0.8 + intensity * 1.6; // px

  return (
    <motion.div
      className="relative grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[10px]"
      style={
        filled
          ? {
              // Dolu yuva: mor/fuşya ışıltı, cam görünüm.
              borderColor: rgba(PALETTE.fuchsia, 0.55),
              background: `radial-gradient(circle at 35% 30%, ${rgba(PALETTE.white, 0.85)}, ${rgba(PALETTE.violet, 0.55)} 55%, ${rgba(PALETTE.fuchsia, 0.35)})`,
              boxShadow: `0 0 10px ${rgba(PALETTE.fuchsia, ready ? 0.75 : 0.5)}, inset 0 1px 2px ${rgba(PALETTE.white, 0.5)}`,
            }
          : {
              // Boş yuva: soluk kilitli.
              borderColor: 'hsl(var(--border))',
              background: 'hsl(var(--muted))',
            }
      }
      animate={
        reduceMotion
          ? undefined
          : shake
            ? {
                // "Yakın" yuva: hafif titreşim + parlama nabzı.
                x: [0, -shakeAmp, shakeAmp, -shakeAmp * 0.7, 0],
                scale: [1, 1.08, 1],
              }
            : filled
              ? { scale: [1, 1.04, 1] } // dolu yuva hafifçe "nefes alır"
              : undefined
      }
      transition={
        shake
          ? { duration: 0.5 - intensity * 0.22, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
      }
    >
      {filled ? (
        <Sparkles className="h-3 w-3 text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]" />
      ) : trembles ? (
        // Bir sonraki dolacak yuva: merak uyandıran "?" (dolmaya yakın).
        <span className="font-bold text-muted-foreground">?</span>
      ) : (
        <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />
      )}

      {/* Dolu yuvanın üstünde küçük parıltı noktası (koleksiyon hissi) */}
      {filled && !reduceMotion && (
        <motion.span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-white"
          style={{ boxShadow: `0 0 6px ${rgba(PALETTE.fuchsia, 0.9)}` }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 1) AKIŞKAN SİHİRLİ ENERJİ ÇUBUĞU — canvas: akan gradient + glow uç + spark
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
      Array.from({ length: reduceMotion ? 0 : 16 }, (_, i) => ({
        seed: i * 12.9898,
        x: (i * 0.61803398875) % 1, // altın oran ile dağıt → düzgün serpiştirme
        speed: 0.5 + (i % 4) * 0.22,
        size: 0.8 + (i % 3) * 0.6,
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

    // Genişlik responsive — parent değişimini izle.
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener('resize', resize);

    let raf = 0;
    let t = 0;

    // Renk şeridi (akan gradient için tekrar eden döngü).
    const cols = [PALETTE.violet, PALETTE.sky, PALETTE.cyan, PALETTE.fuchsia, PALETTE.violet];

    const draw = () => {
      const prog = progRef.current;
      const inten = intenRef.current;
      const rdy = readyRef.current;

      // Akış hızı doldukça ARTAR (enerji birikiyor hissi). reduceMotion'da durur.
      const flowSpeed = reduceMotion ? 0 : 0.6 + inten * 2.6 + (rdy ? 1.2 : 0);
      t += 0.016 * flowSpeed;

      ctx.clearRect(0, 0, W, H);

      const radius = H / 2;
      const fillW = Math.max(prog > 0 ? radius * 2 : 0, prog * W);

      // ── Boş kanal (track) ──
      roundRect(ctx, 0, 0, W, H, radius);
      ctx.fillStyle = 'rgba(120,120,140,0.14)';
      ctx.fill();
      // İnce iç kenar
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (fillW > 0.5) {
        ctx.save();
        // Dolgu bölgesini yuvarlak köşeyle kırp.
        roundRect(ctx, 0, 0, Math.min(fillW, W), H, radius);
        ctx.clip();

        // ── Akan çok-renkli gradient (soldan sağa kayar) ──
        // Faz kaydırmak için gradient'i geniş çizip t ile ötele.
        const span = Math.max(W, 220);
        const shift = ((t * 60) % span) - span; // sürekli sola akış
        const grad = ctx.createLinearGradient(shift, 0, shift + span * 1.4, 0);
        const n = cols.length;
        for (let i = 0; i < n; i++) {
          grad.addColorStop(i / (n - 1), rgba(cols[i], rdy ? 1 : 0.92));
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Üstten alta hafif dikey ışık (cam hacim hissi).
        const vol = ctx.createLinearGradient(0, 0, 0, H);
        vol.addColorStop(0, rgba(PALETTE.white, 0.35));
        vol.addColorStop(0.5, rgba(PALETTE.white, 0));
        vol.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.fillStyle = vol;
        ctx.fillRect(0, 0, W, H);

        // ── Dalga parıltısı — üstünde kayan parlak bantlar ──
        if (!reduceMotion) {
          const bandCount = 3;
          for (let b = 0; b < bandCount; b++) {
            const bx = (((t * 40) + b * (W / bandCount)) % (W + 80)) - 40;
            const bw = 26;
            const bg = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
            bg.addColorStop(0, rgba(PALETTE.white, 0));
            bg.addColorStop(0.5, rgba(PALETTE.white, 0.22 + inten * 0.18));
            bg.addColorStop(1, rgba(PALETTE.white, 0));
            ctx.fillStyle = bg;
            ctx.fillRect(bx - bw, 0, bw * 2, H);
          }
        }

        // ── Yukarı süzülen spark parçacıkları (dolgu içinde) ──
        // Yoğunluk arttıkça daha görünür/hızlı → "enerji birikiyor".
        for (const s of sparks) {
          const life = (t * s.speed * 0.5 + s.x) % 1; // 0..1 döngü
          const px = s.x * fillW + Math.sin(t * 2 + s.seed) * (H * 0.3) * s.drift;
          const py = H - life * H; // alttan üste süzülür
          if (px < 0 || px > fillW) continue;
          const alpha = Math.sin(life * Math.PI) * (0.35 + inten * 0.5); // uçlarda soluk
          ctx.beginPath();
          ctx.arc(px, py, s.size * (0.7 + inten * 0.5), 0, Math.PI * 2);
          ctx.fillStyle = rgba(PALETTE.white, Math.max(0, alpha));
          ctx.fill();
        }

        ctx.restore();

        // ── Dolgu ucu GLOW — yumuşak parlayan uç ──
        const tipX = Math.min(fillW, W);
        // Nabız: yoğunluk ve ready ile büyür/titrer.
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

        // Uç dikey parlak çizgi (kesici enerji hattı).
        ctx.strokeStyle = rgba(PALETTE.white, rdy ? 0.9 : 0.55 + inten * 0.3);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tipX, 1);
        ctx.lineTo(tipX, H - 1);
        ctx.stroke();
      }

      // ── READY: tüm çubuk boyunca güçlü aura pulse ──
      if (rdy && !reduceMotion) {
        const auraPulse = 0.5 + Math.sin(t * 5) * 0.5;
        roundRect(ctx, 0, 0, W, H, radius);
        ctx.strokeStyle = rgba(PALETTE.fuchsia, 0.35 + auraPulse * 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (!reduceMotion) {
        raf = requestAnimationFrame(draw);
      }
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
      className="relative h-3 w-full overflow-hidden rounded-full"
      // Dış yumuşak halo (ready'de belirginleşir) — CSS ile ucuz.
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

// ─────────────────────────────────────────────────────────────────────────
// 3) KADER KÜRESİ — mini parlayan küre (canvas); doldukça şarj, ready'de patlar
// ─────────────────────────────────────────────────────────────────────────
function MysteryOrb({
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

  const progRef = useRef(progress);
  const intenRef = useRef(intensity);
  const readyRef = useRef(ready);
  useEffect(() => {
    progRef.current = progress;
    intenRef.current = intensity;
    readyRef.current = ready;
  }, [progress, intensity, ready]);

  // Küre içindeki dönen enerji kıvılcımları (bir kez).
  const motes = useMemo(
    () =>
      Array.from({ length: reduceMotion ? 4 : 9 }, (_, i) => ({
        a: (i / 9) * Math.PI * 2,
        r: 0.3 + (i % 3) * 0.22,
        speed: 0.5 + (i % 4) * 0.4,
        size: 0.7 + (i % 2) * 0.6,
      })),
    [reduceMotion],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sabit kare kutu — küre için (CSS 28px).
    const SIZE = 28;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(SIZE * dpr);
      canvas.height = Math.round(SIZE * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let t = 0;

    const draw = () => {
      const prog = progRef.current;
      const inten = intenRef.current;
      const rdy = readyRef.current;

      t += reduceMotion ? 0 : 0.02 * (1 + inten * 1.5 + (rdy ? 1 : 0));
      ctx.clearRect(0, 0, SIZE, SIZE);

      const cx = SIZE / 2;
      const cy = SIZE / 2;
      // Titreme: yoğunluk arttıkça küre sarsılır; ready'de en yoğun.
      const shakeAmp = reduceMotion ? 0 : inten * (rdy ? 1.6 : 1.1);
      const sx = cx + Math.sin(t * 22) * shakeAmp;
      const sy = cy + Math.cos(t * 19) * shakeAmp;

      // Şarj: parlaklık progress + intensity ile büyür.
      const charge = 0.35 + prog * 0.4 + inten * 0.25;
      const R = 8.5;

      // Dış aura (ready'de nabızlı patlama enerjisi).
      const auraPulse = reduceMotion ? 1 : 1 + Math.sin(t * (rdy ? 7 : 3)) * (0.15 + inten * 0.4);
      const auraR = R * (1.6 + inten * 0.9) * auraPulse;
      const aura = ctx.createRadialGradient(sx, sy, R * 0.3, sx, sy, auraR);
      aura.addColorStop(0, rgba(PALETTE.fuchsia, (rdy ? 0.55 : 0.3) * charge + 0.15));
      aura.addColorStop(1, rgba(PALETTE.fuchsia, 0));
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Küre gövdesi — cam küre, içi enerjiyle dolu.
      const body = ctx.createRadialGradient(sx - R * 0.35, sy - R * 0.4, R * 0.1, sx, sy, R);
      body.addColorStop(0, rgba(PALETTE.white, 0.95));
      body.addColorStop(0.45, rgba(PALETTE.violet, 0.55 + charge * 0.35));
      body.addColorStop(1, rgba(PALETTE.sky, 0.2 + prog * 0.35));
      ctx.beginPath();
      ctx.arc(sx, sy, R, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();

      // İçeride dönen enerji kıvılcımları (küre içine kırp).
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, R * 0.94, 0, Math.PI * 2);
      ctx.clip();
      for (const m of motes) {
        const ang = m.a + t * m.speed;
        const mr = R * m.r * (0.9 + Math.sin(t + m.a) * 0.1);
        const mx = sx + Math.cos(ang) * mr;
        const my = sy + Math.sin(ang) * mr;
        ctx.beginPath();
        ctx.arc(mx, my, m.size * (0.8 + inten * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = rgba(PALETTE.white, 0.5 + charge * 0.4);
        ctx.fill();
      }
      ctx.restore();

      // Cam highlight.
      ctx.beginPath();
      ctx.ellipse(sx - R * 0.35, sy - R * 0.42, R * 0.28, R * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(PALETTE.white, 0.6);
      ctx.fill();

      // Kenar ışık halkası (ready'de belirginleşir).
      ctx.beginPath();
      ctx.arc(sx, sy, R, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(PALETTE.white, rdy ? 0.7 : 0.3 + inten * 0.3);
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!reduceMotion) {
        raf = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [motes, reduceMotion]);

  return (
    <motion.div
      className="relative h-7 w-7 shrink-0"
      // Ready'de tüm küre kabı da hafifçe nabız atar (framer — canvas titreşimine ek).
      animate={reduceMotion ? undefined : ready ? { scale: [1, 1.12, 1] } : { scale: 1 }}
      transition={ready ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </motion.div>
  );
}

// ── Yardımcı: yuvarlak köşeli dikdörtgen yolu (canvas roundRect fallback'siz) ──
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
