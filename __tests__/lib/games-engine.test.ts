/**
 * lib/games/engine — saf çekirdek: tohumlu RNG, sabit adımlı döngü, giriş yardımcıları,
 * girdi kaydı. DOM yok; döngü sahte rAF/belge ile sürülür.
 */
import { createRng, hashSeed } from '@/lib/games/engine/rng';
import { createFixedStepLoop, type LoopEnv } from '@/lib/games/engine/loop';
import { swipeDirection, DEFAULT_KEYMAP } from '@/lib/games/engine/input';
import { createInputRecorder, inputLogSchema, ACTION_CODE, MAX_INPUT_LOG_ENTRIES } from '@/lib/games/engine/record';
import { getGamePrefs, setGamePrefs, __resetGamePrefsCache, DEFAULT_GAME_PREFS } from '@/lib/games/engine/prefs';

describe('rng', () => {
  it('aynı tohum → aynı dizi; farklı tohum → farklı dizi', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    const c = createRng('abd');
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    const sc = Array.from({ length: 20 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('platformdan bağımsız sabit çıktı (replay sözleşmesi kırılırsa test düşer)', () => {
    // Altın değerler: algoritma (cyrb53 → mulberry32) değişirse istemci/sunucu replay'i kırılır.
    expect(hashSeed('qratex')).toBe(1160621489);
    const r = createRng('sabit-tohum');
    expect(Array.from({ length: 5 }, () => r.int(0, 1000))).toEqual([264, 127, 517, 249, 812]);
  });

  it('fork: alt akışlar bağımsız; bir akışa çağrı eklemek diğerini kaydırmaz', () => {
    const r1 = createRng('s');
    const r2 = createRng('s');
    r1.next();
    r1.next(); // ana akışta fazladan çağrı
    expect(r1.fork('spawn').next()).toBe(r2.fork('spawn').next());
    expect(createRng('s').fork('a').next()).not.toBe(createRng('s').fork('b').next());
  });

  it('shuffle permütasyondur ve girdiyi değiştirmez; int sınırları kapsar', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng('k').shuffle(items);
    expect(out.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const r = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted: sıfır ağırlıklı öğe seçilmez', () => {
    const r = createRng('w');
    for (let i = 0; i < 200; i++) expect(r.weighted(['a', 'b', 'c'], (x) => (x === 'b' ? 0 : 1))).not.toBe('b');
  });
});

function fakeEnv() {
  let rafCb: ((t: number) => void) | null = null;
  const listeners: Record<string, Array<() => void>> = {};
  const doc = {
    hidden: false,
    addEventListener: (t: string, cb: () => void) => {
      (listeners[t] ??= []).push(cb);
    },
    removeEventListener: (t: string, cb: () => void) => {
      listeners[t] = (listeners[t] ?? []).filter((x) => x !== cb);
    },
  };
  const env: Partial<LoopEnv> = {
    raf: (cb) => {
      rafCb = cb;
      return 1;
    },
    caf: () => {
      rafCb = null;
    },
    now: () => 0,
    doc,
    win: null,
  };
  return {
    env,
    doc,
    fire: (t: string) => (listeners[t] ?? []).forEach((cb) => cb()),
    frame: (t: number) => {
      const cb = rafCb;
      rafCb = null;
      cb?.(t);
    },
    pending: () => rafCb !== null,
  };
}

describe('sabit adımlı döngü', () => {
  it('120 Hz ve 60 Hz ekranda 1 sn → ~60 mantık adımı (kare hızından bağımsız)', () => {
    for (const fps of [30, 60, 120, 144]) {
      const f = fakeEnv();
      let updates = 0;
      const loop = createFixedStepLoop({ update: () => updates++, env: f.env });
      loop.start();
      const dt = 1000 / fps;
      for (let i = 0; i <= fps; i++) f.frame(i * dt);
      expect(updates).toBeGreaterThanOrEqual(59);
      expect(updates).toBeLessThanOrEqual(61);
      loop.stop();
    }
  });

  it('sekme gizlenince duraklar, kendiliğinden devam etmez; devamda süre sıçraması yok', () => {
    const f = fakeEnv();
    let updates = 0;
    const reasons: Array<string | null> = [];
    const loop = createFixedStepLoop({
      update: () => updates++,
      env: f.env,
      onPauseChange: (_p, r) => reasons.push(r),
    });
    loop.start();
    f.frame(0);
    f.frame(500);
    const before = updates;
    f.doc.hidden = true;
    f.fire('visibilitychange');
    expect(loop.paused).toBe(true);
    expect(loop.pauseReason).toBe('hidden');
    f.frame(10_000); // gizliyken kare gelmez ama gelse de işlenmez
    expect(updates).toBe(before);
    f.doc.hidden = false;
    f.fire('visibilitychange');
    expect(loop.paused).toBe(true); // otomatik devam yok
    loop.resume();
    f.frame(20_000);
    f.frame(20_100);
    expect(updates - before).toBeLessThanOrEqual(7); // yalnız 100 ms ≈ 6 adım, 10 sn değil
    expect(reasons).toEqual(['hidden', null]);
  });

  it('spiral koruması: tek uzun karede en fazla maxStepsPerFrame adım', () => {
    const f = fakeEnv();
    let updates = 0;
    const loop = createFixedStepLoop({ update: () => updates++, env: f.env, maxStepsPerFrame: 5, maxFrameMs: 10_000 });
    loop.start();
    f.frame(0);
    f.frame(5_000);
    expect(updates).toBe(5);
  });

  it('step sayacı deterministik zamandır; update içinde stop kalan adımları keser', () => {
    const f = fakeEnv();
    const steps: number[] = [];
    const loop = createFixedStepLoop({
      update: (_dt, step) => {
        steps.push(step);
        if (step === 2) loop.stop();
      },
      env: f.env,
    });
    loop.start();
    f.frame(0);
    f.frame(200);
    expect(steps).toEqual([0, 1, 2]);
    expect(loop.running).toBe(false);
  });
});

describe('giriş yardımcıları', () => {
  it('swipeDirection eşik ve baskın eksen', () => {
    expect(swipeDirection(5, 5)).toBeNull();
    expect(swipeDirection(40, 10)).toBe('right');
    expect(swipeDirection(-40, 10)).toBe('left');
    expect(swipeDirection(10, 40)).toBe('down');
    expect(swipeDirection(10, -40)).toBe('up');
  });
  it('varsayılan tuş eşlemi WASD + oklar + duraklatma', () => {
    expect(DEFAULT_KEYMAP.ArrowUp).toBe('up');
    expect(DEFAULT_KEYMAP.KeyA).toBe('left');
    expect(DEFAULT_KEYMAP.Escape).toBe('pause');
  });
});

describe('girdi kaydı', () => {
  it('kayıt şemaya uyar, adım azalmaz, sayılar sıkıştırılır', () => {
    const rec = createInputRecorder();
    rec.recordAction(3, 'left');
    rec.record(2, 20, 1.23456, 9.87654); // geri adım → son adıma sabitlenir
    rec.recordAction(10, 'primary', 4);
    const log = rec.entries();
    expect(log).toEqual([
      [3, ACTION_CODE.left],
      [3, 20, 1.23, 9.88],
      [10, ACTION_CODE.primary, 4],
    ]);
    expect(inputLogSchema.safeParse(log).success).toBe(true);
  });

  it('şema: azalan adımı ve aşırı uzun kaydı reddeder', () => {
    expect(inputLogSchema.safeParse([[5, 1], [4, 1]]).success).toBe(false);
    const rec = createInputRecorder(2);
    expect(rec.record(0, 1)).toBe(true);
    expect(rec.record(1, 1)).toBe(true);
    expect(rec.record(2, 1)).toBe(false);
    expect(rec.overflowed).toBe(true);
    expect(MAX_INPUT_LOG_ENTRIES).toBeGreaterThan(1000);
  });
});

describe('oyun tercihleri', () => {
  it('sunucuda (window yok) varsayılanlar; set bellekte tutulur', () => {
    __resetGamePrefsCache();
    expect(getGamePrefs()).toEqual(DEFAULT_GAME_PREFS);
    setGamePrefs({ sound: false });
    expect(getGamePrefs()).toEqual({ sound: false, haptics: true });
    __resetGamePrefsCache();
  });
});
