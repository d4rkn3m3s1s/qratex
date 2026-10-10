/**
 * DPR'lı canvas yüzeyi — sabit MANTIKSAL koordinat sistemi (ör. 360×460), ekrana göre
 * ölçeklenir. Retina'da bulanıklık yok (oyun-ekosistemi Y4: 10 canvas oyunundan 8'i bulanıktı).
 *
 * Proje tuzağı (scroll-scene-traps): ölçekli bir ebeveyn (`transform: scale`) içindeki
 * canvas için `getBoundingClientRect()` ölçekli boyutu verir; arka tampon boyutu
 * `clientWidth/clientHeight` (yerleşim boyutu) ile hesaplanır. İşaretçi dönüşümü ise
 * görünür dikdörtgene göre yapılır (ikisi de viewport uzayında olduğu için doğru).
 *
 *   const s = setupCanvas(canvas, { width: 360, height: 460 });
 *   // her kare:
 *   const ctx = s.beginFrame();   // dönüşüm ayarlı + temiz; mantıksal koordinatla çiz
 *   const p = s.toLogical(e.clientX, e.clientY);
 *   s.dispose();
 */

export interface CanvasSurfaceOptions {
  /** Mantıksal genişlik (oyun koordinatı). */
  width: number;
  /** Mantıksal yükseklik. */
  height: number;
  /** Üst DPR sınırı (pil/GPU). Varsayılan 2. */
  maxDpr?: number;
  /** Yerleşim değişince (ResizeObserver). */
  onResize?: (s: CanvasSurface) => void;
  /** Alfa kanalı (şeffaf zemin). Varsayılan true. */
  alpha?: boolean;
}

export interface CanvasSurface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Mantıksal boyut. */
  readonly width: number;
  readonly height: number;
  /** Etkin DPR (≤ maxDpr). */
  readonly dpr: number;
  /** CSS (yerleşim) boyutu. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Mantıksal → arka tampon ölçeği (dpr × css/mantıksal). */
  readonly scale: number;
  /** İstemci (viewport) koordinatını mantıksal koordinata çevirir. */
  toLogical(clientX: number, clientY: number): { x: number; y: number };
  /** Dönüşümü ayarlar, tuvali temizler ve bağlamı döndürür. */
  beginFrame(clear?: boolean): CanvasRenderingContext2D;
  /** Boyutu yeniden ölç (ResizeObserver yoksa elle). */
  resize(): void;
  dispose(): void;
}

export function currentDpr(maxDpr = 2): number {
  const raw = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  return Math.max(1, Math.min(maxDpr, raw));
}

export function setupCanvas(canvas: HTMLCanvasElement, opts: CanvasSurfaceOptions): CanvasSurface {
  const ctx = canvas.getContext('2d', { alpha: opts.alpha !== false });
  if (!ctx) throw new Error('Canvas 2D bağlamı alınamadı');
  const maxDpr = opts.maxDpr ?? 2;

  let dpr = currentDpr(maxDpr);
  let cssWidth = opts.width;
  let cssHeight = opts.height;
  let scale = dpr;

  const surface: CanvasSurface = {
    canvas,
    ctx,
    width: opts.width,
    height: opts.height,
    get dpr() {
      return dpr;
    },
    get cssWidth() {
      return cssWidth;
    },
    get cssHeight() {
      return cssHeight;
    },
    get scale() {
      return scale;
    },
    toLogical(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || cssWidth || opts.width;
      const h = rect.height || cssHeight || opts.height;
      return {
        x: ((clientX - rect.left) / w) * opts.width,
        y: ((clientY - rect.top) / h) * opts.height,
      };
    },
    beginFrame(clear = true) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (clear) ctx.clearRect(0, 0, canvas.width, canvas.height);
      // En-boy oranı CSS ile korunuyorsa sx === sy; korunmuyorsa eksenler ayrı ölçeklenir.
      const sx = (dpr * cssWidth) / opts.width;
      const sy = (dpr * cssHeight) / opts.height;
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      return ctx;
    },
    resize() {
      dpr = currentDpr(maxDpr);
      // Yerleşim boyutu: ölçekli ebeveynde doğru olan clientWidth/clientHeight.
      cssWidth = canvas.clientWidth || opts.width;
      cssHeight = canvas.clientHeight || Math.round((cssWidth * opts.height) / opts.width);
      const bw = Math.max(1, Math.round(cssWidth * dpr));
      const bh = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      scale = (dpr * cssWidth) / opts.width;
      opts.onResize?.(surface);
    },
    dispose() {
      ro?.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', onWindowResize);
    },
  };

  const onWindowResize = () => surface.resize();
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => surface.resize());
    ro.observe(canvas);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize);
  }
  surface.resize();
  return surface;
}
