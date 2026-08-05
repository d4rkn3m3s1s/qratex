'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useSceneInteraction } from './use-scene-interaction';

/**
 * ICE KINGDOM (Buzul Krallığı) — efsanevi / AAA sinematik animasyonlu arka plan.
 * Tamamen prosedürel canvas 2D; harici asset yok.
 *
 * Açık ve koyu modlar KESKİN ayrışır:
 *  • Koyu mod (derin arktik gece): derin lacivert gökyüzü + görkemli çok-bantlı aurora
 *    + twinkle yıldızlar + kayan yıldız + kraterli soğuk parlak ay + gümüşi hale.
 *  • Açık mod (kar beyazı gündüz buzul krallığı): soğuk açık mavi-beyaz gökyüzü
 *    + yumuşak kış güneşi + aurora yok/çok hafif.
 *
 * Katmanlar:
 *  1. Çok katmanlı gökyüzü gradyanı.
 *  2. Aurora (koyu) — çok bantlı dalgalanan kuzey ışığı perdeleri (lighter).
 *  3. Yıldızlar (koyu, twinkle) + ara sıra kayan yıldız.
 *  4. Gökcismi: koyu = kraterli soğuk ay + gümüş hale; açık = yumuşak kış güneşi.
 *  5. Donmuş dağlar — katmanlı sisli silüetler (atmosferik perspektif + parallax).
 *  6. Buz kalesi silüeti — kristal sivri kuleler, kapı, donmuş köprü, kar örtüsü (İMZA öğe).
 *  7. Buz sarkıtları/sütunları — kaleye yakın parıldayan dikey buz.
 *  8. Kar örtüsü zemini (dalgalı parlayan).
 *  9. Çok katmanlı kar (3 derinlik parallax).
 * 10. Uçuşan buz kristalleri / frost dust (twinkle, yavaş yörünge).
 * 11. Bloom (soğuk mavi ışık yıkaması, lighter) + sinematik vinyet.
 *
 * Etkileşim (paylaşılan hook): fare parallax, fare frost izi (kristal kıvılcım),
 * tıklama buz şok dalgası, açılış fade-in.
 *
 * Palet: #0F172A arktik gece, #0EA5E9 donmuş mavi, #E0F2FE buz kristali,
 * #F0F9FF kar beyazı + glacier cyan / aurora mavisi / gümüş frost / hafif menekşe.
 * prefers-reduced-motion'a saygılı; DPR-ölçekli (retina keskinliği).
 */
interface IceKingdomBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function IceKingdomBackground({ children, className }: IceKingdomBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // reduceMotion gövdede hesaplanır ki etkileşim hook'unu koşulsuz çağırabilelim.
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Paylaşılan etkileşim + atmosfer altyapısı (fare parallax, itiş, tıklama dalgası, açılış fade-in).
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
      // Boyut değişince statik kale offscreen cache'ini yeniden üret.
      buildCastle();
    };

    // ── Moda göre KESKİN palet ────────────────────────────────────
    const P = isDark
      ? {
          // Derin arktik gece — koyu lacivert → donmuş mavi tonlar
          sky: [
            { at: 0, c: '#070d1e' }, { at: 0.3, c: '#0F172A' }, { at: 0.56, c: '#0d2540' },
            { at: 0.78, c: '#0b2036' }, { at: 1, c: '#081426' },
          ],
          orbCore: '#ffffff', orbMid: '#E0F2FE', orbEdge: '#a9c8e8',
          orbGlowA: 0.5, orbGlow: 'rgba(160,205,255,0.85)', orbShadow: 'rgba(190,220,255,0.85)',
          snowColor: '240,249,255', snowAlpha: 0.95,
          groundTop: '#1f3a5c', groundMid: '#123049', groundBot: '#0a1a2e', groundGlow: 'rgba(120,190,255,0.26)',
          // buz kalesi (koyu) — derin buz mavisi gövde, glacier cyan highlight
          castleFill: '#12324f', castleHi: '#1f5f86', castleShade: '#0a1f33',
          castleWin: 'rgba(120,210,255,0.9)', castleWinGlow: 'rgba(60,170,255,0.55)',
          // uzak dağlar (3 sıra, arkadan öne)
          mtnFar: '#132840', mtnMid: '#173350', mtnNear: '#0e2138',
          mtnSnow: 'rgba(220,240,255,0.55)',
          iceCol: 'rgba(160,225,255,0.8)', iceColShade: 'rgba(70,140,200,0.6)',
          crystalHue: 200, crystalL: 82, stars: true, aurora: true,
          bloom: 'rgba(60,150,235,0.07)', vignette: 0.56,
        }
      : {
          // Kar beyazı gündüz buzul krallığı — soğuk açık mavi-beyaz gökyüzü
          sky: [
            { at: 0, c: '#7fb8e6' }, { at: 0.3, c: '#a5d3ef' }, { at: 0.56, c: '#cfe8f8' },
            { at: 0.78, c: '#e6f4fd' }, { at: 1, c: '#F0F9FF' },
          ],
          orbCore: '#ffffff', orbMid: '#f4fbff', orbEdge: '#dcefff',
          orbGlowA: 0.55, orbGlow: 'rgba(235,248,255,0.9)', orbShadow: 'rgba(220,242,255,0.85)',
          snowColor: '255,255,255', snowAlpha: 0.92,
          groundTop: '#ffffff', groundMid: '#e7f3fc', groundBot: '#d0e6f6', groundGlow: 'rgba(255,255,255,0.65)',
          // buz kalesi (açık) — açık buz mavisi, beyaz highlight
          castleFill: '#bcdcf2', castleHi: '#e6f4fd', castleShade: '#8fb9da',
          castleWin: 'rgba(120,170,210,0.7)', castleWinGlow: 'rgba(140,190,230,0.3)',
          mtnFar: '#c3ddf1', mtnMid: '#aecfe9', mtnNear: '#9cc3e3',
          mtnSnow: 'rgba(255,255,255,0.85)',
          iceCol: 'rgba(200,235,255,0.75)', iceColShade: 'rgba(150,195,230,0.55)',
          crystalHue: 200, crystalL: 90, stars: false, aurora: false,
          bloom: 'rgba(255,255,255,0.06)', vignette: 0.22,
        };

    // Gökcismi konumu (ay/güneş) — üst-sağ.
    const orbPos = () => ({ x: W * 0.76, y: H * (isDark ? 0.2 : 0.18) });

    // ── Kar taneleri: 3 derinlik katmanı (parallax) ────────────────
    interface Flake { x: number; y: number; r: number; speed: number; drift: number; phase: number; phaseSpeed: number; depth: number; spin: number; spinSpeed: number; }
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
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 0.06,
      }));
    // ~123 tane, 3 katman: uzak-küçük-yavaş → yakın-büyük-hızlı
    const flakes: Flake[] = [
      ...makeFlakes(55, 0.25),
      ...makeFlakes(40, 0.6),
      ...makeFlakes(28, 1.0),
    ];

    // ── Yıldızlar (yalnız gece) ────────────────────────────────────
    const stars = P.stars
      ? Array.from({ length: 100 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.5, r: Math.random() * 1.4 + 0.3, tw: Math.random() * Math.PI * 2, twSpeed: 0.02 + Math.random() * 0.04 }))
      : [];

    // ── Kayan yıldız (comet) — gece, ara sıra geçen, uzun ışıltılı kuyruk ──
    const comet = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, timer: 120 + Math.random() * 260 };

    // ── Uçuşan buz kristali / frost dust (twinkle, tüm sahne, hafif yörünge) ──
    interface Crystal { x: number; y: number; r: number; tw: number; twSpeed: number; orb: number; orbSpeed: number; }
    const crystals: Crystal[] = Array.from({ length: 38 }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.88, r: 1 + Math.random() * 2.4,
      tw: Math.random() * Math.PI * 2, twSpeed: 0.02 + Math.random() * 0.05,
      orb: Math.random() * Math.PI * 2, orbSpeed: 0.003 + Math.random() * 0.006,
    }));

    // ── Fare FROST İZİ havuzu — fare hareket ettikçe beslenen kısa ömürlü kristaller ──
    interface Frost { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number; }
    const frostPool: Frost[] = [];
    const FROST_MAX = 40;
    let lastFx = -9999, lastFy = -9999;

    // ── Uzak dağlar — 3 sıra (atmosferik perspektif), her sıra jagged silüet ──
    interface Ridge { color: string; snow: string; baseY: number; amp: number; step: number; seed: number; par: number; }
    const ridges: Ridge[] = [
      { color: P.mtnFar,  snow: P.mtnSnow, baseY: 0.6,  amp: 0.16, step: 90, seed: 11.3, par: 3 },
      { color: P.mtnMid,  snow: P.mtnSnow, baseY: 0.66, amp: 0.2,  step: 70, seed: 27.7, par: 5 },
      { color: P.mtnNear, snow: P.mtnSnow, baseY: 0.72, amp: 0.24, step: 55, seed: 41.1, par: 7 },
    ];

    let animationId = 0;
    let t = 0;

    // Bir dağ sırası çiz — jagged tepeler + karlı zirveler (atmosferik perspektif).
    const drawRidge = (rg: Ridge, shift: number) => {
      const by = H * rg.baseY;
      const peaks: { x: number; y: number }[] = [];
      for (let x = -rg.step; x <= W + rg.step; x += rg.step) {
        // Deterministik pseudo-random tepe yüksekliği (seed'e bağlı, kararlı).
        const n = Math.sin(x * 0.021 + rg.seed) * 0.5 + Math.sin(x * 0.0071 + rg.seed * 2) * 0.5;
        const y = by - Math.abs(n) * H * rg.amp - H * 0.02;
        peaks.push({ x: x + shift, y });
      }
      // Silüet gövdesi
      ctx.beginPath();
      ctx.moveTo(peaks[0].x, H);
      ctx.lineTo(peaks[0].x, peaks[0].y);
      for (let i = 1; i < peaks.length; i++) ctx.lineTo(peaks[i].x, peaks[i].y);
      ctx.lineTo(peaks[peaks.length - 1].x, H);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, by - H * rg.amp, 0, by + 30);
      g.addColorStop(0, rg.color);
      g.addColorStop(1, isDark ? '#081426' : '#bcdcf2');
      ctx.fillStyle = g; ctx.fill();
      // Karlı zirve örtüsü — her tepe ucunda küçük beyaz üçgen.
      ctx.fillStyle = rg.snow;
      for (let i = 1; i < peaks.length - 1; i++) {
        const p = peaks[i];
        // Yalnız belirgin tepeler (komşularından yüksek olanlar).
        if (p.y < peaks[i - 1].y && p.y < peaks[i + 1].y) {
          const cap = rg.step * 0.34;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - cap, p.y + cap * 0.8);
          ctx.lineTo(p.x + cap, p.y + cap * 0.8);
          ctx.closePath();
          ctx.fill();
        }
      }
    };

    // ══════════════════════════════════════════════════════════════
    //  BUZ KALESİ — OFFSCREEN CACHE MİMARİSİ
    //  Kale statiktir (yalnız parallax kayar). Her karede baştan çizmek
    //  (5+ kule × pencere gradyanları + save/restore + composite) takılma
    //  yapar. Bu yüzden kaleyi BİR KEZ yüksek detayla offscreen canvas'a
    //  çizip draw()'da tek drawImage ile blit ederiz. Pencere parıltısı
    //  cache'e girmez; blit'ten sonra birkaç noktaya animasyonlu glow eklenir.
    // ══════════════════════════════════════════════════════════════
    let castleCanvas: HTMLCanvasElement | null = null;
    // Kalenin sahnedeki oturduğu taban y'si (blit hizası için) ve merkez x.
    let castleBaseY = 0, castleCenterX = 0;
    // Animasyonlu pencere/kapı parıltı noktaları (DÜNYA koordinatı, cache'e gömülmez).
    interface GlowPt { x: number; y: number; r: number; hue: number; sat: number; light: number; base: number; }
    let glowPoints: GlowPt[] = [];

    // Yardımcı: bir kule çiz (offscreen ctx'e). Zarif, ince, kristal buz kule:
    //  dikey buz damarları + sivri içbükey kristal külah + tepe karı + pencereler.
    //  octx: offscreen 2D bağlamı. bx: kule merkez x. baseY: kule tabanı (duvar üstü).
    //  tw: gövde genişliği. th: gövde yüksekliği. spireH: külah yüksekliği.
    const drawTowerOff = (
      octx: CanvasRenderingContext2D, bx: number, baseY: number,
      tw: number, th: number, spireH: number,
    ) => {
      const topY = baseY - th;             // gövde tepesi (külah başlangıcı)
      const hw = tw / 2;
      const L = bx - hw, R = bx + hw;

      // ── GÖVDE — yatay gradyan ile sol ışık kenarı → sağ gölge (hacim) ──
      const bodyG = octx.createLinearGradient(L, 0, R, 0);
      bodyG.addColorStop(0, P.castleHi);
      bodyG.addColorStop(0.16, P.castleFill);
      bodyG.addColorStop(0.62, P.castleFill);
      bodyG.addColorStop(1, P.castleShade);
      octx.fillStyle = bodyG;
      octx.fillRect(L, topY, tw, th);

      // ── DİKEY BUZ KRİSTALİ DAMARLARI — birkaç ince saydam açık şerit ──
      octx.save();
      octx.beginPath(); octx.rect(L, topY, tw, th); octx.clip();
      octx.globalCompositeOperation = isDark ? 'lighter' : 'source-over';
      const veins = 4;
      for (let v = 0; v < veins; v++) {
        const vx = L + tw * (0.2 + (v / (veins - 1)) * 0.62);
        const vw = tw * (v % 2 === 0 ? 0.05 : 0.03);
        const vg = octx.createLinearGradient(vx, topY, vx, baseY);
        const va = isDark ? 0.16 : 0.28;
        vg.addColorStop(0, `rgba(210,240,255,${va})`);
        vg.addColorStop(0.5, `rgba(190,230,255,${va * 0.5})`);
        vg.addColorStop(1, 'rgba(190,230,255,0)');
        octx.fillStyle = vg;
        octx.fillRect(vx - vw / 2, topY, vw, th);
      }
      // hafif buzul çatlak (ince eğik çizgi)
      octx.strokeStyle = isDark ? 'rgba(150,215,255,0.14)' : 'rgba(120,165,200,0.22)';
      octx.lineWidth = 1;
      octx.beginPath();
      octx.moveTo(L + tw * 0.34, topY + th * 0.12);
      octx.lineTo(L + tw * 0.5, topY + th * 0.5);
      octx.lineTo(L + tw * 0.42, baseY - th * 0.08);
      octx.stroke();
      octx.restore();

      // sağ kenar gölge şeridi (hacim vurgusu)
      octx.fillStyle = P.castleShade;
      octx.globalAlpha = isDark ? 0.5 : 0.35;
      octx.fillRect(R - tw * 0.12, topY, tw * 0.12, th);
      // sol kenar parlak ışık şeridi
      octx.fillStyle = P.castleHi;
      octx.globalAlpha = isDark ? 0.55 : 0.7;
      octx.fillRect(L, topY, tw * 0.1, th);
      octx.globalAlpha = 1;

      // ── SİVRİ KRİSTAL KÜLAH — içbükey kenarlı, zarif sivrilen (quadratic) ──
      const tipX = bx, tipY = topY - spireH;
      const sg = octx.createLinearGradient(0, tipY, 0, topY);
      sg.addColorStop(0, P.castleHi);
      sg.addColorStop(0.45, P.castleFill);
      sg.addColorStop(1, P.castleShade);
      octx.fillStyle = sg;
      octx.beginPath();
      octx.moveTo(L - tw * 0.08, topY);
      // sol kenar: hafif içbükey (kontrol noktası içeride)
      octx.quadraticCurveTo(bx - tw * 0.14, topY - spireH * 0.55, tipX, tipY);
      // sağ kenar
      octx.quadraticCurveTo(bx + tw * 0.14, topY - spireH * 0.55, R + tw * 0.08, topY);
      octx.closePath();
      octx.fill();
      // külah sol yüz highlight (kristal parıltı)
      octx.save();
      octx.clip();
      octx.fillStyle = P.castleHi;
      octx.globalAlpha = isDark ? 0.4 : 0.55;
      octx.beginPath();
      octx.moveTo(L - tw * 0.08, topY);
      octx.quadraticCurveTo(bx - tw * 0.14, topY - spireH * 0.55, tipX, tipY);
      octx.lineTo(bx - tw * 0.03, tipY + spireH * 0.12);
      octx.quadraticCurveTo(bx - tw * 0.2, topY - spireH * 0.4, L + tw * 0.06, topY);
      octx.closePath();
      octx.fill();
      octx.restore();

      // külah tepe karı — yumuşak yastık (quadratic), düz çizgi değil
      const capY = topY - spireH * 0.62;
      const capHw = tw * 0.2;
      octx.beginPath();
      octx.moveTo(tipX - capHw * 0.4, capY + capHw * 0.5);
      octx.quadraticCurveTo(tipX, capY - capHw * 0.5, tipX + capHw * 0.4, capY + capHw * 0.5);
      octx.quadraticCurveTo(tipX, capY + capHw * 0.9, tipX - capHw * 0.4, capY + capHw * 0.5);
      octx.closePath();
      octx.fillStyle = `rgba(${P.snowColor},${isDark ? 0.75 : 0.92})`;
      octx.fill();

      // külah ucunda küçük parlak buz noktası (statik parıltı)
      octx.save();
      octx.globalCompositeOperation = 'lighter';
      const tipG = octx.createRadialGradient(tipX, tipY, 0, tipX, tipY, tw * 0.28);
      tipG.addColorStop(0, isDark ? 'rgba(200,240,255,0.9)' : 'rgba(255,255,255,0.9)');
      tipG.addColorStop(1, 'transparent');
      octx.fillStyle = tipG;
      octx.beginPath(); octx.arc(tipX, tipY, tw * 0.28, 0, Math.PI * 2); octx.fill();
      octx.restore();

      // ── PENCERELER — ince kemerli buz pencereleri; konumları glow için kaydedilir ──
      const rows = Math.max(1, Math.floor(th / 30));
      const ww = Math.max(4, tw * 0.16), wh = ww * 1.9;
      for (let r = 0; r < rows; r++) {
        const wy = topY + 16 + r * (th - 22) / rows;
        if (wy > baseY - wh - 4) break;
        const wx = bx - ww / 2;
        // kemerli pencere gövdesi
        octx.beginPath();
        octx.moveTo(wx, wy + wh);
        octx.lineTo(wx, wy + ww * 0.5);
        octx.arc(bx, wy + ww * 0.5, ww / 2, Math.PI, 0);
        octx.lineTo(wx + ww, wy + wh);
        octx.closePath();
        octx.fillStyle = P.castleWin;
        octx.fill();
        // pencere kaydı (dünya koordinatı — blit'te taban hizalanır)
        glowPoints.push({
          x: bx, y: wy + wh * 0.5, r: ww * 1.7,
          hue: 205, sat: 90, light: isDark ? 65 : 78,
          base: isDark ? 0.5 : 0.22,
        });
      }
    };

    // BUZ KALESİ — offscreen canvas'a bir kez çizen ana kurulum.
    // Kaleyi tam W×H boyutunda bir offscreen'e DPR ölçekli çizer; draw()'da
    // parallax kayması için yalnız x-shift ile blit edilir.
    const buildCastle = () => {
      if (!W || !H) return;
      glowPoints = [];
      const off = document.createElement('canvas');
      off.width = Math.max(1, Math.floor(W * dpr));
      off.height = Math.max(1, Math.floor(H * dpr));
      const octx = off.getContext('2d');
      if (!octx) return;
      // Ana ctx gibi CSS px uzayında çalış (keskinlik için DPR ölçekle).
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Kalenin oturduğu taban — kar örtüsü dalgasının ortalama seviyesi (gy≈H*0.82).
      const gy = H * 0.82;
      const baseY = gy + 6;
      const cx = W * 0.5;
      castleBaseY = baseY;
      castleCenterX = cx;
      const scale = Math.min(1.05, Math.max(0.66, W / 1500));

      // ── ALT SUR (bağlayıcı duvar) — buz dokulu, zarif mazgallı ──
      const wallW = 250 * scale, wallH = 62 * scale;
      const wallX = cx - wallW / 2;
      const wallY = baseY - wallH;
      const wg = octx.createLinearGradient(wallX, 0, wallX + wallW, 0);
      wg.addColorStop(0, P.castleHi);
      wg.addColorStop(0.14, P.castleFill);
      wg.addColorStop(0.7, P.castleFill);
      wg.addColorStop(1, P.castleShade);
      octx.fillStyle = wg;
      octx.fillRect(wallX, wallY, wallW, wallH);
      // sur alt gölge (zemine oturma) + üst ışık
      const wgv = octx.createLinearGradient(0, wallY, 0, baseY);
      wgv.addColorStop(0, isDark ? 'rgba(120,200,255,0.12)' : 'rgba(255,255,255,0.3)');
      wgv.addColorStop(1, isDark ? 'rgba(5,15,30,0.4)' : 'rgba(120,160,200,0.28)');
      octx.fillStyle = wgv;
      octx.fillRect(wallX, wallY, wallW, wallH);
      // sur dikey buz damarları
      octx.save();
      octx.beginPath(); octx.rect(wallX, wallY, wallW, wallH); octx.clip();
      octx.strokeStyle = isDark ? 'rgba(160,220,255,0.1)' : 'rgba(130,170,205,0.2)';
      octx.lineWidth = 1;
      for (let vx = wallX + 14 * scale; vx < wallX + wallW; vx += 22 * scale) {
        octx.beginPath(); octx.moveTo(vx, wallY); octx.lineTo(vx, baseY); octx.stroke();
      }
      octx.restore();
      // zarif mazgallar (ince crenellation)
      octx.fillStyle = P.castleFill;
      const merlonW = 10 * scale, merlonH = 9 * scale;
      for (let mx2 = wallX + 4 * scale; mx2 < wallX + wallW - merlonW; mx2 += merlonW * 2.1) {
        octx.fillRect(mx2, wallY - merlonH, merlonW, merlonH);
        // mazgal sol ışık kenarı
        octx.fillStyle = P.castleHi; octx.globalAlpha = 0.5;
        octx.fillRect(mx2, wallY - merlonH, merlonW * 0.3, merlonH);
        octx.globalAlpha = 1; octx.fillStyle = P.castleFill;
      }
      // sur üstü yumuşak kar örtüsü (dalgalı yastık)
      octx.beginPath();
      octx.moveTo(wallX, wallY - merlonH + 1);
      for (let x = wallX; x <= wallX + wallW; x += 16 * scale) {
        const dip = Math.sin(x * 0.08) * 1.5 * scale;
        octx.quadraticCurveTo(x + 4 * scale, wallY - merlonH - 3 * scale + dip, x + 8 * scale, wallY - merlonH + 1);
      }
      octx.lineTo(wallX + wallW, wallY - merlonH + 4 * scale);
      octx.lineTo(wallX, wallY - merlonH + 4 * scale);
      octx.closePath();
      octx.fillStyle = `rgba(${P.snowColor},${isDark ? 0.55 : 0.88})`;
      octx.fill();

      // ── KEMERLİ ANA KAPI — gece içten mavi parıltı ──
      const gw = 34 * scale, gh = 46 * scale;
      const gx = cx - gw / 2;
      const gTop = baseY - gh;
      octx.beginPath();
      octx.moveTo(gx, baseY);
      octx.lineTo(gx, gTop + gw * 0.5);
      octx.arc(cx, gTop + gw * 0.5, gw / 2, Math.PI, 0);
      octx.lineTo(gx + gw, baseY);
      octx.closePath();
      const doorG = octx.createLinearGradient(0, gTop, 0, baseY);
      if (isDark) {
        doorG.addColorStop(0, '#123a5c');
        doorG.addColorStop(0.5, '#0a2540');
        doorG.addColorStop(1, '#04101f');
      } else {
        doorG.addColorStop(0, '#89b3d6');
        doorG.addColorStop(1, '#5c86ac');
      }
      octx.fillStyle = doorG;
      octx.fill();
      // kapı kemeri buz kenarı (highlight çerçeve)
      octx.strokeStyle = isDark ? 'rgba(140,215,255,0.4)' : 'rgba(255,255,255,0.6)';
      octx.lineWidth = 1.5 * scale;
      octx.beginPath();
      octx.moveTo(gx, baseY);
      octx.lineTo(gx, gTop + gw * 0.5);
      octx.arc(cx, gTop + gw * 0.5, gw / 2, Math.PI, 0);
      octx.lineTo(gx + gw, baseY);
      octx.stroke();
      // kapı iç parıltısı için glow noktası kaydet (gece belirgin, gündüz soluk)
      glowPoints.push({
        x: cx, y: baseY - gh * 0.42, r: gw * 1.1,
        hue: 205, sat: 92, light: isDark ? 60 : 80,
        base: isDark ? 0.7 : 0.18,
      });

      // ── KADEMELİ KULE SİLÜETİ — merkeze doğru artan piramidal, zarif/ince ──
      //    Arkadan öne: en dış kısa kuleler → içteki uzun kuleler → ana kule.
      //    (5 kule; simetrik, yükseklikler merkeze doğru artar)
      drawTowerOff(octx, cx - 100 * scale, wallY + 6 * scale, 26 * scale, 64 * scale, 40 * scale);
      drawTowerOff(octx, cx + 100 * scale, wallY + 6 * scale, 26 * scale, 64 * scale, 40 * scale);
      drawTowerOff(octx, cx - 56 * scale, wallY, 30 * scale, 104 * scale, 56 * scale);
      drawTowerOff(octx, cx + 56 * scale, wallY, 30 * scale, 104 * scale, 56 * scale);
      // ANA (en yüksek, en zarif) kule — ince gövde, uzun kristal külah
      drawTowerOff(octx, cx, wallY - 4 * scale, 40 * scale, 150 * scale, 84 * scale);

      // ── AY IŞIĞI / GÜN IŞIĞI KENAR HIGHLIGHT — sol siluet kenarına ince parlaklık ──
      octx.save();
      octx.globalCompositeOperation = 'lighter';
      octx.fillStyle = isDark ? 'rgba(150,210,255,0.05)' : 'rgba(255,255,255,0.08)';
      octx.fillRect(wallX - 4, wallY - 200 * scale, 6, baseY - (wallY - 200 * scale));
      octx.restore();

      castleCanvas = off;
    };

    // Kurulum: ilk boyutlandırma (kaleyi de üretir) + resize dinleyici.
    resize();
    window.addEventListener('resize', resize);

    // Donmuş köprü — kalenin önünde, kar örtüsü üstüne uzanan kemerli buz köprü.
    const drawBridge = (groundY: number, shift: number) => {
      const cx = W * 0.5 + shift;
      const scale = Math.min(1.15, Math.max(0.7, W / 1400));
      const by = groundY;
      const bw = 180 * scale;
      const arcH = 26 * scale;
      ctx.save();
      // Köprü tablası (hafif kemerli, buz dokulu)
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, by);
      ctx.quadraticCurveTo(cx, by - arcH, cx + bw / 2, by);
      ctx.lineTo(cx + bw / 2, by + 9 * scale);
      ctx.quadraticCurveTo(cx, by - arcH + 9 * scale, cx - bw / 2, by + 9 * scale);
      ctx.closePath();
      const bg = ctx.createLinearGradient(cx, by - arcH, cx, by + 9 * scale);
      bg.addColorStop(0, P.castleHi);
      bg.addColorStop(0.5, P.castleFill);
      bg.addColorStop(1, P.castleShade);
      ctx.fillStyle = bg; ctx.fill();
      // İnce korkuluk direkleri (buz balustrad)
      ctx.strokeStyle = P.castleShade;
      ctx.lineWidth = 1.4 * scale;
      for (let i = 1; i < 8; i++) {
        const px = cx - bw / 2 + (i / 8) * bw;
        const arc = by - Math.sin((i / 8) * Math.PI) * arcH;
        ctx.beginPath();
        ctx.moveTo(px, arc);
        ctx.lineTo(px, arc - 6 * scale);
        ctx.stroke();
      }
      // Korkuluk üst rayı
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, by - 6 * scale);
      ctx.quadraticCurveTo(cx, by - arcH - 6 * scale, cx + bw / 2, by - 6 * scale);
      ctx.strokeStyle = P.castleHi;
      ctx.lineWidth = 1.6 * scale;
      ctx.stroke();
      // Üst yumuşak kar örtüsü
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2, by);
      ctx.quadraticCurveTo(cx, by - arcH, cx + bw / 2, by);
      ctx.strokeStyle = `rgba(${P.snowColor},${isDark ? 0.55 : 0.9})`;
      ctx.lineWidth = 3.2 * scale;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    };

    // Buz sarkıtları/sütunları — bir hattaki dikey parıldayan buz (kaleye yakın önplan).
    const drawIcicles = (x0: number, topY: number, count: number, spread: number) => {
      ctx.save();
      for (let i = 0; i < count; i++) {
        const ix = x0 + (i / Math.max(1, count - 1)) * spread;
        const len = 18 + (Math.sin(ix * 0.7 + 3) * 0.5 + 0.5) * 34;
        const wdt = 4 + (Math.sin(ix * 1.3) * 0.5 + 0.5) * 4;
        ctx.beginPath();
        ctx.moveTo(ix - wdt / 2, topY);
        ctx.lineTo(ix + wdt / 2, topY);
        ctx.lineTo(ix, topY + len);
        ctx.closePath();
        const g = ctx.createLinearGradient(ix, topY, ix, topY + len);
        g.addColorStop(0, P.iceCol);
        g.addColorStop(1, P.iceColShade);
        ctx.fillStyle = g;
        ctx.fill();
        // uç parıltısı (twinkle)
        const tw = reduceMotion ? 0.5 : 0.35 + Math.abs(Math.sin(t * 0.04 + ix)) * 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(200,240,255,${tw * 0.6})`;
        ctx.beginPath();
        ctx.arc(ix, topY + len, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    };

    const draw = () => {
      // Etkileşim durumunu bir adım ilerlet (parallax, ripple ömrü, açılış fade-in).
      scene.step();
      const mx = scene.pointer.x, my = scene.pointer.y;
      const pxp = scene.pointer.px, pyp = scene.pointer.py, pActive = scene.pointer.active;

      const o = orbPos();
      // Gökcismi parallax kaydırması.
      const ox = o.x + mx * 10, oy = o.y + my * 6;

      // 1) Gökyüzü
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      for (const stop of P.sky) sky.addColorStop(stop.at, stop.c);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

      // 2) Yıldızlar (gece) — uzak katman, hafif parallax (mx*7)
      if (P.stars) {
        stars.forEach((st) => {
          if (!reduceMotion) st.tw += st.twSpeed;
          const a = 0.3 + Math.abs(Math.sin(st.tw)) * 0.65;
          ctx.beginPath(); ctx.arc(st.x + mx * 7, st.y + my * 4, st.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(240,249,255,${a})`; ctx.fill();
        });
      }

      // 2b) Kayan yıldız (gece) — parlak baş + uzun ışıltılı kuyruk
      if (isDark && !reduceMotion) {
        if (!comet.active) {
          comet.timer--;
          if (comet.timer <= 0) {
            comet.active = true;
            comet.x = -60; comet.y = H * (0.06 + Math.random() * 0.22);
            const ang = 0.2 + Math.random() * 0.14;
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
          const tg = ctx.createLinearGradient(comet.x, comet.y, tx, ty);
          tg.addColorStop(0, 'rgba(200,235,255,0.9)');
          tg.addColorStop(0.4, 'rgba(90,180,255,0.35)');
          tg.addColorStop(1, 'transparent');
          ctx.strokeStyle = tg; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo((comet.x + tx) / 2, (comet.y + ty) / 2); ctx.stroke();
          const hg = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, 10);
          hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.5, 'rgba(200,235,255,0.8)'); hg.addColorStop(1, 'transparent');
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(comet.x, comet.y, 10, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (comet.x > W + tailLen || comet.life <= 0) { comet.active = false; comet.timer = 260 + Math.random() * 520; }
        }
      }

      // 3) AURORA (gece) — çok bantlı görkemli kuzey ışığı perdesi (mavi-cyan-menekşe)
      //    Orta katman: parallax mx*12.
      if (P.aurora) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const aShift = mx * 12;
        const bands = 5;
        const hues = [190, 200, 175, 215, 265]; // cyan → glacier → aurora mavi → hafif menekşe
        for (let b = 0; b < bands; b++) {
          const baseY = H * (0.1 + b * 0.06) + my * 5;
          const hue = hues[b % hues.length];
          const drop = 110 + b * 8; // perde yüksekliği
          ctx.beginPath();
          ctx.moveTo(0 + aShift, baseY);
          for (let x = 0; x <= W; x += 12) {
            const y = baseY
              + Math.sin(x * 0.004 + t * 0.006 + b) * 34
              + Math.sin(x * 0.011 - t * 0.004 + b * 2) * 16
              + Math.sin(x * 0.02 + t * 0.003 + b * 3) * 8;
            ctx.lineTo(x + aShift, y);
          }
          ctx.lineTo(W + aShift, baseY - drop);
          ctx.lineTo(0 + aShift, baseY - drop);
          ctx.closePath();
          const ag = ctx.createLinearGradient(0, baseY - drop, 0, baseY + 40);
          ag.addColorStop(0, 'transparent');
          ag.addColorStop(0.5, `hsla(${hue},85%,60%,${b === 4 ? 0.08 : 0.13})`);
          ag.addColorStop(0.85, `hsla(${hue},90%,66%,0.05)`);
          ag.addColorStop(1, 'transparent');
          ctx.fillStyle = ag; ctx.fill();
          // dikey ışık ışınları (perde dokusu) — ince parlak çizgiler
          ctx.strokeStyle = `hsla(${hue},90%,72%,0.05)`;
          ctx.lineWidth = 1;
          for (let x = 0; x <= W; x += 46) {
            const rayShift = Math.sin(x * 0.01 + t * 0.004 + b) * 20;
            ctx.beginPath();
            ctx.moveTo(x + aShift + rayShift, baseY - drop);
            ctx.lineTo(x + aShift + rayShift * 0.4, baseY);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // 4) Gökcismi — gece: kraterli soğuk parlak ay; gündüz: yumuşak kış güneşi
      const pulse = 1 + Math.sin(t * 0.02) * (isDark ? 0.025 : 0.05);
      const orbR = Math.min(W, H) * 0.072 * pulse;
      // hale
      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbR * 6);
      glow.addColorStop(0, isDark ? `hsla(205,80%,86%,${P.orbGlowA})` : `hsla(200,90%,90%,${P.orbGlowA})`);
      glow.addColorStop(0.3, isDark ? 'hsla(205,65%,74%,0.18)' : 'hsla(200,80%,82%,0.26)');
      glow.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(ox, oy, orbR * 6, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      // disk
      const disk = ctx.createRadialGradient(ox - orbR * 0.3, oy - orbR * 0.3, orbR * 0.1, ox, oy, orbR);
      disk.addColorStop(0, P.orbCore); disk.addColorStop(0.6, P.orbMid); disk.addColorStop(1, P.orbEdge);
      ctx.beginPath(); ctx.arc(ox, oy, orbR, 0, Math.PI * 2); ctx.fillStyle = disk;
      ctx.shadowColor = P.orbShadow; ctx.shadowBlur = 42; ctx.fill(); ctx.shadowBlur = 0;
      // ay kraterleri (yalnız gece)
      if (isDark) {
        ctx.save();
        ctx.beginPath(); ctx.arc(ox, oy, orbR, 0, Math.PI * 2); ctx.clip();
        const craters = [
          { dx: -0.25, dy: -0.12, r: 0.16 }, { dx: 0.2, dy: 0.14, r: 0.2 }, { dx: 0.08, dy: -0.32, r: 0.1 },
          { dx: -0.18, dy: 0.3, r: 0.13 }, { dx: 0.36, dy: -0.24, r: 0.09 },
        ];
        craters.forEach((c) => {
          const cx2 = ox + c.dx * orbR, cy2 = oy + c.dy * orbR, cr = c.r * orbR;
          const cg = ctx.createRadialGradient(cx2 - cr * 0.3, cy2 - cr * 0.3, 0, cx2, cy2, cr);
          cg.addColorStop(0, 'rgba(150,180,215,0.4)'); cg.addColorStop(0.7, 'rgba(110,145,190,0.28)'); cg.addColorStop(1, 'transparent');
          ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI * 2); ctx.fillStyle = cg; ctx.fill();
        });
        ctx.restore();
      }

      // 5) DONMUŞ DAĞLAR — 3 sıra, atmosferik perspektif, parallax (arkadan öne artar).
      ridges.forEach((rg) => drawRidge(rg, mx * rg.par));

      // 5b) UZAK kar katmanı (küçük/yavaş) — dağ ile örtü arasında
      flakes.filter((f) => f.depth < 0.4).forEach((f) => {
        if (!reduceMotion) { f.y += f.speed; f.phase += f.phaseSpeed; f.x += Math.sin(f.phase) * f.drift; }
        if (f.y > H + f.r) { f.y = -f.r; f.x = Math.random() * W; }
        if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${P.snowColor},${P.snowAlpha * 0.5})`; ctx.fill();
      });

      // 6) BUZ KALESİ + köprü — ufuk hattı (kar örtüsünün hemen üstüne oturur).
      //    Dağlardan biraz daha belirgin parallax (mx*6).
      //    Kale STATİK offscreen cache'ten TEK drawImage ile blit edilir (ucuz);
      //    yalnız parallax x-shift + yüzey dalgası y-offset uygulanır.
      const gy = H * 0.82;
      const castleShift = mx * 6;
      {
        const cbx = W * 0.5;
        // Kalenin oturduğu yüzey y'si (dalgalı) ve cache'in üretildiği taban farkı.
        const surfY = gy + Math.sin(cbx * 0.006 + t * 0.004) * 14 + Math.sin(cbx * 0.017 - t * 0.002) * 6;
        const dy = (surfY + 6) - castleBaseY; // cache tabanını canlı yüzeye hizala

        // ── STATİK KALE BLİT (offscreen cache) ──
        if (castleCanvas) {
          ctx.drawImage(castleCanvas, castleShift, dy, W, H);
        }

        // ── ANİMASYONLU PENCERE/KAPI PARILTISI — blit'ten SONRA, birkaç nokta ──
        //    (statik cache'e gömülmez; ucuz ~her nokta için küçük radial glow)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < glowPoints.length; i++) {
          const gp = glowPoints[i];
          // reduceMotion'da flicker sabit; aksi halde sin ile hafif titreşim.
          const flick = reduceMotion ? 1 : 0.72 + Math.sin(t * 0.05 + i * 1.7) * 0.28;
          const px = gp.x + castleShift, py = gp.y + dy;
          const gg = ctx.createRadialGradient(px, py, 0, px, py, gp.r);
          gg.addColorStop(0, `hsla(${gp.hue},${gp.sat}%,${gp.light}%,${gp.base * flick})`);
          gg.addColorStop(0.6, `hsla(${gp.hue},${gp.sat}%,${gp.light}%,${gp.base * flick * 0.35})`);
          gg.addColorStop(1, 'transparent');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(px, py, gp.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        drawBridge(surfY, castleShift);
      }

      // 7) Kar örtüsü (dalgalı parlayan zemin) — kaleyi ufka gömer.
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

      // 7b) Gökcismi yansıması — kar örtüsüne düşen soğuk mavi ışık sütunu.
      {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const startY = gy;
        for (let y = startY; y < H; y += 5) {
          const prog = (y - startY) / (H - startY);
          const halfW = orbR * (0.45 + prog * 2.6);
          const shimmer = reduceMotion ? 0 : Math.sin(y * 0.14 + t * 0.05) * (2 + prog * 5);
          const cx2 = ox + shimmer;
          const flick = reduceMotion ? 1 : (0.6 + Math.abs(Math.sin(y * 0.3 + t * 0.04)) * 0.4);
          const alpha = (isDark ? 0.16 : 0.2) * (1 - prog) * flick;
          const g = ctx.createLinearGradient(cx2 - halfW, y, cx2 + halfW, y);
          g.addColorStop(0, 'transparent');
          g.addColorStop(0.5, `hsla(200,90%,${isDark ? 82 : 90}%,${alpha})`);
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.fillRect(cx2 - halfW, y, halfW * 2, 2.5);
        }
        ctx.restore();
      }

      // 7c) Buz sarkıtları/sütunları — kaleye yakın önplan, örtü üstünde iki hat.
      {
        const surfL = gy + Math.sin(W * 0.16 * 0.006 + t * 0.004) * 14;
        drawIcicles(W * 0.1, surfL - 4, 7, W * 0.12);
        const surfR = gy + Math.sin(W * 0.82 * 0.006 + t * 0.004) * 14;
        drawIcicles(W * 0.78, surfR - 4, 7, W * 0.12);
      }

      // 8) YAKIN kar katmanları (orta + büyük/hızlı) — ön planda + fare rüzgarı/itişi + döner.
      flakes.filter((f) => f.depth >= 0.4).forEach((f) => {
        if (!reduceMotion) {
          f.y += f.speed;
          f.phase += f.phaseSpeed;
          f.spin += f.spinSpeed;
          f.x += Math.sin(f.phase) * f.drift + Math.sin(t * 0.005) * 0.4 * f.depth + mx * 0.6 * f.depth;
          // FARE İTİŞİ: en yakın kar (depth>=0.6) ve fare aktifken.
          if (pActive && f.depth >= 0.6) {
            const dx = f.x - pxp, dy = f.y - pyp;
            const d2 = dx * dx + dy * dy;
            if (d2 < 90 * 90 && d2 > 0.01) {
              const d = Math.sqrt(d2);
              const force = (1 - d / 90) * 2.2;
              f.x += (dx / d) * force;
              f.y += (dy / d) * force;
            }
          }
        }
        if (f.y > H + f.r) { f.y = -f.r; f.x = Math.random() * W; }
        if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
        const a = P.snowAlpha * (0.6 + f.depth * 0.4);
        if (f.depth >= 0.9) {
          // büyük yakın taneler: 6-kollu kristal (döner, parıldar)
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.spin);
          ctx.strokeStyle = `rgba(${P.snowColor},${a})`;
          ctx.lineWidth = 1;
          ctx.shadowColor = `rgba(${P.snowColor},0.8)`;
          ctx.shadowBlur = 6;
          const rr = f.r * 1.7;
          for (let k = 0; k < 3; k++) {
            const ang = (k / 3) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(-Math.cos(ang) * rr, -Math.sin(ang) * rr);
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
            ctx.stroke();
          }
          ctx.restore();
          ctx.shadowBlur = 0;
        } else {
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${P.snowColor},${a})`;
          ctx.fill();
        }
      });

      // 9) Uçuşan buz kristali / frost dust — twinkle + yavaş yörünge (4-kollu kıvılcım)
      crystals.forEach((c) => {
        if (!reduceMotion) { c.tw += c.twSpeed; c.orb += c.orbSpeed; }
        const tw = 0.25 + Math.abs(Math.sin(c.tw)) * 0.75;
        const cxp = c.x + Math.cos(c.orb) * 8 + mx * 2;
        const cyp = c.y + Math.sin(c.orb) * 6 + my * 2;
        ctx.save();
        ctx.translate(cxp, cyp);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `hsla(${P.crystalHue},90%,${P.crystalL}%,${tw})`;
        ctx.lineWidth = 1;
        ctx.shadowColor = `hsla(${P.crystalHue},90%,80%,${tw})`;
        ctx.shadowBlur = 6;
        const rr = c.r * (0.7 + tw * 0.6);
        ctx.beginPath();
        ctx.moveTo(-rr * 2.4, 0); ctx.lineTo(rr * 2.4, 0);
        ctx.moveTo(0, -rr * 2.4); ctx.lineTo(0, rr * 2.4);
        ctx.moveTo(-rr, -rr); ctx.lineTo(rr, rr);
        ctx.moveTo(rr, -rr); ctx.lineTo(-rr, rr);
        ctx.stroke();
        ctx.restore();
      });

      // 9b) FARE FROST İZİ — fare hareket ettikçe o noktaya sönen kristal kıvılcımları bırak.
      if (pActive && !reduceMotion) {
        const moved = (pxp - lastFx) * (pxp - lastFx) + (pyp - lastFy) * (pyp - lastFy);
        if (moved > 9 && frostPool.length < FROST_MAX) {
          const n = 1 + (Math.random() < 0.5 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            frostPool.push({
              x: pxp + (Math.random() - 0.5) * 10,
              y: pyp + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 0.7,
              vy: (Math.random() - 0.5) * 0.7 - 0.2,
              life: 22 + Math.random() * 16,
              maxLife: 38,
              r: 1 + Math.random() * 1.6,
            });
          }
          lastFx = pxp; lastFy = pyp;
        }
      }
      if (frostPool.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = frostPool.length - 1; i >= 0; i--) {
          const fp = frostPool[i];
          if (!reduceMotion) { fp.x += fp.vx; fp.y += fp.vy; fp.life -= 1; }
          const lifeT = Math.max(0, fp.life / fp.maxLife);
          if (fp.life <= 0) { frostPool.splice(i, 1); continue; }
          const a = lifeT * 0.9;
          ctx.strokeStyle = `hsla(200,95%,85%,${a})`;
          ctx.lineWidth = 1;
          ctx.shadowColor = 'hsla(200,95%,80%,0.9)';
          ctx.shadowBlur = 6;
          const rr = fp.r * (0.6 + lifeT * 0.8);
          ctx.beginPath();
          ctx.moveTo(fp.x - rr, fp.y); ctx.lineTo(fp.x + rr, fp.y);
          ctx.moveTo(fp.x, fp.y - rr); ctx.lineTo(fp.x, fp.y + rr);
          ctx.stroke();
        }
        ctx.restore();
        ctx.shadowBlur = 0;
      }

      // 10) Bloom — soğuk mavi ışık yıkaması (gökcisminden yayılan)
      const bloom = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(W, H) * 0.9);
      bloom.addColorStop(0, P.bloom); bloom.addColorStop(1, 'transparent');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H); ctx.restore();

      // 10b) TIKLAMA — BUZ ŞOK DALGASI: genişleyen buz-mavisi halka(lar) + kristal saçılması.
      if (scene.ripples.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        scene.ripples.forEach((rp) => {
          const lifeT = rp.life / rp.maxLife; // 1→0
          const a = lifeT * 0.6;
          // ana buz halkası
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(198,95%,${isDark ? 80 : 72}%,${a})`;
          ctx.lineWidth = 2 + lifeT * 2;
          ctx.shadowColor = 'hsla(200,95%,82%,0.9)';
          ctx.shadowBlur = 16 * lifeT;
          ctx.stroke();
          ctx.shadowBlur = 0;
          // ikinci ince iç halka
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, rp.r * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(210,100%,90%,${a * 0.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          // kristal saçılması — halka çevresinde 8 dönen buz kıvılcımı
          const sparks = 8;
          for (let i = 0; i < sparks; i++) {
            const ang = (i / sparks) * Math.PI * 2 + rp.maxLife * 0.4;
            const sx = rp.x + Math.cos(ang) * rp.r;
            const sy = rp.y + Math.sin(ang) * rp.r;
            // küçük 4-kollu kristal
            const sr = (1.6 * lifeT + 0.6);
            ctx.strokeStyle = `hsla(200,95%,88%,${a * 1.1})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - sr, sy); ctx.lineTo(sx + sr, sy);
            ctx.moveTo(sx, sy - sr); ctx.lineTo(sx, sy + sr);
            ctx.stroke();
          }
        });
        ctx.restore();
      }

      // 11) Sinematik vinyet (kenar koyulaşma → odak)
      const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vig.addColorStop(0, 'transparent'); vig.addColorStop(1, `rgba(0,0,0,${P.vignette})`);
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);

      // 11b) AÇILIŞ FADE-IN — sahne belirene kadar siyah örtü (vinyet sonrası).
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
