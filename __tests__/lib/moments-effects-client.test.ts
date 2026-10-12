/**
 * An Motoru — efekt cephesi ve istemci API'si (spec §2 `effects.ts`, `client.ts`).
 *
 * Yeniden üretilen hata/senaryo sınıfları:
 *  - Azaltılmış hareket (OS VEYA `html.reduce-animations`) açıkken konfeti/ses/titreşim
 *    ÇALMAZ; canvas-confetti yüklenmez bile (eski 4 konfeti yolunun hiçbiri bunu yapmıyordu).
 *  - Eski yardımcılar (`lib/effects/confetti.ts`) cepheye delege eder → aynı kurala uyar.
 *  - Efekt sürerken tercih açılırsa çalan efektler durdurulur.
 *  - `moments.points()` Host yokken `false` döner (çağıran yedek toast'ı gösterir → bildirim
 *    ne kaybolur ne ikilenir); birden çok Host varken YALNIZ ilki lider (an iki kez çizilmez).
 *  - Sunucu uçları: 401/ağ hatası sessiz; `seen` en fazla 20 tekil id gönderir.
 */
const reduced = { os: false, app: false };
const reducedListeners = new Set<() => void>();

jest.mock('@/lib/motion/policy', () => ({
  isReducedMotion: () => reduced.os || reduced.app,
  subscribeReducedMotion: (cb: () => void) => {
    reducedListeners.add(cb);
    return () => reducedListeners.delete(cb);
  },
}));

const sfx = { win: jest.fn(), chime: jest.fn(), haptic: jest.fn() };
jest.mock('@/lib/game-sounds', () => ({
  haptic: (p: unknown) => sfx.haptic(p),
  sfxClick: jest.fn(),
  sfxCollectStar: jest.fn(),
  sfxFanfare: jest.fn(),
  sfxReveal: jest.fn(),
  sfxWin: () => sfx.win(),
}));
jest.mock('@/lib/play-chime', () => ({ playRewardChime: () => sfx.chime() }));
// An sesleri ortak arayüz ses ailesine (lib/sound) yönlenir: win/chime → 'reward'.
jest.mock('@/lib/sound', () => ({
  playSound: (name: string) => (name === 'reward' ? (sfx.win(), sfx.chime()) : undefined),
}));

import { __effectsTesting, buzz, confetti, prefersReducedMotion, sound, stopAllEffects } from '@/lib/moments/effects';
import { triggerConfetti, triggerRewardShower, triggerSuccessBurst } from '@/lib/effects/confetti';
import {
  MOMENTS_REFRESH_EVENT,
  fetchPendingMoments,
  markMomentsSeen,
  moments,
  registerMomentHost,
  subscribeMomentHosts,
  tryStartNextMoment,
} from '@/lib/moments/client';
import { createMomentQueue, momentQueue } from '@/lib/moments/queue';

const flush = () => new Promise((r) => setTimeout(r, 0));

const g = globalThis as unknown as { window?: unknown };
let fakeConfetti: jest.Mock & { reset: jest.Mock };
let loads = 0;

beforeEach(() => {
  reduced.os = false;
  reduced.app = false;
  jest.clearAllMocks();
  loads = 0;
  // Efektler tarayıcı ister: düğüm ortamında asgari `window`.
  g.window = globalThis;
  fakeConfetti = Object.assign(jest.fn(), { reset: jest.fn() });
  __effectsTesting.reset();
  __effectsTesting.setLoader(async () => {
    loads++;
    return fakeConfetti as never;
  });
  momentQueue.reset();
});

afterEach(() => {
  stopAllEffects();
  delete g.window;
});

describe('effects — azaltılmış hareket tek kaynaktan', () => {
  it('normalde konfeti çalar, ses ve titreşim çalışır', async () => {
    confetti('burst');
    await flush();
    expect(loads).toBe(1);
    expect(fakeConfetti).toHaveBeenCalledTimes(1);
    sound('win');
    buzz([10, 20]);
    expect(sfx.win).toHaveBeenCalled();
    expect(sfx.haptic).toHaveBeenCalledWith([10, 20]);
  });

  it.each([
    ['OS tercihi', () => (reduced.os = true)],
    ['uygulama ayarı (html.reduce-animations)', () => (reduced.app = true)],
  ])('%s açıkken hiçbir efekt çalmaz, canvas-confetti yüklenmez', async (_label, enable) => {
    enable();
    expect(prefersReducedMotion()).toBe(true);
    confetti('celebration');
    triggerConfetti();
    triggerSuccessBurst();
    triggerRewardShower();
    sound('chime');
    buzz();
    await flush();
    expect(loads).toBe(0);
    expect(fakeConfetti).not.toHaveBeenCalled();
    expect(sfx.chime).not.toHaveBeenCalled();
    expect(sfx.haptic).not.toHaveBeenCalled();
  });

  it('eski yardımcılar cepheye delege eder (tek yükleme)', async () => {
    triggerSuccessBurst();
    triggerSuccessBurst();
    await flush();
    expect(loads).toBe(1);
    expect(fakeConfetti).toHaveBeenCalledTimes(2);
  });

  it('efekt sürerken tercih açılırsa çalan efekt durur', async () => {
    jest.useFakeTimers();
    try {
      confetti('celebration'); // 250 ms aralıklı dalgalar
      await Promise.resolve();
      await Promise.resolve();
      const firstWave = fakeConfetti.mock.calls.length;
      expect(firstWave).toBeGreaterThan(0);
      reduced.app = true;
      reducedListeners.forEach((l) => l());
      jest.advanceTimersByTime(1000);
      expect(fakeConfetti.mock.calls.length).toBe(firstWave);
      expect(__effectsTesting.runningCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sunucuda (window yok) no-op', async () => {
    delete g.window;
    confetti('burst');
    await flush();
    expect(loads).toBe(0);
  });
});

describe('client — moments.points / Host liderliği', () => {
  it('Host yokken points false döner (çağıran yedek toast gösterir), kuyruğa girmez', () => {
    expect(moments.hasHost()).toBe(false);
    expect(moments.points({ points: 100 })).toBe(false);
    expect(momentQueue.getSnapshot().pending).toHaveLength(0);
  });

  it('Host varken kapsül kuyruğa girer; geçersiz değer false', () => {
    const h = registerMomentHost();
    try {
      expect(moments.points({ points: 0 })).toBe(false);
      expect(moments.points({ points: 120, xp: 30 })).toBe(true);
      expect(momentQueue.getSnapshot().pending[0]).toMatchObject({ lane: 'points', data: { points: 120, xp: 30 } });
    } finally {
      h.release();
    }
    expect(moments.hasHost()).toBe(false);
  });

  it('birden çok Host: yalnız ilki lider; lider ayrılınca sıradaki devralır', () => {
    const spy = jest.fn();
    const unsub = subscribeMomentHosts(spy);
    const a = registerMomentHost();
    const b = registerMomentHost();
    expect(a.isLeader()).toBe(true);
    expect(b.isLeader()).toBe(false);
    a.release();
    a.release(); // ikinci çağrı güvenli
    expect(b.isLeader()).toBe(true);
    expect(a.isLeader()).toBe(false);
    b.release();
    expect(spy).toHaveBeenCalledTimes(4);
    unsub();
  });

  it('refresh pencere olayını yayar', () => {
    const dispatch = jest.fn();
    g.window = { dispatchEvent: dispatch };
    moments.refresh();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0][0] as Event).type).toBe(MOMENTS_REFRESH_EVENT);
  });
});

describe('client — sunucu uçları', () => {
  it('fetchPendingMoments: legacySpread ve data zarfı okunur; hata sessiz', async () => {
    const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
    expect(await fetchPendingMoments(ok({ moments: [{ id: 'a' }] }))).toEqual([{ id: 'a' }]);
    expect(await fetchPendingMoments(ok({ data: { moments: [{ id: 'b' }] } }))).toEqual([{ id: 'b' }]);
    expect(await fetchPendingMoments(ok({ moments: 'bozuk' }))).toEqual([]);
    expect(await fetchPendingMoments(async () => ({ ok: false, json: async () => ({}) }))).toEqual([]);
    expect(
      await fetchPendingMoments(async () => {
        throw new Error('ağ yok');
      })
    ).toEqual([]);
  });

  it('markMomentsSeen: tekil, en fazla 20 id, keepalive POST; boş liste istek atmaz', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({}) };
    };
    expect(await markMomentsSeen([], f)).toBe(false);
    expect(calls).toHaveLength(0);

    const many = Array.from({ length: 30 }, (_, i) => `m${i}`);
    expect(await markMomentsSeen(['m0', ...many, ''], f)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/customer/moments/seen');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.keepalive).toBe(true);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.ids).toHaveLength(20);
    expect(new Set(body.ids).size).toBe(20);
  });
});

describe('client — oynatma kapısı (tryStartNextMoment)', () => {
  const lvl = { id: 'l1', kind: 'level_up', createdAt: '2026-10-01T10:00:00Z', payload: { from: 1, to: 2, xp: 500 } };

  it('açık dialog / gizli sekme büyük anı bekletir, seen GÖNDERİLMEZ; kapı açılınca bir kez gönderilir', () => {
    const q = createMomentQueue();
    q.enqueue([lvl]);
    const seen = jest.fn();
    let open = false;
    const gate = { canStartRecord: () => open, onRecordStart: seen };

    expect(tryStartNextMoment(q, gate)).toBe('blocked');
    expect(q.current()).toBeNull();
    expect(seen).not.toHaveBeenCalled();

    open = true;
    expect(tryStartNextMoment(q, gate)).toBe('started');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith('l1');
    // Etkin an sürerken tekrar denemek ikinci kez seen göndermez.
    expect(tryStartNextMoment(q, gate)).toBe('idle');
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('puan kapsülü dialog açıkken de başlar ve seen göndermez (kayıtlı değil)', () => {
    const q = createMomentQueue();
    q.enqueuePoints({ points: 40 });
    const seen = jest.fn();
    expect(tryStartNextMoment(q, { canStartRecord: () => false, onRecordStart: seen })).toBe('started');
    expect(q.current()?.lane).toBe('points');
    expect(seen).not.toHaveBeenCalled();
  });

  it('boş kuyruk idle; onRecordStart hatası kuyruğu bozmaz', () => {
    const q = createMomentQueue();
    expect(tryStartNextMoment(q, { canStartRecord: () => true, onRecordStart: jest.fn() })).toBe('idle');
    q.enqueue([lvl]);
    const r = tryStartNextMoment(q, {
      canStartRecord: () => true,
      onRecordStart: () => {
        throw new Error('ağ');
      },
    });
    expect(r).toBe('started');
    expect(q.current()?.key).toBe('record:l1');
  });
});
