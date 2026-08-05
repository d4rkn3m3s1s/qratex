'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * Sonbahar teması — sinematik, "efsanevi" seviye animasyonlu arka plan.
 * Açık ve koyu modlar KESKİN ayrışır:
 *  • Açık mod (sonbahar gündüzü): krem-altın gökyüzü + yumuşak turuncu güneş + sıcak pus.
 *  • Koyu mod (sonbahar akşamı): sıcak koyu kahve-bordo gökyüzü + puslu turuncu batımı + altın ışık.
 * Katmanlar: atmosfer gradyanı, puslu güneş (halo+disk), uzak ağaç silüetleri, düşen dönen
 *   yapraklar (çok katmanlı parallax), altın toz parçacıkları (twinkle), buğulanan kahve fincanı,
 *   yerde dağınık yaprak yığını, bloom ışık yıkaması, sinematik vinyet.
 * Palet: #FDF8E1 krem, #991B1B koyu kızıl, #451A03 kahve, #EA580C turuncu, #d97706 amber.
 * prefers-reduced-motion'a saygılı; DPR-ölçekli (retina keskinliği).
 */
interface AutumnBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function AutumnBackground({ children, className }: AutumnBackgroundProps) {
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
          // Sonbahar akşamı: sıcak koyu kahve → bordo → derin kahverengi gökyüzü.
          sky: [
            { at: 0, c: '#1a0d02' }, { at: 0.3, c: '#451A03' }, { at: 0.56, c: '#6e2418' },
            { at: 0.78, c: '#991B1B' }, { at: 1, c: '#2a1006' },
          ],
          sunCore: '#ffe6b0', sunMid: '#f59e42', sunEdge: '#EA580C', sunHaloA: 0.5, sunGlow: 'rgba(234,88,12,0.9)',
          // Yaprak renkleri (koyu modda biraz daha derin/sıcak)
          leafHues: ['#EA580C', '#c2410c', '#991B1B', '#b45309', '#7c2d12'],
          treeColor: 'rgba(20,10,4,0.72)', treeGlow: 'hsla(28,90%,55%,0.35)',
          groundLeaf: 'rgba(60,24,8,0.55)', dustHue: 34, dustL: 66, dustAlpha: 0.85,
          steam: 'rgba(255,220,170,0.20)', mist: 'rgba(120,50,15,0.22)',
          bloom: 'rgba(234,120,40,0.06)', vignette: 0.6, horizonGlow: 'rgba(234,88,12,0.28)',
        }
      : {
          // Sonbahar gündüzü: krem-altın berrak gökyüzü.
          sky: [
            { at: 0, c: '#fce9b8' }, { at: 0.32, c: '#FDF8E1' }, { at: 0.58, c: '#ffedcf' },
            { at: 0.8, c: '#fbdca0' }, { at: 1, c: '#f6cf94' },
          ],
          sunCore: '#ffffff', sunMid: '#fde68a', sunEdge: '#f59e0b', sunHaloA: 0.66, sunGlow: 'rgba(251,191,36,0.9)',
          leafHues: ['#EA580C', '#f97316', '#d97706', '#b91c1c', '#a16207'],
          treeColor: 'rgba(120,53,15,0.42)', treeGlow: 'hsla(35,95%,60%,0.4)',
          groundLeaf: 'rgba(180,83,9,0.4)', dustHue: 44, dustL: 74, dustAlpha: 0.6,
          steam: 'rgba(255,255,255,0.24)', mist: 'rgba(255,225,170,0.2)',
          bloom: 'rgba(255,220,150,0.055)', vignette: 0.3, horizonGlow: 'rgba(251,191,36,0.22)',
        };

    const sunPos = () => ({ x: W * 0.74, y: H * (isDark ? 0.4 : 0.24) });

    // ── Düşen yapraklar (çok katmanlı parallax, ~40 yaprak) ───────
    interface Leaf {
      x: number; y: number;
      size: number; depth: number;         // depth → parallax hız/boyut
      color: string; shape: number;        // 0: quadratic yaprak, 1: akçaağaç benzeri
      vy: number; drift: number;           // düşme hızı + rüzgar sürüklenme
      rot: number; rotSpeed: number;       // düzlem-içi dönüş (yaprak kendi ekseninde)
      // Gerçekçi düşüş için ayrı 3B eksenler:
      sway: number; swaySpeed: number; swayAmp: number;   // helezonik yatay salınım
      flip: number; flipSpeed: number;     // ön/arka yüz devrilmesi (perspektif yassılaşma)
      tilt: number; tiltSpeed: number;     // yana yatma (pandül)
    }
    const leaves: Leaf[] = Array.from({ length: 40 }, () => {
      const depth = Math.random();
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        size: 7 + depth * 15,
        depth,
        color: P.leafHues[Math.floor(Math.random() * P.leafHues.length)],
        shape: Math.random() < 0.5 ? 0 : 1,
        vy: 0.28 + depth * 0.95,
        drift: (0.2 + depth * 0.7) * (Math.random() < 0.5 ? 1 : -1),
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.012 + Math.random() * 0.02,
        swayAmp: 18 + Math.random() * 34,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: 0.02 + Math.random() * 0.05,
        tilt: Math.random() * Math.PI * 2,
        tiltSpeed: 0.015 + Math.random() * 0.03,
      };
    });

    // Rüzgar global fazı (tüm yapraklara ortak dürtü)
    let windPhase = 0;

    // ── Yerdeki dağınık yaprak silüetleri (statik, alt kenar) ─────
    const groundLeaves = Array.from({ length: 26 }, () => ({
      x: Math.random() * W,
      y: H * (0.9 + Math.random() * 0.09),
      size: 8 + Math.random() * 16,
      rot: Math.random() * Math.PI * 2,
      color: P.leafHues[Math.floor(Math.random() * P.leafHues.length)],
    }));

    // ── Uzak ağaç silüetleri (dallı, dal uçlarında SABİT asılı yapraklar) ──
    // Yapraklar bir kez üretilir (deterministik) — her karede random ÜRETİLMEZ,
    // böylece "yanıp sönme/titreme" olmaz; yalnızca rüzgarla hafifçe sallanır.
    interface HangLeaf { ox: number; oy: number; r: number; color: string; phase: number; }
    interface Sub { ang: number; len: number; hang: HangLeaf[]; }
    interface Tree { x: number; scale: number; branches: { ang: number; len: number; sub: Sub[] }[]; }
    const trees: Tree[] = Array.from({ length: 5 }, (_, i) => {
      const branchCount = 3 + Math.floor(Math.random() * 3);
      return {
        x: W * (0.06 + i * 0.2 + (Math.random() - 0.5) * 0.05),
        scale: 0.7 + Math.random() * 0.6,
        branches: Array.from({ length: branchCount }, () => ({
          ang: -Math.PI / 2 + (Math.random() - 0.5) * 1.4,
          len: 40 + Math.random() * 55,
          sub: Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => ({
            ang: (Math.random() - 0.5) * 1.1,
            len: 18 + Math.random() * 30,
            // dal ucunda 2-4 sabit yaprak (konum/renk baştan belirlenir)
            hang: Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({
              ox: (Math.random() - 0.5) * 10,
              oy: (Math.random() - 0.5) * 8,
              r: 2.5 + Math.random() * 2.5,
              color: P.leafHues[Math.floor(Math.random() * P.leafHues.length)],
              phase: Math.random() * Math.PI * 2,
            })),
          })),
        })),
      };
    });

    // ── Altın toz parçacıkları (güneş ışığında süzülen, twinkle) ──
    interface Dust { x: number; y: number; r: number; speed: number; wobble: number; wobbleSpeed: number; drift: number; }
    const dust: Dust[] = Array.from({ length: 60 }, () => {
      const depth = Math.random();
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.5 + depth * 2.2,
        speed: 0.1 + depth * 0.4,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.012 + Math.random() * 0.03,
        drift: (Math.random() - 0.3) * 0.3,
      };
    });

    let animationId = 0;
    let t = 0;

    // Yaprak şekli çizici — merkeze göre, önceden save/translate/rotate yapılmış olmalı.
    const drawLeafShape = (size: number, shape: number, color: string) => {
      ctx.fillStyle = color;
      if (shape === 0) {
        // İki quadratic eğri ile klasik yaprak formu.
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.quadraticCurveTo(size * 0.85, -size * 0.2, 0, size);
        ctx.quadraticCurveTo(-size * 0.85, -size * 0.2, 0, -size);
        ctx.closePath();
        ctx.fill();
        // Damar ağı: orta damar + simetrik yan damarlar (gerçekçilik).
        ctx.strokeStyle = 'rgba(60,24,8,0.32)';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(0.6, size * 0.07);
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.85);
        ctx.lineTo(0, size * 0.85);
        ctx.stroke();
        // yan damarlar (orta damardan dışa doğru 3 çift)
        ctx.lineWidth = Math.max(0.4, size * 0.04);
        ctx.beginPath();
        for (let v = 1; v <= 3; v++) {
          const vy = -size * 0.6 + v * size * 0.4;
          const reach = size * (0.55 - v * 0.08);
          ctx.moveTo(0, vy);
          ctx.lineTo(reach, vy - reach * 0.5);
          ctx.moveTo(0, vy);
          ctx.lineTo(-reach, vy - reach * 0.5);
        }
        ctx.stroke();
      } else {
        // Akçaağaç benzeri: 5 dilim çıkıntı (basit ama tanınır).
        ctx.beginPath();
        const lobes = 5;
        for (let i = 0; i <= lobes; i++) {
          const a = -Math.PI / 2 + (i / lobes) * Math.PI * 2 * 0.72 - Math.PI * 0.72 / 2 + Math.PI / 2;
          const ang = -Math.PI / 2 - 0.9 + (i / lobes) * 1.8;
          const tipX = Math.cos(ang) * size;
          const tipY = Math.sin(ang) * size;
          const midAng = ang + 0.18;
          const midX = Math.cos(midAng) * size * 0.4;
          const midY = Math.sin(midAng) * size * 0.4;
          if (i === 0) ctx.moveTo(0, size * 0.3);
          ctx.quadraticCurveTo(midX, midY, tipX, tipY);
          ctx.quadraticCurveTo(midX, midY, 0, size * 0.3);
        }
        ctx.closePath();
        ctx.fill();
        // sap
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.8, size * 0.1);
        ctx.beginPath();
        ctx.moveTo(0, size * 0.3);
        ctx.lineTo(0, size * 0.9);
        ctx.stroke();
      }
    };

    const draw = () => {
      const s = sunPos();
      if (!reduceMotion) windPhase += 0.008;
      // Yumuşak esen rüzgar (0..1 arası dalgalanır → estikçe yapraklar hızlanır)
      const gust = 0.5 + Math.sin(windPhase) * 0.5 + Math.sin(windPhase * 0.37) * 0.3;

      // 1) Gökyüzü atmosfer gradyanı (dikey)
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      for (const stop of P.sky) sky.addColorStop(stop.at, stop.c);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // 2) Ufuk sıcaklık parıltısı (güneş batımı hissi)
      const horizonY = H * (isDark ? 0.52 : 0.6);
      const hg = ctx.createLinearGradient(0, horizonY - H * 0.22, 0, horizonY + H * 0.1);
      hg.addColorStop(0, 'transparent'); hg.addColorStop(0.6, P.horizonGlow); hg.addColorStop(1, 'transparent');
      ctx.fillStyle = hg; ctx.fillRect(0, horizonY - H * 0.22, W, H * 0.32);

      // 3) Ana gökcismi — puslu sonbahar güneşi (halo + disk)
      const pulse = 1 + Math.sin(t * 0.018) * (isDark ? 0.04 : 0.06);
      const sunR = Math.min(W, H) * 0.078 * pulse;
      const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR * 7);
      halo.addColorStop(0, `rgba(255,200,120,${P.sunHaloA})`);
      halo.addColorStop(0.25, `rgba(240,150,70,${P.sunHaloA * 0.4})`);
      halo.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(s.x, s.y, sunR * 7, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
      const disk = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sunR);
      disk.addColorStop(0, P.sunCore); disk.addColorStop(0.55, P.sunMid); disk.addColorStop(1, P.sunEdge);
      ctx.beginPath(); ctx.arc(s.x, s.y, sunR, 0, Math.PI * 2); ctx.fillStyle = disk;
      ctx.shadowColor = P.sunGlow; ctx.shadowBlur = 55; ctx.fill(); ctx.shadowBlur = 0;

      // 4) Atmosferik sonbahar pusu (ufuk derinliği, yumuşak)
      const mist = ctx.createLinearGradient(0, H * 0.48, 0, H * 0.74);
      mist.addColorStop(0, 'transparent'); mist.addColorStop(0.5, P.mist); mist.addColorStop(1, 'transparent');
      ctx.fillStyle = mist; ctx.fillRect(0, H * 0.48, W, H * 0.28);

      // 5) Uzak ağaç silüetleri (parallax arka plan — dallı, sonbahar)
      trees.forEach((tr) => {
        const baseY = H * 0.86;
        ctx.save();
        ctx.translate(tr.x, baseY);
        ctx.scale(tr.scale, tr.scale);
        // gövde
        ctx.strokeStyle = P.treeColor;
        ctx.lineCap = 'round';
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -70); ctx.stroke();
        // dallar + alt dallar
        tr.branches.forEach((b) => {
          const bx = Math.cos(b.ang) * b.len;
          const by = -70 + Math.sin(b.ang) * b.len;
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(bx, by); ctx.stroke();
          b.sub.forEach((sb) => {
            const sx = bx + Math.cos(b.ang + sb.ang) * sb.len;
            const sy = by + Math.sin(b.ang + sb.ang) * sb.len;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
            // dal ucunda SABİT asılı yapraklar — random üretilmez, sadece
            // rüzgarla küçük genlikte sallanır (yanıp sönme/titreme yok).
            sb.hang.forEach((hl) => {
              const wob = reduceMotion ? 0 : Math.sin(t * 0.022 + hl.phase) * 1.6 * gust;
              const wy = reduceMotion ? 0 : Math.cos(t * 0.02 + hl.phase) * 0.7 * gust;
              ctx.beginPath();
              ctx.arc(sx + hl.ox + wob, sy + hl.oy + wy, hl.r, 0, Math.PI * 2);
              ctx.fillStyle = hl.color;
              ctx.globalAlpha = 0.8;
              ctx.fill();
              ctx.globalAlpha = 1;
            });
          });
        });
        // ağaç etrafında sıcak glow
        ctx.restore();
      });

      // 6) Altın toz parçacıkları (arka orta katman, twinkle + süzülme)
      dust.forEach((d) => {
        if (!reduceMotion) {
          d.y -= d.speed;
          d.wobble += d.wobbleSpeed;
          d.x += Math.sin(d.wobble) * 0.35 + d.drift * gust;
        }
        if (d.y < -4) { d.y = H + 4; d.x = Math.random() * W; }
        if (d.x < -4) d.x = W + 4; if (d.x > W + 4) d.x = -4;
        const twinkle = 0.35 + Math.abs(Math.sin(d.wobble)) * 0.55;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${P.dustHue},95%,${P.dustL}%,${twinkle * P.dustAlpha})`;
        ctx.shadowColor = `hsla(${P.dustHue},100%,65%,0.7)`; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
      });

      // 7) DÜŞEN YAPRAKLAR — gerçekçi 3B düşüş fiziği:
      //    • Helezonik yatay salınım (sway) — yaprak sağa-sola süzülür.
      //    • Yatay hız salınıma bağlı (düşüş yolu S çizer, düz düşmez).
      //    • flip → ön/arka yüz devrilmesi ⇒ yatayda genişlik daralır (perspektif).
      //    • tilt → yana yatma (pandül), düzlem-içi rot ile birleşir.
      leaves.forEach((lf) => {
        if (!reduceMotion) {
          lf.sway += lf.swaySpeed;
          lf.flip += lf.flipSpeed;
          lf.tilt += lf.tiltSpeed;
          // düşerken S-yörüngesi: yatay hız salınımın türevine bağlı
          lf.y += lf.vy + gust * lf.depth * 0.5;
          lf.x += Math.cos(lf.sway) * (lf.swayAmp * lf.swaySpeed) + lf.drift * gust * 0.6;
          lf.rot += lf.rotSpeed;
        }
        // ekrandan çıkınca üstten geri döngü
        if (lf.y > H + lf.size * 2) { lf.y = -lf.size * 2; lf.x = Math.random() * W; }
        if (lf.x > W + lf.size * 2) lf.x = -lf.size * 2;
        if (lf.x < -lf.size * 2) lf.x = W + lf.size * 2;

        ctx.save();
        ctx.translate(lf.x, lf.y);
        // düzlem-içi dönüş + yana yatma birlikte
        ctx.rotate(lf.rot + Math.sin(lf.tilt) * 0.5);
        // flip → yatayda daralma (yaprağın kenarına dönüp tekrar açılması).
        // |cos| kullanınca genişlik 0'a yaklaşır ama negatife düşmez → doğal çevrilme.
        const faceX = 0.25 + Math.abs(Math.cos(lf.flip)) * 0.75;
        const faceY = 0.8 + Math.abs(Math.sin(lf.sway)) * 0.2;
        ctx.scale(faceX, faceY);
        // yaprak kenara döndüğünde (faceX küçük) hafif kararsın → hacim hissi
        ctx.globalAlpha = (0.55 + lf.depth * 0.45) * (0.7 + faceX * 0.3);
        ctx.shadowColor = 'rgba(60,24,8,0.4)';
        ctx.shadowBlur = 4 + lf.depth * 4;
        drawLeafShape(lf.size, lf.shape, lf.color);
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      // 8) Yerde dağınık yaprak yığını (alt kenar silüetleri)
      const groundGrad = ctx.createLinearGradient(0, H * 0.88, 0, H);
      groundGrad.addColorStop(0, 'transparent');
      groundGrad.addColorStop(1, P.groundLeaf);
      ctx.fillStyle = groundGrad; ctx.fillRect(0, H * 0.88, W, H * 0.12);
      groundLeaves.forEach((gl) => {
        ctx.save();
        ctx.translate(gl.x, gl.y);
        ctx.rotate(gl.rot);
        ctx.globalAlpha = 0.5;
        drawLeafShape(gl.size, 0, gl.color);
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      // 9) Buğulanan KAHVE/ÇAY FİNCANI (sağ alt köşe, yükselen sin-dalgalı buhar)
      const cupX = W - 92, cupY = H - 70;
      ctx.save();
      // fincan gövdesi
      ctx.fillStyle = isDark ? 'rgba(30,15,6,0.9)' : 'rgba(120,53,15,0.85)';
      ctx.strokeStyle = isDark ? 'rgba(90,45,20,0.9)' : 'rgba(80,35,10,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cupX - 22, cupY - 14);
      ctx.lineTo(cupX + 22, cupY - 14);
      ctx.lineTo(cupX + 17, cupY + 20);
      ctx.quadraticCurveTo(cupX, cupY + 26, cupX - 17, cupY + 20);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // kulp
      ctx.beginPath();
      ctx.arc(cupX + 26, cupY + 2, 10, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      // sıcak içecek yüzeyi
      ctx.beginPath();
      ctx.ellipse(cupX, cupY - 14, 22, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? 'rgba(90,45,20,0.95)' : 'rgba(60,30,12,0.9)';
      ctx.fill();
      // yükselen buhar (2-3 sin-dalgalı iplik, lighter ile parlak)
      ctx.globalCompositeOperation = 'lighter';
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const sx0 = cupX - 12 + sIdx * 12;
        ctx.beginPath();
        for (let sy = 0; sy <= 60; sy += 4) {
          const phase = reduceMotion ? sIdx : t * 0.03 + sIdx * 1.3;
          const wave = Math.sin(sy * 0.12 + phase) * (6 + sy * 0.12);
          const px = sx0 + wave;
          const py = cupY - 16 - sy;
          if (sy === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        const steamGrad = ctx.createLinearGradient(0, cupY - 16, 0, cupY - 76);
        steamGrad.addColorStop(0, P.steam);
        steamGrad.addColorStop(1, 'transparent');
        ctx.strokeStyle = steamGrad;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.restore();

      // 10) Bloom — tüm sahneye sıcak altın ışık yıkaması (güneş merkezli)
      const bloom = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(W, H) * 0.95);
      bloom.addColorStop(0, P.bloom); bloom.addColorStop(1, 'transparent');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H); ctx.restore();

      // 11) Sinematik vinyet (kenar koyulaşma → odak)
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
