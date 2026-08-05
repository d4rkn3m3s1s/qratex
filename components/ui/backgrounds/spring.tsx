'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useSceneInteraction } from './use-scene-interaction';

/**
 * İlkbahar teması — sinematik, "efsanevi" seviye animasyonlu arka plan.
 * Açık ve koyu modlar KESKİN ayrışır:
 *  • Açık mod (ilkbahar gündüzü): taze açık yeşil-beyaz gökyüzü + parlak neşeli güneş + bol çiçek.
 *  • Koyu mod (ilkbahar gecesi/alacakaranlık): koyu zümrüt-mor gökyüzü + yumuşak ay + ışıltılı çiçek tozu.
 * Katmanlar: atmosfer gradyanı, yıldız/çiçek tozu, gökcismi (güneş/ay) + huzmeler,
 *   uçuşan taç yapraklar (sakura, çok katmanlı parallax), bahar yağmuru, açan çiçekler,
 *   dalgalı çimen silüeti, kelebekler, parlak polen ışıltısı, bloom, sinematik vinyet.
 * Palet: #064E3B koyu zümrüt, #FAFAF9 kırık beyaz, #A855F7 mor aksan, #22C55E taze yeşil.
 * prefers-reduced-motion'a saygılı; DPR-ölçekli (retina keskinliği).
 */
interface SpringBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function SpringBackground({ children, className }: SpringBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Hareket azaltma tercihi — gövdede (hem effect hem hook aynı değeri kullansın)
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Paylaşılan etkileşim altyapısı (fare parallax + itiş, tıklama dalgası, açılış fade-in)
  const scene = useSceneInteraction({ reduceMotion });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
          // İlkbahar gecesi: koyu zümrüt → mor alacakaranlık gökyüzü
          sky: [
            { at: 0, c: '#03130f' }, { at: 0.3, c: '#064E3B' }, { at: 0.56, c: '#0f3d55' },
            { at: 0.78, c: '#3b1f6b' }, { at: 1, c: '#160a2e' },
          ],
          // Yumuşak ay (soğuk gümüşi-mor tint — ilkbahar gecesi)
          sunCore: '#ffffff', sunMid: '#eef0ff', sunEdge: '#c9c7ec', sunHaloA: 0.5, sunGlow: 'rgba(198,196,255,0.85)',
          moonReflA: 0.14,   // ay ışığı huzmesi yoğunluğu (yumuşak)
          // Taç yaprak renkleri (koyu modda ışıltılı mor + kırık beyaz)
          petalHues: [{ h: 271, s: 78, l: 62 }, { h: 291, s: 70, l: 68 }, { h: 320, s: 60, l: 74 }, { h: 60, s: 8, l: 96 }],
          petalAlpha: 0.7, glowPetal: 0.35,
          grassHue: 158, grassS: 60, grassL: 26, grassAlpha: 0.9,
          bloomPetalHue: 285, bloomCenter: '#c4b5fd',
          rainAlpha: 0.14, rainHue: 200,
          rays: false, sunBeams: false,
          stars: true, pollenHue: 285, pollenAlpha: 0.85,
          mist: 'rgba(40,90,70,0.2)', bloom: 'rgba(120,90,200,0.05)', vignette: 0.52, butterflyDark: true,
        }
      : {
          // İlkbahar gündüzü: taze açık yeşil → kırık beyaz gökyüzü
          sky: [
            { at: 0, c: '#b6ecd0' }, { at: 0.28, c: '#d6f5df' }, { at: 0.54, c: '#eefbf1' },
            { at: 0.76, c: '#FAFAF9' }, { at: 1, c: '#e6f7ea' },
          ],
          // Parlak neşeli güneş (yeşil-altın sıcaklık)
          sunCore: '#ffffff', sunMid: '#fef9c3', sunEdge: '#a3e635', sunHaloA: 0.68, sunGlow: 'rgba(190,242,140,0.95)',
          moonReflA: 0,      // açık modda ay huzmesi yok
          // Taç yaprak renkleri (açık modda canlı pembe-mor + beyaz)
          petalHues: [{ h: 291, s: 80, l: 70 }, { h: 330, s: 78, l: 76 }, { h: 271, s: 74, l: 66 }, { h: 45, s: 30, l: 98 }],
          petalAlpha: 0.82, glowPetal: 0.18,
          grassHue: 142, grassS: 68, grassL: 48, grassAlpha: 0.85,
          bloomPetalHue: 291, bloomCenter: '#facc15',
          rainAlpha: 0.1, rainHue: 190,
          rays: true, sunBeams: true,
          stars: false, pollenHue: 55, pollenAlpha: 0.7,
          mist: 'rgba(255,255,255,0.22)', bloom: 'rgba(200,255,190,0.05)', vignette: 0.26, butterflyDark: false,
        };

    // Güneş/ay konumu (açık mod biraz daha yüksek/parlak)
    const sunPos = () => ({ x: W * 0.74, y: H * (isDark ? 0.28 : 0.22) });

    // ── Uçuşan taç yapraklar (sakura) — 3 derinlik katmanı, parallax ──
    interface Petal {
      x: number; y: number; size: number; speedY: number; drift: number;
      sway: number; swaySpeed: number; rot: number; rotSpeed: number;
      spin: number; hue: { h: number; s: number; l: number }; depth: number;
    }
    const petals: Petal[] = Array.from({ length: 45 }, () => {
      const depth = Math.random();                 // 0 uzak, 1 yakın
      const hue = P.petalHues[Math.floor(Math.random() * P.petalHues.length)];
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        size: 5 + depth * 11,                       // yakın = büyük
        speedY: 0.25 + depth * 0.9,                 // yakın = hızlı düşer
        drift: (Math.random() - 0.5) * 0.5,         // yatay sürüklenme
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.012 + Math.random() * 0.03,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.04,
        spin: 0.4 + Math.random() * 0.9,            // 3B dönme hissi (ölçek)
        hue, depth,
      };
    });

    // ── Açan çiçekler (alt köşeler, çimen üstünde) ──
    interface Flower {
      x: number; yBase: number; stem: number; size: number;
      sway: number; swaySpeed: number; petalHue: { h: number; s: number; l: number }; centerHue: number;
      breath: number; breathSpeed: number;
    }
    const flowerCount = 7;
    const flowers: Flower[] = Array.from({ length: flowerCount }, (_, i) => {
      const hue = P.petalHues[i % 3];               // beyazı çiçek gövdesine kullanma
      return {
        x: (i + 0.5) / flowerCount * W + (Math.random() - 0.5) * 60,
        yBase: H * (0.9 + Math.random() * 0.05),
        stem: 55 + Math.random() * 70,
        size: 10 + Math.random() * 8,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.01 + Math.random() * 0.015,
        petalHue: hue,
        centerHue: 48,
        breath: Math.random() * Math.PI * 2,        // "nefes" fazı (her çiçek farklı)
        breathSpeed: 0.02 + Math.random() * 0.02,
      };
    });

    // ── Bahar yağmuru damlaları (ince, hafif eğik) ──
    interface Drop { x: number; y: number; len: number; speed: number; slant: number; alpha: number; }
    const drops: Drop[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      len: 8 + Math.random() * 16, speed: 5 + Math.random() * 7,
      slant: 1.4 + Math.random() * 0.8, alpha: 0.3 + Math.random() * 0.5,
    }));

    // ── Yıldızlar (koyu mod) ──
    const stars = P.stars ? Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.6,
      r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, twSpeed: 0.02 + Math.random() * 0.04,
    })) : [];

    // ── Parlak polen / ışıltı toz (twinkle, yukarı süzülür) ──
    interface Pollen { x: number; y: number; radius: number; speed: number; wobble: number; wobbleSpeed: number; hue: number; depth: number; twPhase: number; }
    const pollen: Pollen[] = Array.from({ length: 58 }, () => {
      const depth = Math.random();                  // 0 uzak/soluk, 1 yakın/parlak
      return {
        x: Math.random() * W, y: Math.random() * H,
        radius: 0.6 + depth * 2.4, speed: 0.15 + depth * 0.6,
        wobble: Math.random() * Math.PI * 2, wobbleSpeed: 0.014 + Math.random() * 0.03,
        hue: Math.random() < 0.5 ? P.pollenHue : (isDark ? 158 : 90),
        depth, twPhase: Math.random() * Math.PI * 2,  // ayrı twinkle fazı → katmanlı kıvılcım
      };
    });

    // ── Kelebekler (uçan, kanat çırpan) ──
    interface Butterfly { x: number; y: number; speed: number; size: number; flap: number; flapSpeed: number; phase: number; hue: number; }
    const butterflies: Butterfly[] = Array.from({ length: 4 }, () => ({
      x: Math.random() * W, y: H * (0.35 + Math.random() * 0.4),
      speed: 0.35 + Math.random() * 0.4, size: 7 + Math.random() * 6,
      flap: Math.random() * Math.PI * 2, flapSpeed: 0.18 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2, hue: P.petalHues[Math.floor(Math.random() * 3)].h,
    }));

    // ── Arılar (çiçekten çiçeğe zigzag uçan, küçük sarı-siyah) ──
    // Çiçek tepeleri arasında dolaşırlar; hedef çiçeğe yaklaşınca yeni hedef seçerler.
    interface Bee {
      x: number; y: number; vx: number; vy: number;
      target: number;            // hedef çiçek indeksi
      wing: number; wingSpeed: number; // kanat titreşim fazı
      zig: number; zigSpeed: number;   // zigzag salınım fazı
      size: number; speed: number;
    }
    const bees: Bee[] = Array.from({ length: 2 }, () => ({
      x: Math.random() * W, y: H * (0.55 + Math.random() * 0.25),
      vx: 0, vy: 0,
      target: Math.floor(Math.random() * flowerCount),
      wing: Math.random() * Math.PI * 2, wingSpeed: 0.9 + Math.random() * 0.4,
      zig: Math.random() * Math.PI * 2, zigSpeed: 0.12 + Math.random() * 0.08,
      size: 4.5 + Math.random() * 2, speed: 1.4 + Math.random() * 0.6,
    }));

    // ── Güneş huzmeleri (açık mod) ──
    const rayCount = 14;
    const rays = Array.from({ length: rayCount }, (_, i) => ({
      angle: (Math.PI * 2 * i) / rayCount, length: 0.5 + Math.random() * 0.55, width: 0.022 + Math.random() * 0.045,
    }));

    let animationId = 0;
    let t = 0;

    // Bir taç yaprağı çizen yardımcı (yumuşak damla/yürek formu)
    const drawPetal = (cx: number, cy: number, size: number, rot: number, sx: number, color: string, glow: number, glowColor: string) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sx, 1);                             // 3B dönme için yatay ölçek
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(size * 0.85, -size * 0.6, size * 0.7, size * 0.5, 0, size);
      ctx.bezierCurveTo(-size * 0.7, size * 0.5, -size * 0.85, -size * 0.6, 0, -size);
      ctx.closePath();
      ctx.fillStyle = color;
      if (glow > 0) { ctx.shadowColor = glowColor; ctx.shadowBlur = 8; }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    };

    const draw = () => {
      // Etkileşim durumunu bir adım ilerlet (parallax, ripple, intro)
      scene.step();
      // Fare parallax (-1..1) — uzak katmanları hafifçe kaydırmak için
      const mx = scene.pointer.x, my = scene.pointer.y;

      // Gökcismi (güneş/ay) uzak katman — parallax ile hafifçe kayar
      const sBase = sunPos();
      const s = { x: sBase.x - mx * 10, y: sBase.y - my * 6 };

      // 1) Gökyüzü (dikey atmosfer gradyanı)
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      for (const stop of P.sky) sky.addColorStop(stop.at, stop.c);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // 2) Yıldızlar (koyu mod, twinkle) — en uzak katman, hafif parallax
      if (P.stars) stars.forEach((st) => {
        if (!reduceMotion) st.tw += st.twSpeed;
        const a = 0.25 + Math.abs(Math.sin(st.tw)) * 0.6;
        ctx.beginPath(); ctx.arc(st.x - mx * 7, st.y - my * 4, st.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(230,240,255,${a})`; ctx.fill();
      });

      // 3) Güneş huzmeleri (yalnız açık mod) — yeşil-altın yumuşak ışık
      if (P.rays) {
        const rayRot = t * 0.0005;
        rays.forEach((ray) => {
          const a = ray.angle + rayRot;
          const len = Math.max(W, H) * ray.length;
          const grad = ctx.createLinearGradient(s.x, s.y, s.x + Math.cos(a) * len, s.y + Math.sin(a) * len);
          grad.addColorStop(0, `hsla(72,90%,72%,0.18)`);
          grad.addColorStop(1, 'transparent');
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(a);
          ctx.beginPath(); const w = len * ray.width;
          ctx.moveTo(0, -w); ctx.lineTo(len, -w * 3.4); ctx.lineTo(len, w * 3.4); ctx.lineTo(0, w);
          ctx.closePath(); ctx.fillStyle = grad; ctx.fill(); ctx.restore();
        });
      }

      // 4) Atmosferik sis (ufuk derinliği — ferahlık)
      const mist = ctx.createLinearGradient(0, H * 0.5, 0, H * 0.72);
      mist.addColorStop(0, 'transparent'); mist.addColorStop(0.5, P.mist); mist.addColorStop(1, 'transparent');
      ctx.fillStyle = mist; ctx.fillRect(0, H * 0.5, W, H * 0.22);

      // 5) Gökcismi — koyu modda YUMUŞAK AY, açık modda parlak GÜNEŞ
      const pulse = 1 + Math.sin(t * 0.02) * (isDark ? 0.025 : 0.06);
      const sunR = Math.min(W, H) * 0.078 * pulse;
      if (isDark) {
        // Yumuşak ay: gümüşi hale + disk (ilkbahar gecesi hissi)
        const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR * 6);
        glow.addColorStop(0, `hsla(230,60%,90%,${P.sunHaloA})`);
        glow.addColorStop(0.32, 'hsla(240,50%,82%,0.16)');
        glow.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR * 6, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
        const moon = ctx.createRadialGradient(s.x - sunR * 0.3, s.y - sunR * 0.3, sunR * 0.1, s.x, s.y, sunR);
        moon.addColorStop(0, P.sunCore); moon.addColorStop(0.55, P.sunMid); moon.addColorStop(1, P.sunEdge);
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.fillStyle = moon;
        ctx.shadowColor = P.sunGlow; ctx.shadowBlur = 38; ctx.fill(); ctx.shadowBlur = 0;
        // Kraterler (ay yüzeyi dokusu) — diskin içinde clip'li, hafif mor-gri gölge
        ctx.save();
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.clip();
        const craters = [
          { dx: -0.30, dy: -0.14, r: 0.17 }, { dx: 0.24, dy: 0.12, r: 0.23 }, { dx: 0.03, dy: -0.36, r: 0.11 },
          { dx: -0.16, dy: 0.34, r: 0.14 }, { dx: 0.38, dy: -0.26, r: 0.10 }, { dx: -0.42, dy: 0.16, r: 0.09 },
        ];
        craters.forEach((c) => {
          const cx = s.x + c.dx * sunR, cy = s.y + c.dy * sunR, cr = c.r * sunR;
          // ışık aşağı-sağdan geldiği için gölge sol-üste düşer (radial offset)
          const cg = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, 0, cx, cy, cr);
          cg.addColorStop(0, 'rgba(158,150,192,0.34)'); cg.addColorStop(0.7, 'rgba(130,124,168,0.24)'); cg.addColorStop(1, 'transparent');
          ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
        });
        ctx.restore();
        // Ay ışığı huzmesi — çimen/sahneye düşen YUMUŞAK dikey gümüşi-mor sütun (deniz yok)
        if (P.moonReflA > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          // 1) Ana dikey huzme: aydan aşağı doğru genişleyip zayıflar, hafif titreşir
          const beamTop = s.y + sunR * 0.6;
          const beamBot = H;
          for (let y = beamTop; y < beamBot; y += 6) {
            const prog = (y - beamTop) / (beamBot - beamTop);   // 0 üst, 1 alt
            const halfW = sunR * (0.6 + prog * 2.6);            // aşağı indikçe yumuşakça genişler
            const shimmer = reduceMotion ? 0 : Math.sin(y * 0.05 + t * 0.02) * (1.5 + prog * 4);
            const cx = s.x + shimmer;
            const alpha = P.moonReflA * (1 - prog * 0.85)
              * (0.7 + (reduceMotion ? 0.3 : Math.abs(Math.sin(y * 0.12 + t * 0.03)) * 0.3));
            const g = ctx.createLinearGradient(cx - halfW, y, cx + halfW, y);
            g.addColorStop(0, 'transparent');
            g.addColorStop(0.5, `hsla(258,80%,90%,${alpha})`);
            g.addColorStop(1, 'transparent');
            ctx.fillStyle = g;
            ctx.fillRect(cx - halfW, y, halfW * 2, 3);
          }
          // 2) Sahneye yayılan çok yumuşak gümüşi-mor ışık yıkaması (ferahlık için hafif)
          const wash = ctx.createRadialGradient(s.x, s.y, sunR, s.x, H, Math.max(W, H) * 0.85);
          wash.addColorStop(0, `hsla(250,70%,86%,${P.moonReflA * 0.5})`);
          wash.addColorStop(0.5, `hsla(268,60%,74%,${P.moonReflA * 0.18})`);
          wash.addColorStop(1, 'transparent');
          ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      } else {
        // Neşeli güneş: yeşil-altın halo + disk
        const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR * 6);
        halo.addColorStop(0, `hsla(72,95%,80%,${P.sunHaloA})`);
        halo.addColorStop(0.3, `hsla(90,90%,72%,${P.sunHaloA * 0.35})`);
        halo.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR * 6, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
        const disk = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR);
        disk.addColorStop(0, P.sunCore); disk.addColorStop(0.55, P.sunMid); disk.addColorStop(1, P.sunEdge);
        ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.fillStyle = disk;
        ctx.shadowColor = P.sunGlow; ctx.shadowBlur = 48; ctx.fill(); ctx.shadowBlur = 0;
      }

      // 6) Bahar yağmuru (ince yarı saydam eğik çizgiler, ferah)
      ctx.save();
      ctx.lineWidth = 1;
      drops.forEach((d) => {
        if (!reduceMotion) { d.y += d.speed; d.x += d.slant; }
        if (d.y > H + d.len) { d.y = -d.len; d.x = Math.random() * W; }
        if (d.x > W + 10) d.x = -10;
        const g = ctx.createLinearGradient(d.x, d.y, d.x - d.slant * 3, d.y - d.len);
        g.addColorStop(0, `hsla(${P.rainHue},70%,${isDark ? 78 : 88}%,${P.rainAlpha * d.alpha})`);
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.slant * 3, d.y - d.len); ctx.stroke();
      });
      ctx.restore();

      // 7) Uzak taç yapraklar (derinlik < 0.4) — çimenin arkasında kalsın
      petals.forEach((p) => {
        if (p.depth >= 0.4) return;
        if (!reduceMotion) {
          p.y += p.speedY; p.sway += p.swaySpeed; p.rot += p.rotSpeed;
          p.x += Math.sin(p.sway) * 0.6 + p.drift;
        }
        if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
        if (p.x > W + p.size) p.x = -p.size;
        if (p.x < -p.size) p.x = W + p.size;
        const sx = p.spin * (0.5 + Math.abs(Math.sin(p.sway * 1.3)) * 0.7);   // 3B dönme
        const c = `hsla(${p.hue.h},${p.hue.s}%,${p.hue.l}%,${P.petalAlpha * (0.5 + p.depth)})`;
        // uzak taç yapraklar hafif parallax ile kayar (derinlikle ölçekli)
        drawPetal(p.x - mx * 5, p.y - my * 3, p.size, p.rot, sx, c, P.glowPetal, `hsla(${p.hue.h},90%,70%,0.6)`);
      });

      // 8) Kelebekler (çimenin arkasında, sahne ortasında uçar)
      butterflies.forEach((b) => {
        if (!reduceMotion) {
          b.x += b.speed; b.flap += b.flapSpeed; b.phase += 0.02;
          b.y += Math.sin(b.phase) * 0.8;                 // dalgalı uçuş
          // KELEBEK MERAKI: fare yakınsa yönünü hafifçe fareye doğru bük ("merak ediyor")
          if (scene.pointer.active) {
            const ddx = scene.pointer.px - b.x, ddy = scene.pointer.py - b.y;
            const dist = Math.hypot(ddx, ddy);
            if (dist < 180 && dist > 1) {
              // yatayda hıza az kuvvet, dikeyde konumu nazikçe fareye kaydır (doğal kalsın)
              b.speed += ((ddx > 0 ? 0.5 : 0.2) - b.speed) * 0.02;
              b.y += (ddy / dist) * 0.5;
            }
          }
        }
        if (b.x > W + 20) { b.x = -20; b.y = H * (0.35 + Math.random() * 0.4); }
        const wing = Math.abs(Math.sin(b.flap));           // 0..1 kanat açıklığı
        const bw = b.size * (0.4 + wing * 0.8);
        const bodyA = isDark ? 0.85 : 0.9;
        // gövde
        ctx.strokeStyle = `hsla(${b.hue},40%,${isDark ? 30 : 25}%,${bodyA})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(b.x, b.y - b.size * 0.5); ctx.lineTo(b.x, b.y + b.size * 0.5); ctx.stroke();
        // kanatlar (yansımalı çift, çırpan) + desen noktaları
        [-1, 1].forEach((dir) => {
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x + dir * bw, b.y, bw * 1.2);
          g.addColorStop(0, `hsla(${b.hue},80%,${isDark ? 70 : 74}%,0.95)`);
          g.addColorStop(1, `hsla(${b.hue + 20},70%,${isDark ? 55 : 62}%,0.35)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.quadraticCurveTo(b.x + dir * bw, b.y - b.size, b.x + dir * bw * 1.1, b.y - b.size * 0.1);
          ctx.quadraticCurveTo(b.x + dir * bw * 0.9, b.y + b.size * 0.8, b.x, b.y + b.size * 0.2);
          ctx.closePath(); ctx.fill();
          // kanat üzeri desen: üst kanatta koyu benek + parlak highlight nokta (kanat açıklığıyla ölçekli)
          if (wing > 0.25) {
            const upX = b.x + dir * bw * 0.62, upY = b.y - b.size * 0.32;
            const spot = b.size * 0.16 * (0.6 + wing * 0.6);
            // koyu benek (kontrast desen)
            ctx.beginPath(); ctx.arc(upX, upY, spot, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${b.hue - 30},70%,${isDark ? 32 : 30}%,0.55)`; ctx.fill();
            // parlak highlight (canlılık)
            ctx.beginPath(); ctx.arc(upX - dir * spot * 0.5, upY - spot * 0.4, spot * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(50,100%,${isDark ? 88 : 96}%,0.75)`; ctx.fill();
            // alt kanatta küçük ikinci benek
            const loX = b.x + dir * bw * 0.5, loY = b.y + b.size * 0.42;
            ctx.beginPath(); ctx.arc(loX, loY, spot * 0.62, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${b.hue + 40},75%,${isDark ? 78 : 82}%,0.6)`; ctx.fill();
          }
        });
      });

      // 9) Dalgalı ÇİMEN silüeti (alt, esintiyle sallanan) — 2 katman parallax
      const grassLayers = [
        { baseY: 0.9, h: 70, freq: 0.02, amp: 8, spd: 0.02, l: P.grassL, a: P.grassAlpha },
        { baseY: 0.94, h: 95, freq: 0.016, amp: 12, spd: 0.015, l: P.grassL - 8, a: P.grassAlpha * 0.85 },
      ];
      grassLayers.forEach((gl, gi) => {
        const phase = t * gl.spd;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 4) {
          const wobble = Math.sin(x * gl.freq + phase) * gl.amp + Math.sin(x * gl.freq * 2.3 - phase * 1.4) * (gl.amp * 0.4);
          const y = H * gl.baseY + wobble;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H); ctx.closePath();
        const g = ctx.createLinearGradient(0, H * gl.baseY - gl.h, 0, H);
        g.addColorStop(0, `hsla(${P.grassHue},${P.grassS}%,${gl.l + 10}%,${gl.a})`);
        g.addColorStop(1, `hsla(${P.grassHue + 6},${P.grassS - 8}%,${gl.l - 6}%,${gl.a})`);
        ctx.fillStyle = g; ctx.fill();

        // ön katmana çim bıçakları (esintiyle eğik)
        if (gi === 1) {
          for (let x = 0; x <= W; x += 14) {
            const sway = Math.sin(x * 0.03 + phase * 1.6) * 6;
            const bh = 16 + Math.abs(Math.sin(x * 0.7)) * 14;
            const rootY = H * gl.baseY + Math.sin(x * gl.freq + phase) * gl.amp;
            ctx.beginPath();
            ctx.moveTo(x, rootY);
            ctx.quadraticCurveTo(x + sway * 0.5, rootY - bh * 0.6, x + sway, rootY - bh);
            ctx.strokeStyle = `hsla(${P.grassHue},${P.grassS}%,${gl.l + 6}%,${gl.a * 0.8})`;
            ctx.lineWidth = 1.6; ctx.stroke();
          }
        }
      });

      // 10) Açan ÇİÇEKLER (çimen üstünde, hafif sallanır)
      flowers.forEach((fl) => {
        if (!reduceMotion) { fl.sway += fl.swaySpeed; fl.breath += fl.breathSpeed; }
        const swayX = Math.sin(fl.sway) * 6;
        const topX = fl.x + swayX;
        const topY = fl.yBase - fl.stem;
        // çok hafif "nefes" — taç açılıp kapanır gibi (abartısız)
        const breathe = 1 + (reduceMotion ? 0 : Math.sin(fl.breath) * 0.06);
        const fsize = fl.size * breathe;
        // sap
        ctx.beginPath();
        ctx.moveTo(fl.x, fl.yBase);
        ctx.quadraticCurveTo(fl.x + swayX * 0.5, fl.yBase - fl.stem * 0.55, topX, topY);
        ctx.strokeStyle = `hsla(${P.grassHue},${P.grassS + 5}%,${P.grassL + 8}%,0.95)`;
        ctx.lineWidth = 2.4; ctx.stroke();
        // yaprak (sapta)
        ctx.save();
        ctx.translate(fl.x + swayX * 0.4, fl.yBase - fl.stem * 0.5);
        ctx.rotate(0.5 + Math.sin(fl.sway) * 0.1);
        ctx.beginPath();
        ctx.ellipse(6, 0, 9, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${P.grassHue},${P.grassS}%,${P.grassL + 6}%,0.9)`;
        ctx.fill();
        ctx.restore();
        // 5 taç yaprak (daire düzeni) + sarı orta
        const ph = fl.petalHue;
        for (let k = 0; k < 5; k++) {
          const ang = (Math.PI * 2 * k) / 5 - Math.PI / 2 + Math.sin(fl.sway) * 0.05;
          const px = topX + Math.cos(ang) * fsize * 0.62;
          const py = topY + Math.sin(ang) * fsize * 0.62;
          const grad = ctx.createRadialGradient(px, py, 0, px, py, fsize * 0.7);
          grad.addColorStop(0, `hsla(${ph.h},${ph.s}%,${ph.l + 8}%,0.98)`);
          grad.addColorStop(1, `hsla(${ph.h - 8},${ph.s}%,${ph.l - 8}%,0.85)`);
          ctx.beginPath();
          ctx.ellipse(px, py, fsize * 0.5, fsize * 0.36, ang, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.shadowColor = `hsla(${ph.h},90%,72%,${isDark ? 0.5 : 0.3})`;
          ctx.shadowBlur = isDark ? 10 : 6;
          ctx.fill(); ctx.shadowBlur = 0;
        }
        // sarı orta
        const cg = ctx.createRadialGradient(topX, topY, 0, topX, topY, fsize * 0.42);
        cg.addColorStop(0, '#fffbeb'); cg.addColorStop(0.6, P.bloomCenter); cg.addColorStop(1, `hsla(${fl.centerHue},90%,50%,0.9)`);
        ctx.beginPath(); ctx.arc(topX, topY, fsize * 0.4, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
      });

      // 10.5) ARILAR — çiçek tepeleri arasında zigzag uçan küçük sarı-siyah karakter
      bees.forEach((b) => {
        if (!reduceMotion) {
          // hedef çiçeğin tepe noktasına yönel
          const fl = flowers[b.target];
          const tx = fl.x + Math.sin(fl.sway) * 6;
          const ty = fl.yBase - fl.stem;
          let dx = tx - b.x, dy = ty - b.y;
          const d = Math.hypot(dx, dy) || 1;
          // hedefe doğru hızlanma + zigzag salınımı (dik yönde ekle)
          b.zig += b.zigSpeed;
          const perpX = -dy / d, perpY = dx / d;           // hareket yönüne dik
          const wobble = Math.sin(b.zig) * b.speed * 1.3;  // zigzag genliği
          b.vx += ((dx / d) * b.speed + perpX * wobble - b.vx) * 0.12;
          b.vy += ((dy / d) * b.speed + perpY * wobble - b.vy) * 0.12;
          b.x += b.vx; b.y += b.vy;
          b.wing += b.wingSpeed;
          // hedefe ulaşınca yeni çiçek seç ("çiçekten çiçeğe")
          if (d < 26) { b.target = Math.floor(Math.random() * flowerCount); }
        }
        const angle = Math.atan2(b.vy, b.vx);
        const wingOpen = 0.35 + Math.abs(Math.sin(b.wing)) * 0.65; // titreşen kanat
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(angle);
        // kanatlar (üstte, yarı saydam, hızlı titreşen çift)
        ctx.fillStyle = `hsla(210,30%,${isDark ? 82 : 92}%,${0.35 + wingOpen * 0.25})`;
        [-1, 1].forEach((dir) => {
          ctx.beginPath();
          ctx.ellipse(-b.size * 0.1, dir * b.size * 0.5 * wingOpen, b.size * 0.7, b.size * 0.34, dir * 0.5, 0, Math.PI * 2);
          ctx.fill();
        });
        // gövde: sarı taban + siyah şeritler (oval)
        ctx.beginPath();
        ctx.ellipse(0, 0, b.size, b.size * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(48,95%,${isDark ? 60 : 55}%,0.96)`;
        ctx.fill();
        ctx.fillStyle = `hsla(30,20%,${isDark ? 12 : 8}%,0.9)`;
        for (let sgi = -1; sgi <= 1; sgi++) {
          ctx.beginPath();
          ctx.ellipse(sgi * b.size * 0.42, 0, b.size * 0.16, b.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // baş (ön uçta koyu nokta)
        ctx.beginPath();
        ctx.arc(b.size * 0.9, 0, b.size * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(30,20%,${isDark ? 14 : 10}%,0.92)`;
        ctx.fill();
        ctx.restore();
      });

      // 11) Yakın taç yapraklar (derinlik >= 0.4) — çimen ve çiçeklerin önünde
      petals.forEach((p) => {
        if (p.depth < 0.4) return;
        if (!reduceMotion) {
          p.y += p.speedY; p.sway += p.swaySpeed; p.rot += p.rotSpeed;
          p.x += Math.sin(p.sway) * 0.6 + p.drift;
          // FARE İTİŞİ: fareye yakın uçan yakın taç yapraklar hafifçe savrulur (ucuz)
          if (scene.pointer.active) {
            const ddx = p.x - scene.pointer.px, ddy = p.y - scene.pointer.py;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < 10000 && d2 > 1) {                    // < ~100px
              const dist = Math.sqrt(d2);
              const force = (1 - dist / 100) * 2.4;        // yakınlıkla artan itiş
              p.x += (ddx / dist) * force;
              p.y += (ddy / dist) * force;
            }
          }
        }
        if (p.y > H + p.size) { p.y = -p.size; p.x = Math.random() * W; }
        if (p.x > W + p.size) p.x = -p.size;
        if (p.x < -p.size) p.x = W + p.size;
        const sx = p.spin * (0.5 + Math.abs(Math.sin(p.sway * 1.3)) * 0.7);
        const c = `hsla(${p.hue.h},${p.hue.s}%,${p.hue.l}%,${P.petalAlpha})`;
        drawPetal(p.x, p.y, p.size, p.rot, sx, c, P.glowPetal, `hsla(${p.hue.h},90%,70%,0.7)`);
      });

      // 12) Parlak polen / ışıltı toz (parallax + twinkle, yukarı süzülür)
      pollen.forEach((pl) => {
        if (!reduceMotion) { pl.y -= pl.speed; pl.wobble += pl.wobbleSpeed; pl.twPhase += pl.wobbleSpeed * 1.7; pl.x += Math.sin(pl.wobble) * 0.4; }
        if (pl.y < -pl.radius) { pl.y = H + pl.radius; pl.x = Math.random() * W; }
        // iki fazlı twinkle → daha canlı, düzensiz kıvılcım; derinlikle parlaklık kademeli
        const twinkle = 0.3 + Math.abs(Math.sin(pl.wobble)) * 0.4 + Math.abs(Math.sin(pl.twPhase)) * 0.28;
        const depthA = 0.45 + pl.depth * 0.55;        // uzak = soluk, yakın = parlak
        const L = pl.hue === 55 ? 70 : 78;
        // hafif parallax (uzak polen daha çok kayar → derinlik hissi)
        const plx = pl.x - mx * 4 * (1 - pl.depth * 0.5);
        const ply = pl.y - my * 2.5 * (1 - pl.depth * 0.5);
        // yakın (parlak) parçacıklarda yumuşak dış hale → katmanlı derinlik
        if (pl.depth > 0.55) {
          const halo = ctx.createRadialGradient(plx, ply, 0, plx, ply, pl.radius * 3.2);
          halo.addColorStop(0, `hsla(${pl.hue},100%,${L}%,${twinkle * P.pollenAlpha * depthA * 0.5})`);
          halo.addColorStop(1, 'transparent');
          ctx.beginPath(); ctx.arc(plx, ply, pl.radius * 3.2, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(plx, ply, pl.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${pl.hue},100%,${L}%,${twinkle * P.pollenAlpha * depthA})`;
        ctx.shadowColor = `hsla(${pl.hue},100%,72%,0.7)`; ctx.shadowBlur = 5 + pl.depth * 5; ctx.fill(); ctx.shadowBlur = 0;
      });

      // 13) Bloom — tüm sahneye yumuşak ışık yıkaması (kaynaktan)
      const bloom = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(W, H) * 0.9);
      bloom.addColorStop(0, P.bloom); bloom.addColorStop(1, 'transparent');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H); ctx.restore();

      // 13.5) TIKLAMA DALGASI — taze yeşil/mor ışık halkası + kısa saçılma hissi (vinyet öncesi)
      if (scene.ripples.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        scene.ripples.forEach((rp) => {
          const a = rp.life / rp.maxLife;              // ömürle sönen alpha
          // ana genişleyen halka (ilkbahar: taze yeşil + mor iki tonlu)
          ctx.lineWidth = 2.5 * a + 0.5;
          ctx.strokeStyle = `hsla(140,80%,66%,${a * 0.55})`;
          ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = `hsla(285,80%,72%,${a * 0.4})`;
          ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r * 0.72, 0, Math.PI * 2); ctx.stroke();
          // merkez taze parıltı
          const cg = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, rp.r * 0.6);
          cg.addColorStop(0, `hsla(90,95%,80%,${a * 0.3})`);
          cg.addColorStop(1, 'transparent');
          ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r * 0.6, 0, Math.PI * 2); ctx.fill();
          // taç yaprak/polen saçılması hissi — halka çevresinde birkaç kıvılcım
          const sparks = 6;
          for (let i = 0; i < sparks; i++) {
            const ang = (Math.PI * 2 * i) / sparks + rp.r * 0.03;
            const sr = rp.r * (0.85 + (i % 2) * 0.2);
            const sxp = rp.x + Math.cos(ang) * sr, syp = rp.y + Math.sin(ang) * sr;
            ctx.beginPath(); ctx.arc(sxp, syp, 1.4 + a * 1.6, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${i % 2 ? 285 : 120},95%,74%,${a * 0.55})`;
            ctx.fill();
          }
        });
        ctx.restore();
      }

      // 14) Sinematik vinyet (kenar koyulaşma → odak)
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vig.addColorStop(0, 'transparent'); vig.addColorStop(1, `rgba(0,0,0,${P.vignette})`);
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // 15) AÇILIŞ FADE-IN — ilk karelerde sahne siyahtan yumuşakça belirir (vinyet sonrası)
      if (scene.intro.v < 1) {
        ctx.fillStyle = 'rgba(0,0,0,' + (1 - scene.intro.v) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      t++;
      if (!reduceMotion) animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('resize', resize); };
  }, [isDark, reduceMotion, scene]);

  return (
    <>
      <canvas ref={canvasRef} className={cn('fixed inset-0 z-0 pointer-events-none', className)} />
      {children}
    </>
  );
}
