'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * Yaz teması — sinematik, "efsanevi" seviye animasyonlu arka plan.
 * Açık ve koyu modlar KESKİN ayrışır:
 *  • Açık mod (gündüz): parlak turkuaz gökyüzü + altın güneş + berrak deniz.
 *  • Koyu mod (gün batımı/gece): derin mor gökyüzü + sıcak batık güneş + yıldızlar + meteor.
 * Katmanlar: atmosfer gradyanı, yıldız/meteor, sis, ışık huzmeleri, bulut orb'ları, martılar,
 *   ışıyan güneş + halo, deniz caustics (ışık kırılması), çok katmanlı dalgalar (parallax),
 *   köpük, derinlikli ışıltı parçacıkları, bloom ışık yıkaması, sinematik vinyet.
 * Palet: #4C1D95 koyu mor, #F3E8FF açık lila, #FEF08A güneş sarısı, #99F6E4 deniz turkuazı.
 * prefers-reduced-motion'a saygılı; DPR-ölçekli (retina keskinliği).
 */
interface SummerBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function SummerBackground({ children, className }: SummerBackgroundProps) {
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
          // Gece: derin mor-lacivert gökyüzü (dolunay için)
          sky: [
            { at: 0, c: '#0c0620' }, { at: 0.35, c: '#241056' }, { at: 0.58, c: '#4C1D95' },
            { at: 0.78, c: '#3a2170' }, { at: 1, c: '#140a2e' },
          ],
          sunCore: '#fff2c0', sunMid: '#FEF08A', sunEdge: '#f97316', sunHaloA: 0.6, sunGlow: 'rgba(249,168,80,0.95)',
          seaHues: [{ h: 250, s: 58, l: 34 }, { h: 215, s: 52, l: 28 }, { h: 190, s: 55, l: 34 }],
          seaAlpha: 0.66, foam: 0.9, crestL: 80, causticHue: 220, causticA: 0.16,
          orbHue: 288, orbAlpha: 0.16, rayAlpha: 0.16, reflAlpha: 0.18,
          stars: true, meteor: true, sparkAlpha: 0.9, mist: 'rgba(80,30,120,0.18)', bloom: 'rgba(255,150,80,0.05)', vignette: 0.55,
        }
      : {
          sky: [
            { at: 0, c: '#4fc3e0' }, { at: 0.3, c: '#7ad4e8' }, { at: 0.55, c: '#bfeaf2' },
            { at: 0.75, c: '#F3E8FF' }, { at: 1, c: '#cff3ec' },
          ],
          sunCore: '#ffffff', sunMid: '#FEF08A', sunEdge: '#fbbf24', sunHaloA: 0.72, sunGlow: 'rgba(254,240,138,0.95)',
          seaHues: [{ h: 168, s: 80, l: 60 }, { h: 178, s: 74, l: 52 }, { h: 196, s: 68, l: 48 }],
          seaAlpha: 0.52, foam: 0.6, crestL: 90, causticHue: 175, causticA: 0.18,
          orbHue: 55, orbAlpha: 0.18, rayAlpha: 0.22, reflAlpha: 0.24,
          stars: false, meteor: false, sparkAlpha: 0.65, mist: 'rgba(255,255,255,0.16)', bloom: 'rgba(255,240,180,0.05)', vignette: 0.28,
        };

    const sunPos = () => ({ x: W * 0.72, y: H * (isDark ? 0.34 : 0.25) });

    // Dalga katmanları (parallax: 4 katman)
    interface WaveLayer { baseY: number; amplitude: number; frequency: number; speed: number; phase: number; color: { h: number; s: number; l: number }; sw: { amp: number; freq: number; speed: number }[]; }
    const waveLayers: WaveLayer[] = [
      { baseY: 0.90, amplitude: 46, frequency: 0.007, speed: 0.015, phase: 0, color: P.seaHues[0], sw: [{ amp: 18, freq: 0.015, speed: 0.02 }, { amp: 9, freq: 0.026, speed: 0.03 }] },
      { baseY: 0.83, amplitude: 56, frequency: 0.006, speed: 0.012, phase: Math.PI / 3, color: P.seaHues[1], sw: [{ amp: 22, freq: 0.012, speed: 0.018 }, { amp: 13, freq: 0.021, speed: 0.026 }] },
      { baseY: 0.76, amplitude: 42, frequency: 0.009, speed: 0.017, phase: Math.PI / 2, color: P.seaHues[2], sw: [{ amp: 16, freq: 0.018, speed: 0.022 }, { amp: 10, freq: 0.028, speed: 0.034 }] },
      { baseY: 0.70, amplitude: 30, frequency: 0.011, speed: 0.02, phase: Math.PI, color: P.seaHues[0], sw: [{ amp: 12, freq: 0.02, speed: 0.026 }, { amp: 7, freq: 0.03, speed: 0.04 }] },
    ];

    const rayCount = 16;
    const rays = Array.from({ length: rayCount }, (_, i) => ({ angle: (Math.PI * 2 * i) / rayCount, length: 0.5 + Math.random() * 0.6, width: 0.025 + Math.random() * 0.05 }));

    interface Orb { x: number; y: number; radius: number; speedX: number; pulse: number; }
    const orbs: Orb[] = Array.from({ length: 9 }, () => ({ x: Math.random() * W, y: H * 0.1 + Math.random() * H * 0.44, radius: 55 + Math.random() * 110, speedX: (Math.random() - 0.5) * 0.28, pulse: Math.random() * Math.PI * 2 }));

    const stars = P.stars ? Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.62, r: Math.random() * 1.5 + 0.3, tw: Math.random() * Math.PI * 2, twSpeed: 0.02 + Math.random() * 0.04 })) : [];

    // Meteor (koyu mod, ara sıra)
    const meteor = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, timer: 200 + Math.random() * 400 };

    // Derinlikli ışıltılar (3 boyut katmanı → parallax)
    interface Spark { x: number; y: number; radius: number; speed: number; wobble: number; wobbleSpeed: number; hue: number; }
    const sparks: Spark[] = Array.from({ length: 56 }, () => {
      const depth = Math.random();
      return { x: Math.random() * W, y: Math.random() * H, radius: 0.6 + depth * 2.6, speed: (0.2 + depth * 0.9), wobble: Math.random() * Math.PI * 2, wobbleSpeed: 0.014 + Math.random() * 0.03, hue: Math.random() < 0.5 ? 52 : (isDark ? 288 : 170) };
    });

    const gulls = Array.from({ length: 4 }, () => ({ x: Math.random() * W, y: H * (0.1 + Math.random() * 0.2), speed: 0.18 + Math.random() * 0.3, size: 8 + Math.random() * 9, flap: Math.random() * Math.PI * 2 }));

    let animationId = 0;
    let t = 0;

    const draw = () => {
      const s = sunPos();

      // 1) Gökyüzü
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      for (const stop of P.sky) sky.addColorStop(stop.at, stop.c);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // 2) Yıldızlar
      if (P.stars) stars.forEach((st) => { if (!reduceMotion) st.tw += st.twSpeed; const a = 0.3 + Math.abs(Math.sin(st.tw)) * 0.65; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill(); });

      // 2b) Meteor
      if (P.meteor && !reduceMotion) {
        if (!meteor.active) { meteor.timer--; if (meteor.timer <= 0) { meteor.active = true; meteor.x = Math.random() * W * 0.6; meteor.y = Math.random() * H * 0.2; const ang = Math.PI * 0.18; meteor.vx = Math.cos(ang) * 9; meteor.vy = Math.sin(ang) * 9; meteor.life = 60; } }
        else { meteor.x += meteor.vx; meteor.y += meteor.vy; meteor.life--; const tail = 90; const g = ctx.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * (tail / 9), meteor.y - meteor.vy * (tail / 9)); g.addColorStop(0, 'rgba(255,245,200,0.9)'); g.addColorStop(1, 'transparent'); ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(meteor.x, meteor.y); ctx.lineTo(meteor.x - meteor.vx * (tail / 9), meteor.y - meteor.vy * (tail / 9)); ctx.stroke(); if (meteor.life <= 0) { meteor.active = false; meteor.timer = 300 + Math.random() * 500; } }
      }

      // 3) Işık huzmeleri — YALNIZ güneşte (açık mod). Ay huzme yaymaz.
      if (!isDark) {
        const rayRot = t * 0.0006;
        rays.forEach((ray) => { const a = ray.angle + rayRot; const len = Math.max(W, H) * ray.length; const grad = ctx.createLinearGradient(s.x, s.y, s.x + Math.cos(a) * len, s.y + Math.sin(a) * len); grad.addColorStop(0, `hsla(50,100%,75%,${P.rayAlpha})`); grad.addColorStop(1, 'transparent'); ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a); ctx.beginPath(); const w = len * ray.width; ctx.moveTo(0, -w); ctx.lineTo(len, -w * 3.5); ctx.lineTo(len, w * 3.5); ctx.lineTo(0, w); ctx.closePath(); ctx.fillStyle = grad; ctx.fill(); ctx.restore(); });
      }

      // 4) Atmosferik sis (ufuk derinliği)
      const mist = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.72);
      mist.addColorStop(0, 'transparent'); mist.addColorStop(0.5, P.mist); mist.addColorStop(1, 'transparent');
      ctx.fillStyle = mist; ctx.fillRect(0, H * 0.55, W, H * 0.2);

      // 5) Bulut orb'ları
      orbs.forEach((orb) => { if (!reduceMotion) { orb.x += orb.speedX; orb.pulse += 0.014; } if (orb.x < -orb.radius) orb.x = W + orb.radius; if (orb.x > W + orb.radius) orb.x = -orb.radius; const pr = orb.radius * (1 + Math.sin(orb.pulse) * 0.14); const g = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, pr); g.addColorStop(0, `hsla(${P.orbHue},85%,${isDark ? 70 : 85}%,${P.orbAlpha})`); g.addColorStop(0.6, `hsla(${P.orbHue + 10},75%,72%,${P.orbAlpha * 0.4})`); g.addColorStop(1, 'transparent'); ctx.beginPath(); ctx.arc(orb.x, orb.y, pr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); });

      // 6) Martılar
      gulls.forEach((gl) => { if (!reduceMotion) { gl.x += gl.speed; gl.flap += 0.08; } if (gl.x > W + 20) { gl.x = -20; gl.y = H * (0.1 + Math.random() * 0.2); } const wing = Math.sin(gl.flap) * gl.size * 0.5; ctx.beginPath(); ctx.moveTo(gl.x - gl.size, gl.y + wing); ctx.quadraticCurveTo(gl.x, gl.y - gl.size * 0.4, gl.x, gl.y); ctx.quadraticCurveTo(gl.x, gl.y - gl.size * 0.4, gl.x + gl.size, gl.y + wing); ctx.strokeStyle = isDark ? 'rgba(15,8,35,0.6)' : 'rgba(40,40,60,0.35)'; ctx.lineWidth = 2; ctx.stroke(); });

      // 7) Gökcismi — koyu modda DOLUNAY (gümüşi, kraterli), açık modda güneş (altın)
      const pulse = 1 + Math.sin(t * 0.02) * (isDark ? 0.03 : 0.06);
      const sunR = Math.min(W, H) * 0.082 * pulse;
      if (isDark) {
        // Dolunay: soğuk gümüşi hale + disk + kraterler
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR * 6);
        glow.addColorStop(0, 'hsla(220,60%,88%,0.5)'); glow.addColorStop(0.3, 'hsla(230,50%,80%,0.18)'); glow.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR * 6, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
        // ay diski
        const moon = ctx.createRadialGradient(s.x - sunR * 0.3, s.y - sunR * 0.3, sunR * 0.1, s.x, s.y, sunR);
        moon.addColorStop(0, '#ffffff'); moon.addColorStop(0.55, '#e8ecf7'); moon.addColorStop(1, '#c3cbe0');
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.fillStyle = moon;
        ctx.shadowColor = 'rgba(200,215,255,0.85)'; ctx.shadowBlur = 40; ctx.fill(); ctx.shadowBlur = 0;
        // kraterler (ay yüzeyi dokusu) — diskin içinde clip'li
        ctx.save();
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.clip();
        const craters = [
          { dx: -0.28, dy: -0.15, r: 0.18 }, { dx: 0.22, dy: 0.1, r: 0.24 }, { dx: 0.05, dy: -0.35, r: 0.12 },
          { dx: -0.15, dy: 0.32, r: 0.15 }, { dx: 0.38, dy: -0.28, r: 0.1 }, { dx: -0.4, dy: 0.15, r: 0.09 },
        ];
        craters.forEach((c) => {
          const cx = s.x + c.dx * sunR, cy = s.y + c.dy * sunR, cr = c.r * sunR;
          const cg = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr);
          cg.addColorStop(0, 'rgba(150,160,190,0.35)'); cg.addColorStop(0.7, 'rgba(120,130,160,0.25)'); cg.addColorStop(1, 'transparent');
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
        });
        ctx.restore();
      } else {
        // Güneş: altın halo + disk
        const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR * 6);
        halo.addColorStop(0, `hsla(48,100%,78%,${P.sunHaloA})`); halo.addColorStop(0.28, `hsla(48,100%,68%,${P.sunHaloA * 0.4})`); halo.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR * 6, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
        const disk = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR);
        disk.addColorStop(0, P.sunCore); disk.addColorStop(0.6, P.sunMid); disk.addColorStop(1, P.sunEdge);
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.fillStyle = disk; ctx.shadowColor = P.sunGlow; ctx.shadowBlur = 50; ctx.fill(); ctx.shadowBlur = 0;
      }

      // 8) Denizde ışık kırılması (caustics) — güneş altında titreşen ışık çizgileri
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const cy = H * (0.68 + i * 0.06);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) {
          const yy = cy + Math.sin(x * 0.02 + t * 0.03 + i) * 6 + Math.sin(x * 0.05 - t * 0.02) * 3;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        const dist = Math.abs(0.5 - (i / 5));
        ctx.strokeStyle = `hsla(${P.causticHue},100%,75%,${P.causticA * (1 - dist)})`;
        ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.restore();

      // 9) Su yansıması — güneş: geniş üçgen ışık sütunu; ay: titreşen parçalı gümüşi ışık yolu
      if (isDark) {
        // Ay yolu (moonpath): denizde yatay parçalı gümüşi çizgiler, yukarıdan aşağıya genişleyip titreşir.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const startY = H * 0.62;
        for (let y = startY; y < H; y += 5) {
          const prog = (y - startY) / (H - startY);
          const halfW = sunR * (0.5 + prog * 3);      // aşağı indikçe genişler
          const shimmer = Math.sin(y * 0.15 + t * 0.05) * (2 + prog * 6);
          const cx = s.x + shimmer;
          const alpha = P.reflAlpha * (1 - prog) * (0.6 + Math.abs(Math.sin(y * 0.3 + t * 0.04)) * 0.4);
          const g = ctx.createLinearGradient(cx - halfW, y, cx + halfW, y);
          g.addColorStop(0, 'transparent');
          g.addColorStop(0.5, `hsla(215,90%,88%,${alpha})`);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fillRect(cx - halfW, y, halfW * 2, 2.5);
        }
        ctx.restore();
      } else {
        const refl = ctx.createLinearGradient(s.x, H * 0.6, s.x, H);
        refl.addColorStop(0, `hsla(50,100%,72%,${P.reflAlpha})`); refl.addColorStop(1, 'transparent');
        ctx.save(); ctx.beginPath(); ctx.moveTo(s.x - sunR * 0.6, H * 0.6); ctx.lineTo(s.x + sunR * 0.6, H * 0.6); ctx.lineTo(s.x + sunR * 2.8, H); ctx.lineTo(s.x - sunR * 2.8, H); ctx.closePath(); ctx.fillStyle = refl; ctx.fill(); ctx.restore();
      }

      // 10) Deniz dalgaları (4 katman parallax)
      waveLayers.forEach((layer, li) => {
        if (!reduceMotion) layer.phase += layer.speed;
        const pts: { x: number; y: number }[] = [];
        for (let x = -10; x <= W + 10; x += 3) { let y = H * layer.baseY; y += Math.sin(x * layer.frequency + layer.phase) * layer.amplitude; layer.sw.forEach((sw, i) => { y += Math.sin(x * sw.freq + layer.phase * sw.speed * 50 + i) * sw.amp; }); pts.push({ x, y }); }
        ctx.beginPath(); ctx.moveTo(pts[0].x, H);
        for (let i = 0; i < pts.length; i++) { if (i === 0) ctx.lineTo(pts[i].x, pts[i].y); else { const xc = (pts[i - 1].x + pts[i].x) / 2, yc = (pts[i - 1].y + pts[i].y) / 2; ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc); } }
        ctx.lineTo(W + 10, H); ctx.closePath();
        const fill = ctx.createLinearGradient(0, pts[0].y - layer.amplitude, 0, H);
        const a = P.seaAlpha - li * 0.05;
        fill.addColorStop(0, `hsla(${layer.color.h},${layer.color.s}%,${layer.color.l}%,${a})`);
        fill.addColorStop(0.5, `hsla(${layer.color.h + 8},${layer.color.s - 8}%,${layer.color.l - 12}%,${a * 0.7})`);
        fill.addColorStop(1, `hsla(${layer.color.h + 16},${layer.color.s - 16}%,${layer.color.l - 22}%,${a * 0.35})`);
        ctx.fillStyle = fill; ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else { const xc = (pts[i - 1].x + pts[i].x) / 2, yc = (pts[i - 1].y + pts[i].y) / 2; ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, xc, yc); } }
        ctx.strokeStyle = `hsla(${layer.color.h},100%,${P.crestL}%,${a * 1.3})`; ctx.lineWidth = 2; ctx.shadowColor = `hsla(${layer.color.h},100%,75%,0.8)`; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
        if (li === 0) { for (let i = 0; i < pts.length; i += 18) { if (Math.random() < P.foam * 0.32) { const p = pts[i]; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 1.5 + Math.random() * 2.5, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${P.foam * (0.3 + Math.random() * 0.4)})`; ctx.fill(); } } }
      });

      // 11) Derinlikli ışıltılar (parallax + twinkle)
      sparks.forEach((sp) => { if (!reduceMotion) { sp.y -= sp.speed; sp.wobble += sp.wobbleSpeed; sp.x += Math.sin(sp.wobble) * 0.4; } if (sp.y < -sp.radius) { sp.y = H + sp.radius; sp.x = Math.random() * W; } const twinkle = 0.4 + Math.abs(Math.sin(sp.wobble)) * 0.5; ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2); ctx.fillStyle = `hsla(${sp.hue},100%,${sp.hue === 52 ? 70 : 76}%,${twinkle * P.sparkAlpha})`; ctx.shadowColor = `hsla(${sp.hue},100%,70%,0.7)`; ctx.shadowBlur = 7; ctx.fill(); ctx.shadowBlur = 0; });

      // 12) Bloom — tüm sahneye sıcak ışık yıkaması
      const bloom = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(W, H) * 0.9);
      bloom.addColorStop(0, P.bloom); bloom.addColorStop(1, 'transparent');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H); ctx.restore();

      // 13) Sinematik vinyet (kenar koyulaşma → odak)
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
