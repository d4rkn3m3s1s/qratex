'use client';

import { useEffect, useState } from 'react';

/**
 * Mevsim temaları için paylaşılan ETKİLEŞİM + ATMOSFER altyapısı.
 *
 * Canvas animasyonlarına üç şey kazandırır (hepsi tek bir ref üzerinden, re-render YOK):
 *  1. Fare parallax'ı  → `pointer.x/y` (-1..1 yumuşatılmış), `pointer.tx/ty` (ham hedef).
 *  2. Fare "itişi"     → `pointer.px/py` (piksel konum), yakın parçacıklar kaçsın diye.
 *  3. Tıklama dalgası  → `ripples` (tıklanan noktada genişleyen ışık halkası listesi).
 *  4. Açılış fade-in   → `intro.v` (0→1, ilk ~0.8sn yumuşak belirme).
 *
 * Her `draw()` karesinde EN BAŞTA `scene.step()` çağrılır; değerler bir kare ilerler.
 * Kullanım:
 *   const scene = useSceneInteraction({ reduceMotion });
 *   // draw() içinde en başta:
 *   scene.step();
 *   const { x: mx, y: my } = scene.pointer;   // -1..1 parallax
 *   // ... scene.intro.v ile fade, scene.ripples ile tıklama halkaları
 *
 * NOT: Döndürülen obje kararlıdır (mount boyunca aynı referans). İçindeki alanlar
 * mutable'dır ve yalnızca event handler / effect / draw döngüsünde okunup yazılır —
 * render sırasında ref'e dokunulmaz (React refs kuralına uygun).
 */
export interface Ripple { x: number; y: number; r: number; life: number; maxLife: number; }

export interface SceneInteraction {
  /** Fare parallax + piksel konum (yumuşatılmış). */
  pointer: { x: number; y: number; tx: number; ty: number; px: number; py: number; active: boolean };
  /** Aktif tıklama dalgaları (genişleyen halkalar). */
  ripples: Ripple[];
  /** Açılış belirme durumu: v 0→1. */
  intro: { v: number };
  /** Her draw karesinde EN BAŞTA bir kez çağır — tüm durumu bir adım ilerletir. */
  step: () => void;
}

interface Options {
  /** Parallax yumuşatma katsayısı (0..1, küçük = daha yavaş takip). Vars. 0.06. */
  ease?: number;
  /** reduceMotion true ise fare parallax'ı ve ripple ömrü kısılır. */
  reduceMotion?: boolean;
}

/** Mutable sahne durumu — ref içinde bir kez oluşturulur, render'da değişmez. */
function createScene(): SceneInteraction {
  const state: SceneInteraction = {
    pointer: { x: 0, y: 0, tx: 0, ty: 0, px: -9999, py: -9999, active: false },
    ripples: [],
    intro: { v: 0 },
    step: () => {},
  };
  return state;
}

export function useSceneInteraction(opts: Options = {}): SceneInteraction {
  const ease = opts.ease ?? 0.06;
  const reduce = opts.reduceMotion ?? false;

  // Sahne durumu tek sefer kurulur (lazy initializer) ve mount boyunca aynı
  // referans kalır. setState hiç çağrılmadığı için re-render tetiklenmez; obje
  // mutable'dır ve yalnızca event handler / effect / draw döngüsünde güncellenir.
  const [scene] = useState(createScene);

  // step + event dinleyicileri effect içinde bağlanır (render'da ref'e yazılmaz).
  useEffect(() => {
    // Kare başına durum ilerletme.
    scene.step = () => {
      const p = scene.pointer;
      // parallax hedefe yumuşak yaklaşım
      p.x += (p.tx - p.x) * ease;
      p.y += (p.ty - p.y) * ease;
      // açılış belirme (reduceMotion'da anında tam görünür)
      if (reduce) scene.intro.v = 1;
      else if (scene.intro.v < 1) scene.intro.v = Math.min(1, scene.intro.v + 0.02);
      // ripple ömürleri
      const rs = scene.ripples;
      for (let i = rs.length - 1; i >= 0; i--) {
        rs[i].life -= 1;
        rs[i].r += (reduce ? 6 : 4) + rs[i].r * 0.04; // hızlanarak genişler
        if (rs[i].life <= 0) rs.splice(i, 1);
      }
    };

    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth, h = window.innerHeight;
      const p = scene.pointer;
      p.px = e.clientX; p.py = e.clientY;
      p.active = true;
      if (!reduce) {
        // ekran merkezine göre -1..1 (kenarda ±1)
        p.tx = (e.clientX / w) * 2 - 1;
        p.ty = (e.clientY / h) * 2 - 1;
      }
    };
    const onLeave = () => {
      const p = scene.pointer;
      p.active = false; p.tx = 0; p.ty = 0; p.px = -9999; p.py = -9999;
    };
    const onClick = (e: MouseEvent) => {
      // tıklanan noktada genişleyen ışık halkası
      const rs = scene.ripples;
      if (rs.length > 6) rs.shift(); // en fazla birkaç aktif dalga
      rs.push({ x: e.clientX, y: e.clientY, r: 4, life: reduce ? 20 : 46, maxLife: reduce ? 20 : 46 });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('click', onClick);
    };
  }, [ease, reduce, scene]);

  return scene;
}
