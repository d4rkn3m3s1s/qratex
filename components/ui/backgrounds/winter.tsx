'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * Kış teması — sinematik, "efsanevi" seviye animasyonlu arka plan.
 * Açık ve koyu modlar KESKİN ayrışır:
 *  • Açık mod (kış gündüzü): soğuk açık mavi-beyaz gökyüzü + yumuşak güneş + bol kar.
 *  • Koyu mod (kış gecesi): derin lacivert-mor gökyüzü + parlak ay + yıldızlar + aurora + parlak kar.
 * Katmanlar: atmosfer gradyanı, yıldızlar, aurora (yeşil-mavi perde), gökcismi (ay/güneş glow+disk),
 *   arka çam ağacı silüetleri, çok katmanlı düşen kar (3 derinlik parallax + rüzgar salınımı),
 *   kar örtüsü (dalgalı parlayan zemin), kardan adam, buğulanan kahve fincanı (yükselen buhar),
 *   buz kristali parıltıları (twinkle), bloom ışık yıkaması, sinematik vinyet.
 * Palet: #0F172A koyu lacivert, #F8FAFC kar beyazı, #10B981 zümrüt yeşili (çam/aksan), #38BDF8 buz mavisi.
 * prefers-reduced-motion'a saygılı; DPR-ölçekli (retina keskinliği).
 */
interface WinterBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function WinterBackground({ children, className }: WinterBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Retina keskinliği için DPR ölçekleme.
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Moda göre KESKİN palet ────────────────────────────────────
    const P = isDark
      ? {
          // Gece: derin lacivert-mor kış gökyüzü
          sky: [
            { at: 0, c: '#080c1c' }, { at: 0.32, c: '#0F172A' }, { at: 0.58, c: '#1b1f45' },
            { at: 0.8, c: '#141a33' }, { at: 1, c: '#0a0f22' },
          ],
          orbCore: '#ffffff', orbMid: '#dfe8fb', orbEdge: '#a9bbe4',
          orbGlowA: 0.5, orbGlow: 'rgba(180,205,255,0.85)', orbShadow: 'rgba(200,220,255,0.85)',
          snowColor: '255,255,255', snowAlpha: 0.95,
          groundTop: '#233156', groundMid: '#16203c', groundBot: '#0c1226', groundGlow: 'rgba(120,160,230,0.22)',
          pine: '#0b5c3f', pineHi: '#10B981', pineAlpha: 0.9,
          snowmanBody: '#e9f0fb', snowmanShade: '#b9c8e6', snowmanLine: 'rgba(20,30,55,0.8)',
          scarf: '#10B981', carrot: '#f97316', coal: '#0b1020',
          crystalHue: 200, crystalL: 82, stars: true, aurora: true,
          reflA: 0.16, reflHue: 215, reflL: 88,
          bloom: 'rgba(80,140,220,0.06)', vignette: 0.55,
        }
      : {
          // Gündüz: soğuk açık mavi-beyaz kış gökyüzü
          sky: [
            { at: 0, c: '#8ec5e8' }, { at: 0.3, c: '#aed6ef' }, { at: 0.55, c: '#d3e9f6' },
            { at: 0.78, c: '#eef6fc' }, { at: 1, c: '#F8FAFC' },
          ],
          orbCore: '#ffffff', orbMid: '#fdf7e3', orbEdge: '#ffe9a8',
          orbGlowA: 0.6, orbGlow: 'rgba(255,246,210,0.9)', orbShadow: 'rgba(255,244,200,0.85)',
          snowColor: '255,255,255', snowAlpha: 0.92,
          groundTop: '#ffffff', groundMid: '#eaf3fb', groundBot: '#d7e8f5', groundGlow: 'rgba(255,255,255,0.6)',
          pine: '#0f7a55', pineHi: '#10B981', pineAlpha: 0.85,
          snowmanBody: '#ffffff', snowmanShade: '#cfe0ef', snowmanLine: 'rgba(60,90,130,0.55)',
          scarf: '#38BDF8', carrot: '#f97316', coal: '#1e293b',
          crystalHue: 198, crystalL: 88, stars: false, aurora: false,
          reflA: 0.2, reflHue: 48, reflL: 80,
          bloom: 'rgba(255,255,255,0.06)', vignette: 0.24,
        };

    // Gökcismi konumu (ay/güneş) — üst-sağ.
    const orbPos = () => ({ x: W * 0.76, y: H * (isDark ? 0.22 : 0.2) });

    // ── Kar taneleri: 3 derinlik katmanı (parallax) ────────────────
    interface Flake { x: number; y: number; r: number; speed: number; drift: number; phase: number; phaseSpeed: number; depth: number; }
    const makeFlakes = (count: number, depth: number): Flake[] =>
      Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: (0.6 + depth * 2.6) * (0.7 + Math.random() * 0.6),
        speed: (0.35 + depth * 1.5) * (0.7 + Math.random() * 0.6),
        drift: (0.3 + depth * 0.8) * (0.6 + Math.random() * 0.8),
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.008 + Math.random() * 0.02,
        depth,
      }));
    // ~120 tane, 3 katman: uzak-küçük-yavaş → yakın-büyük-hızlı
    const flakes: Flake[] = [
      ...makeFlakes(55, 0.25),
      ...makeFlakes(40, 0.6),
      ...makeFlakes(28, 1.0),
    ];

    // ── Yıldızlar (yalnız gece) ────────────────────────────────────
    const stars = P.stars
      ? Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.55, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, twSpeed: 0.02 + Math.random() * 0.04 }))
      : [];

    // ── Kuyruklu yıldız (comet) — gece, ara sıra geçen, uzun ışıltılı kuyruk ──
    const comet = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, timer: 120 + Math.random() * 260 };

    // ── Buz kristali parıltıları (twinkle, tüm sahne) ──────────────
    interface Crystal { x: number; y: number; r: number; tw: number; twSpeed: number; }
    const crystals: Crystal[] = Array.from({ length: 34 }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.85, r: 1 + Math.random() * 2.2,
      tw: Math.random() * Math.PI * 2, twSpeed: 0.02 + Math.random() * 0.05,
    }));

    // ── Arka çam ağaçları (uzaklık/boyut farkı → derinlik) ─────────
    interface Pine { x: number; base: number; h: number; w: number; sway: number; }
    const pines: Pine[] = Array.from({ length: 7 }, (_, i) => ({
      x: (i / 6) * W * 1.05 - W * 0.02 + (Math.random() - 0.5) * 40,
      base: H * (0.76 + Math.random() * 0.04),
      h: 90 + Math.random() * 130,
      w: 44 + Math.random() * 40,
      sway: Math.random() * Math.PI * 2,
    }));

    let animationId = 0;
    let t = 0;

    // Bir çam ağacı çiz (katmanlı üçgen dallar + kar tepesi).
    const drawPine = (px: number, base: number, h: number, w: number, sway: number) => {
      const s = Math.sin(t * 0.01 + sway) * (reduceMotion ? 0 : 2);
      const tiers = 4;
      // gövde
      ctx.fillStyle = isDark ? 'rgba(30,22,14,0.85)' : 'rgba(90,64,40,0.6)';
      ctx.fillRect(px - w * 0.06, base, w * 0.12, h * 0.14);
      // katmanlı dallar (yukarı doğru daralan üçgenler)
      for (let i = 0; i < tiers; i++) {
        const ty = base - (h * 0.14) - (h * 0.82) * (i / tiers);
        const tw = w * (1 - i * 0.19);
        const th = (h * 0.82) / tiers * 1.5;
        ctx.beginPath();
        ctx.moveTo(px + s * (i + 1) * 0.3, ty - th);
        ctx.lineTo(px - tw / 2, ty);
        ctx.lineTo(px + tw / 2, ty);
        ctx.closePath();
        const g = ctx.createLinearGradient(px - tw / 2, ty - th, px + tw / 2, ty);
        g.addColorStop(0, P.pineHi);
        g.addColorStop(0.5, P.pine);
        g.addColorStop(1, isDark ? '#083a28' : '#0b5c40');
        ctx.globalAlpha = P.pineAlpha;
        ctx.fillStyle = g;
        ctx.fill();
        ctx.globalAlpha = 1;
        // dal üstünde kar birikintisi
        ctx.beginPath();
        ctx.moveTo(px + s * (i + 1) * 0.3, ty - th);
        ctx.quadraticCurveTo(px - tw * 0.2, ty - th * 0.4, px - tw * 0.28, ty - th * 0.05);
        ctx.quadraticCurveTo(px, ty - th * 0.28, px + tw * 0.28, ty - th * 0.05);
        ctx.quadraticCurveTo(px + tw * 0.2, ty - th * 0.4, px + s * (i + 1) * 0.3, ty - th);
        ctx.closePath();
        ctx.fillStyle = `rgba(${P.snowColor},${isDark ? 0.55 : 0.85})`;
        ctx.fill();
      }
    };

    // Kardan adam çiz — gerçekçi + canlı: nefes bob, göz kırpma, rüzgarda atkı,
    // sallanan dal kollar, kar dokusu, silindir şapka.
    const drawSnowman = (cx0: number, groundY: number, scale: number) => {
      // Idle "nefes" — hafif yukarı-aşağı + minik eğilme (rüzgar).
      const bob = reduceMotion ? 0 : Math.sin(t * 0.03) * 1.6 * scale;
      const lean = reduceMotion ? 0 : Math.sin(t * 0.012) * 0.02;
      const wind = reduceMotion ? 0 : (0.6 + Math.sin(t * 0.02) * 0.4); // rüzgar şiddeti 0.2..1
      const cx = cx0;
      const r1 = 36 * scale, r2 = 26 * scale, r3 = 19 * scale;
      const y1 = groundY - r1;
      const y2 = y1 - r1 - r2 + 6 * scale + bob;
      const y3 = y2 - r2 - r3 + 5 * scale + bob * 0.5;

      ctx.save();
      // Bütün kardan adamı hafif eğ (rüzgar)
      ctx.translate(cx, groundY); ctx.rotate(lean); ctx.translate(-cx, -groundY);

      const balls = [{ x: cx, y: y1, r: r1 }, { x: cx, y: y2, r: r2 }, { x: cx, y: y3, r: r3 }];

      // Gölge (yumuşak)
      ctx.beginPath();
      ctx.ellipse(cx, groundY + 4 * scale, r1 * 1.25, r1 * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(8,12,26,0.42)' : 'rgba(90,120,160,0.2)';
      ctx.fill();

      // Gövde topları — küresel gölge + üstte parlak "kar" highlight + kenar dokusu
      balls.forEach((b) => {
        const g = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.05, b.x, b.y, b.r * 1.05);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.55, P.snowmanBody);
        g.addColorStop(1, P.snowmanShade);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.shadowColor = isDark ? 'rgba(150,180,240,0.45)' : 'rgba(255,255,255,0.7)';
        ctx.shadowBlur = 14 * scale; ctx.fill(); ctx.shadowBlur = 0;
        // alt taraf koyu kontur (hacim)
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = P.snowmanLine; ctx.lineWidth = 1.2; ctx.stroke();
        // üstte kar birikintisi highlight
        ctx.beginPath(); ctx.ellipse(b.x - b.r * 0.15, b.y - b.r * 0.6, b.r * 0.5, b.r * 0.22, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
      });

      // Dal kollar — çok eklemli, rüzgarda sallanan
      ctx.strokeStyle = isDark ? '#3a2a18' : '#5a3d22'; ctx.lineWidth = 2.6 * scale; ctx.lineCap = 'round';
      const armWave = Math.sin(t * 0.045) * (reduceMotion ? 0 : 4) * wind;
      [-1, 1].forEach((dir) => {
        const ax = cx + dir * r2 * 0.82, ay = y2 - r2 * 0.12;
        const ex = ax + dir * 30 * scale, ey = ay - 18 * scale + armWave * dir;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(ax + dir * 15 * scale, ay - 6 * scale, ex, ey);
        // parmak dalları
        ctx.moveTo(ex, ey); ctx.lineTo(ex + dir * 9 * scale, ey - 9 * scale + armWave * dir * 0.5);
        ctx.moveTo(ex, ey); ctx.lineTo(ex + dir * 11 * scale, ey + 3 * scale);
        ctx.stroke();
      });
      ctx.lineCap = 'butt';

      // Atkı — boyun sargısı + rüzgarda DALGALANAN uç
      ctx.beginPath();
      ctx.moveTo(cx - r3 * 0.95, y3 + r3 * 0.7);
      ctx.quadraticCurveTo(cx, y3 + r3 * 1.08, cx + r3 * 0.95, y3 + r3 * 0.7);
      ctx.lineTo(cx + r3 * 0.95, y3 + r3 * 1.02);
      ctx.quadraticCurveTo(cx, y3 + r3 * 1.4, cx - r3 * 0.95, y3 + r3 * 1.02);
      ctx.closePath();
      ctx.fillStyle = P.scarf; ctx.fill();
      // sarkan uç — rüzgarla dalgalanır
      const sw1 = Math.sin(t * 0.05) * 6 * scale * wind;
      const sw2 = Math.sin(t * 0.05 + 1) * 9 * scale * wind;
      ctx.beginPath();
      ctx.moveTo(cx + r3 * 0.5, y3 + r3 * 0.98);
      ctx.quadraticCurveTo(cx + r3 * 0.9 + sw1, y3 + r3 * 1.6, cx + r3 * 0.75 + sw2, y3 + r3 * 2.3);
      ctx.lineTo(cx + r3 * 0.3 + sw2, y3 + r3 * 2.25);
      ctx.quadraticCurveTo(cx + r3 * 0.4 + sw1, y3 + r3 * 1.55, cx + r3 * 0.2, y3 + r3 * 0.95);
      ctx.closePath();
      ctx.fillStyle = P.scarf; ctx.fill();
      // atkı püskülleri
      ctx.strokeStyle = P.scarf; ctx.lineWidth = 1.5 * scale;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + r3 * (0.35 + i * 0.08) + sw2, y3 + r3 * 2.25); ctx.lineTo(cx + r3 * (0.35 + i * 0.08) + sw2 * 1.2, y3 + r3 * 2.55); ctx.stroke(); }

      // Silindir şapka (gerçekçilik)
      const hatW = r3 * 1.5, hatH = r3 * 1.3, hy = y3 - r3 * 0.92;
      ctx.fillStyle = isDark ? '#12182b' : '#1e293b';
      ctx.beginPath(); ctx.ellipse(cx, hy, hatW * 0.75, hatW * 0.18, 0, 0, Math.PI * 2); ctx.fill(); // kenar
      ctx.fillRect(cx - hatW * 0.42, hy - hatH, hatW * 0.84, hatH); // silindir
      ctx.beginPath(); ctx.ellipse(cx, hy - hatH, hatW * 0.42, hatW * 0.1, 0, 0, Math.PI * 2); ctx.fill(); // üst
      // şapka bandı (aksan)
      ctx.fillStyle = P.scarf; ctx.fillRect(cx - hatW * 0.42, hy - hatH * 0.32, hatW * 0.84, hatH * 0.16);

      // Gözler (kömür) — periyodik GÖZ KIRPMA
      const blink = !reduceMotion && (Math.sin(t * 0.06) > 0.985); // ara ara kırp
      ctx.fillStyle = P.coal;
      [-1, 1].forEach((dir) => {
        const ex = cx + dir * r3 * 0.36, ey = y3 - r3 * 0.2;
        if (blink) { ctx.strokeStyle = P.coal; ctx.lineWidth = 1.6 * scale; ctx.beginPath(); ctx.moveTo(ex - 2.4 * scale, ey); ctx.lineTo(ex + 2.4 * scale, ey); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(ex, ey, 2.4 * scale, 0, Math.PI * 2); ctx.fill(); const hl = ctx.fillStyle; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(ex - 0.8 * scale, ey - 0.8 * scale, 0.8 * scale, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = hl; }
      });

      // Havuç burun (3D gölgeli)
      ctx.beginPath();
      ctx.moveTo(cx, y3 + r3 * 0.02); ctx.lineTo(cx + r3 * 1.0, y3 + r3 * 0.24); ctx.lineTo(cx, y3 + r3 * 0.34);
      ctx.closePath();
      const cg = ctx.createLinearGradient(cx, y3, cx + r3, y3 + r3 * 0.3);
      cg.addColorStop(0, '#fb923c'); cg.addColorStop(1, P.carrot);
      ctx.fillStyle = cg; ctx.fill();

      // Gülümseme (kömür noktalar, kavisli)
      ctx.fillStyle = P.coal;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(cx + i * r3 * 0.3, y3 + r3 * 0.58 + Math.abs(i) * 1.5 * scale, 1.4 * scale, 0, Math.PI * 2); ctx.fill(); }

      // Düğmeler
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx, y2 - r2 * 0.4 + i * r2 * 0.5, 2.2 * scale, 0, Math.PI * 2); ctx.fillStyle = P.coal; ctx.fill(); }

      ctx.restore();
    };

    const draw = () => {
      const o = orbPos();

      // 1) Gökyüzü
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      for (const stop of P.sky) sky.addColorStop(stop.at, stop.c);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // 2) Yıldızlar (gece)
      if (P.stars) {
        stars.forEach((st) => {
          if (!reduceMotion) st.tw += st.twSpeed;
          const a = 0.3 + Math.abs(Math.sin(st.tw)) * 0.65;
          ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
        });
      }

      // 2b) Kuyruklu yıldız (gece) — parlak baş + uzun ışıltılı kuyruk
      if (isDark && !reduceMotion) {
        if (!comet.active) {
          comet.timer--;
          if (comet.timer <= 0) {
            comet.active = true;
            comet.x = -60; comet.y = H * (0.08 + Math.random() * 0.25);
            const ang = 0.22 + Math.random() * 0.14;
            const spd = 3.4 + Math.random() * 1.8;
            comet.vx = Math.cos(ang) * spd; comet.vy = Math.sin(ang) * spd;
            comet.maxLife = (W + 200) / comet.vx; comet.life = comet.maxLife;
          }
        } else {
          comet.x += comet.vx; comet.y += comet.vy; comet.life--;
          const tailLen = 220;
          const tx = comet.x - (comet.vx / Math.hypot(comet.vx, comet.vy)) * tailLen;
          const ty = comet.y - (comet.vy / Math.hypot(comet.vx, comet.vy)) * tailLen;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          // kuyruk (geniş → ince, ışıltılı)
          const tg = ctx.createLinearGradient(comet.x, comet.y, tx, ty);
          tg.addColorStop(0, 'rgba(190,225,255,0.9)');
          tg.addColorStop(0.4, 'rgba(120,180,255,0.35)');
          tg.addColorStop(1, 'transparent');
          ctx.strokeStyle = tg; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(tx, ty); ctx.stroke();
          // ince iç kuyruk (parlak çekirdek)
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo((comet.x + tx) / 2, (comet.y + ty) / 2); ctx.stroke();
          // baş (parlak nokta + glow)
          const hg = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, 10);
          hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, 'rgba(200,225,255,0.8)'); hg.addColorStop(1, 'transparent');
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(comet.x, comet.y, 10, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (comet.x > W + tailLen || comet.life <= 0) { comet.active = false; comet.timer = 260 + Math.random() * 520; }
        }
      }

      // 3) Aurora (gece) — yeşil-mavi ışık perdesi, yumuşak dalgalanan bantlar
      if (P.aurora) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const bands = 3;
        for (let b = 0; b < bands; b++) {
          const baseY = H * (0.14 + b * 0.09);
          const hue = b % 2 === 0 ? 160 : 195; // zümrüt ↔ buz mavisi
          ctx.beginPath();
          ctx.moveTo(0, baseY);
          for (let x = 0; x <= W; x += 14) {
            const y = baseY
              + Math.sin(x * 0.004 + t * 0.006 + b) * 34
              + Math.sin(x * 0.011 - t * 0.004 + b * 2) * 16;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(W, baseY - 90);
          ctx.lineTo(0, baseY - 90);
          ctx.closePath();
          const ag = ctx.createLinearGradient(0, baseY - 90, 0, baseY + 40);
          ag.addColorStop(0, 'transparent');
          ag.addColorStop(0.55, `hsla(${hue},80%,58%,0.14)`);
          ag.addColorStop(1, 'transparent');
          ctx.fillStyle = ag; ctx.fill();
        }
        ctx.restore();
      }

      // 4) Gökcismi — gece: parlak ay (soğuk gümüşi), gündüz: yumuşak güneş (altın)
      const pulse = 1 + Math.sin(t * 0.02) * (isDark ? 0.025 : 0.05);
      const orbR = Math.min(W, H) * 0.075 * pulse;
      // hale
      const glow = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, orbR * 6);
      glow.addColorStop(0, isDark ? `hsla(220,70%,88%,${P.orbGlowA})` : `hsla(48,100%,82%,${P.orbGlowA})`);
      glow.addColorStop(0.3, isDark ? 'hsla(225,55%,78%,0.16)' : 'hsla(48,100%,70%,0.28)');
      glow.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(o.x, o.y, orbR * 6, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      // disk
      const disk = ctx.createRadialGradient(o.x - orbR * 0.3, o.y - orbR * 0.3, orbR * 0.1, o.x, o.y, orbR);
      disk.addColorStop(0, P.orbCore); disk.addColorStop(0.6, P.orbMid); disk.addColorStop(1, P.orbEdge);
      ctx.beginPath(); ctx.arc(o.x, o.y, orbR, 0, Math.PI * 2); ctx.fillStyle = disk;
      ctx.shadowColor = P.orbShadow; ctx.shadowBlur = 42; ctx.fill(); ctx.shadowBlur = 0;
      // ay kraterleri (yalnız gece)
      if (isDark) {
        ctx.save();
        ctx.beginPath(); ctx.arc(o.x, o.y, orbR, 0, Math.PI * 2); ctx.clip();
        const craters = [
          { dx: -0.25, dy: -0.12, r: 0.16 }, { dx: 0.2, dy: 0.14, r: 0.2 }, { dx: 0.08, dy: -0.32, r: 0.1 },
          { dx: -0.18, dy: 0.3, r: 0.13 }, { dx: 0.36, dy: -0.24, r: 0.09 },
        ];
        craters.forEach((c) => {
          const cx = o.x + c.dx * orbR, cy = o.y + c.dy * orbR, cr = c.r * orbR;
          const cg = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr);
          cg.addColorStop(0, 'rgba(150,165,200,0.4)'); cg.addColorStop(0.7, 'rgba(120,135,175,0.28)'); cg.addColorStop(1, 'transparent');
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
        });
        ctx.restore();
      }

      // 5) Arka çam ağaçları (uzak silüetler → derinlik)
      pines.forEach((p) => drawPine(p.x, p.base, p.h, p.w, p.sway));

      // 6) UZAK kar katmanı (küçük/yavaş) — ağaçların önünde, örtünün arkasında
      flakes.filter((f) => f.depth < 0.4).forEach((f) => {
        if (!reduceMotion) { f.y += f.speed; f.phase += f.phaseSpeed; f.x += Math.sin(f.phase) * f.drift; }
        if (f.y > H + f.r) { f.y = -f.r; f.x = Math.random() * W; }
        if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${P.snowColor},${P.snowAlpha * 0.5})`; ctx.fill();
      });

      // 7) Kar örtüsü (dalgalı parlayan zemin)
      const gy = H * 0.82;
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, gy);
      for (let x = 0; x <= W; x += 6) {
        const y = gy
          + Math.sin(x * 0.006 + t * 0.004) * 14
          + Math.sin(x * 0.017 - t * 0.002) * 6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      const ground = ctx.createLinearGradient(0, gy - 20, 0, H);
      ground.addColorStop(0, P.groundTop); ground.addColorStop(0.4, P.groundMid); ground.addColorStop(1, P.groundBot);
      ctx.fillStyle = ground; ctx.fill();
      // örtü parıltısı (üst kenar hafif parlar)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const y = gy + Math.sin(x * 0.006 + t * 0.004) * 14 + Math.sin(x * 0.017 - t * 0.002) * 6;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = P.groundGlow; ctx.lineWidth = 3;
      ctx.shadowColor = P.groundGlow; ctx.shadowBlur = 16; ctx.stroke(); ctx.shadowBlur = 0;
      ctx.restore();

      // 7b) Gökcismi yansıması — kar örtüsüne düşen yumuşak ışık sütunu.
      //     Gece: soğuk gümüşi ay ışığı; gündüz: sıcak altın güneş parıltısı.
      //     Örtü üzerinde dikey, aşağı indikçe genişleyip hafifçe titreşen huzme.
      {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const startY = gy;
        for (let y = startY; y < H; y += 5) {
          const prog = (y - startY) / (H - startY);
          const halfW = orbR * (0.45 + prog * 2.6);
          const shimmer = reduceMotion ? 0 : Math.sin(y * 0.14 + t * 0.05) * (2 + prog * 5);
          const cx = o.x + shimmer;
          const flick = reduceMotion ? 1 : (0.6 + Math.abs(Math.sin(y * 0.3 + t * 0.04)) * 0.4);
          const alpha = P.reflA * (1 - prog) * flick;
          const g = ctx.createLinearGradient(cx - halfW, y, cx + halfW, y);
          g.addColorStop(0, 'transparent');
          g.addColorStop(0.5, `hsla(${P.reflHue},90%,${P.reflL}%,${alpha})`);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fillRect(cx - halfW, y, halfW * 2, 2.5);
        }
        ctx.restore();
      }

      // 8) Kardan adam (alt-sol)
      const smScale = Math.min(1.3, Math.max(0.8, W / 1300));
      drawSnowman(W * 0.15, gy + 24, smScale);

      // 9) YAKIN kar katmanları (orta + büyük/hızlı) — ön planda, örtünün önünde
      flakes.filter((f) => f.depth >= 0.4).forEach((f) => {
        if (!reduceMotion) {
          f.y += f.speed;
          f.phase += f.phaseSpeed;
          // rüzgar salınımı: yatay sin drift
          f.x += Math.sin(f.phase) * f.drift + Math.sin(t * 0.005) * 0.4 * f.depth;
        }
        if (f.y > H + f.r) { f.y = -f.r; f.x = Math.random() * W; }
        if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
        const a = P.snowAlpha * (0.6 + f.depth * 0.4);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${P.snowColor},${a})`;
        if (f.depth >= 0.9) { ctx.shadowColor = `rgba(${P.snowColor},0.8)`; ctx.shadowBlur = 6; }
        ctx.fill(); ctx.shadowBlur = 0;
      });

      // 10) Buz kristali parıltıları (twinkle — yıldız-kıvılcım)
      crystals.forEach((c) => {
        if (!reduceMotion) c.tw += c.twSpeed;
        const tw = 0.25 + Math.abs(Math.sin(c.tw)) * 0.75;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `hsla(${P.crystalHue},90%,${P.crystalL}%,${tw})`;
        ctx.lineWidth = 1;
        ctx.shadowColor = `hsla(${P.crystalHue},90%,80%,${tw})`;
        ctx.shadowBlur = 6;
        const rr = c.r * (0.7 + tw * 0.6);
        // 4-kollu ışık kıvılcımı
        ctx.beginPath();
        ctx.moveTo(-rr * 2.4, 0); ctx.lineTo(rr * 2.4, 0);
        ctx.moveTo(0, -rr * 2.4); ctx.lineTo(0, rr * 2.4);
        ctx.moveTo(-rr, -rr); ctx.lineTo(rr, rr);
        ctx.moveTo(rr, -rr); ctx.lineTo(-rr, rr);
        ctx.stroke();
        ctx.restore();
      });

      // 11) Bloom — soğuk ışık yıkaması (gökcisminden yayılan)
      const bloom = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, Math.max(W, H) * 0.9);
      bloom.addColorStop(0, P.bloom); bloom.addColorStop(1, 'transparent');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H); ctx.restore();

      // 12) Sinematik vinyet (kenar koyulaşma → odak)
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vig.addColorStop(0, 'transparent'); vig.addColorStop(1, `rgba(0,0,0,${P.vignette})`);
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      t++;
      if (!reduceMotion) animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize); };
  }, [isDark]);

  return (
    <>
      <canvas ref={canvasRef} className={cn('fixed inset-0 z-0 pointer-events-none', className)} />
      {children}
    </>
  );
}
