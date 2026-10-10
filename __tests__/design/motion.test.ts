/**
 * QDL motion dili: token senkronu, stagger bütçesi, azaltılmış hareket politikası.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DURATION, DURATION_MS, EASE, EASE_CSS, STAGGER } from '@/lib/motion/tokens';
import { isReducedMotion, subscribeReducedMotion, REDUCE_MOTION_CLASS, type MotionEnv } from '@/lib/motion/policy';
import { fadeUp, listItem, staggerDelay, toReducedVariants, sheet } from '@/lib/motion/variants';
import { extractVarsForSelector } from '@/lib/design/css-tokens';

const css = readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8');
const root = extractVarsForSelector(css, ':root');

describe('motion token senkronu (TS ↔ CSS)', () => {
  it('süreler globals.css --motion-* ile aynı', () => {
    expect(root['motion-fast']).toBe(`${DURATION_MS.fast}ms`);
    expect(root['motion-base']).toBe(`${DURATION_MS.base}ms`);
    expect(root['motion-slow']).toBe(`${DURATION_MS.slow}ms`);
    expect(root['motion-celebrate']).toBe(`${DURATION_MS.celebrate}ms`);
    for (const k of Object.keys(DURATION) as (keyof typeof DURATION)[]) {
      expect(Math.round(DURATION[k] * 1000)).toBe(DURATION_MS[k]);
    }
  });

  it('easing eğrileri globals.css --ease-* ile aynı', () => {
    for (const k of Object.keys(EASE) as (keyof typeof EASE)[]) {
      expect(root[`ease-${k}`]).toBe(EASE_CSS[k]);
      expect(EASE_CSS[k]).toBe(`cubic-bezier(${EASE[k].join(', ')})`);
    }
  });

  it('kutlama ve an süreleri yol haritası sınırlarında', () => {
    expect(DURATION.celebrate).toBeLessThanOrEqual(1.2);
    expect(DURATION.moment).toBeLessThanOrEqual(4.5);
  });
});

describe('stagger bütçesi', () => {
  it('ilk öğe beklemez, gecikme artar', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBeCloseTo(STAGGER.step);
    expect(staggerDelay(5)).toBeCloseTo(5 * STAGGER.step);
  });

  it('40 öğeli listede son öğe en fazla 0,6 sn bekler; 12. öğeden sonra sabit', () => {
    const delays = Array.from({ length: 40 }, (_, i) => staggerDelay(i));
    expect(Math.max(...delays)).toBeLessThanOrEqual(STAGGER.maxTotal);
    expect(delays[39]).toBe(delays[STAGGER.maxItems - 1]);
  });

  it('büyük adımda bile toplam bütçe aşılmaz', () => {
    expect(staggerDelay(11, 0.5)).toBe(STAGGER.maxTotal);
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
  });

  it('listItem custom index ile bütçeli gecikme üretir', () => {
    const visible = listItem.visible as (i: number) => { transition: { delay: number } };
    expect(visible(0).transition.delay).toBe(0);
    expect(visible(100).transition.delay).toBeLessThanOrEqual(STAGGER.maxTotal);
  });
});

describe('azaltılmış varyantlar', () => {
  it('transform anahtarlarını siler, opaklığı korur, süreyi 0 yapar', () => {
    const r = toReducedVariants(fadeUp);
    expect(r.hidden).toEqual({ opacity: 0, transition: { duration: 0 } });
    expect(r.visible).toEqual({ opacity: 1, transition: { duration: 0 } });
  });

  it('fonksiyon varyantlarını da sarar', () => {
    const r = toReducedVariants(listItem);
    const visible = r.visible as (i: number) => Record<string, unknown>;
    expect(visible(3)).toEqual({ opacity: 1, transition: { duration: 0 } });
  });

  it('sheet yönleri doğru eksen ve işaret kullanır', () => {
    expect(sheet('right').hidden).toMatchObject({ x: '100%' });
    expect(sheet('left').hidden).toMatchObject({ x: '-100%' });
    expect(sheet('bottom').hidden).toMatchObject({ y: '100%' });
    expect(sheet('top').hidden).toMatchObject({ y: '-100%' });
  });
});

describe('hareket politikası (OS VEYA uygulama ayarı)', () => {
  function makeEnv({ os = false, app = false } = {}) {
    const classes = new Set<string>(app ? [REDUCE_MOTION_CLASS] : []);
    const mqlListeners = new Set<() => void>();
    const observers: Array<() => void> = [];
    const mql = {
      get matches() {
        return os;
      },
      addEventListener: (_: 'change', cb: () => void) => mqlListeners.add(cb),
      removeEventListener: (_: 'change', cb: () => void) => mqlListeners.delete(cb),
    };
    class FakeObserver {
      constructor(private cb: () => void) {}
      observe() {
        observers.push(this.cb);
      }
      disconnect() {
        const i = observers.indexOf(this.cb);
        if (i >= 0) observers.splice(i, 1);
      }
    }
    const env: MotionEnv = {
      matchMedia: () => mql,
      root: { classList: { contains: (c: string) => classes.has(c) } },
      MutationObserver: FakeObserver,
    };
    return {
      env,
      setOS(v: boolean) {
        os = v;
        mqlListeners.forEach((cb) => cb());
      },
      setApp(v: boolean) {
        if (v) classes.add(REDUCE_MOTION_CLASS);
        else classes.delete(REDUCE_MOTION_CLASS);
        observers.forEach((cb) => cb());
      },
      listenerCount: () => mqlListeners.size + observers.length,
    };
  }

  it('hiçbiri açık değilse hareket serbest', () => {
    expect(isReducedMotion(makeEnv().env)).toBe(false);
  });

  it('yalnız OS tercihi → azalt', () => {
    expect(isReducedMotion(makeEnv({ os: true }).env)).toBe(true);
  });

  it('yalnız uygulama ayarı (html.reduce-animations) → azalt', () => {
    expect(isReducedMotion(makeEnv({ app: true }).env)).toBe(true);
  });

  it('sunucuda (window yok) false döner', () => {
    expect(isReducedMotion({})).toBe(false);
  });

  it('değişimler canlı bildirilir ve abonelik temizlenir', () => {
    const fx = makeEnv();
    const seen: boolean[] = [];
    const unsubscribe = subscribeReducedMotion(() => seen.push(isReducedMotion(fx.env)), fx.env);
    fx.setApp(true);
    fx.setApp(false);
    fx.setOS(true);
    expect(seen).toEqual([true, false, true]);
    expect(fx.listenerCount()).toBe(2);
    unsubscribe();
    expect(fx.listenerCount()).toBe(0);
  });
});
