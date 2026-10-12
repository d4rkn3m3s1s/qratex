/**
 * Arayüz sesleri — tercih varsayılanları, kapsam, ayrıştırma, spam/eşzamanlılık kapısı,
 * ses ailesi bütçesi ve playSound'un sunucuda/kapalıyken sessizliği.
 */
import {
  DEFAULT_SOUND_PREFS,
  parseSoundPrefs,
  readSoundPrefs,
  scopeFromPath,
  writeSoundPrefs,
  SOUND_STORAGE_PREFIX,
} from '@/lib/sound/prefs';
import { SoundGate } from '@/lib/sound/gate';
import { LONG_SOUNDS, SOUND_ALIASES, SOUND_NAMES, SOUND_RECIPES, recipeDuration, resolveSoundName } from '@/lib/sound/recipes';
import { playSound } from '@/lib/sound';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('tercih varsayılanları', () => {
  it('müşteri AÇIK (düşük seviye), bayi/admin KAPALI', () => {
    expect(DEFAULT_SOUND_PREFS.customer.enabled).toBe(true);
    expect(DEFAULT_SOUND_PREFS.customer.volume).toBeLessThanOrEqual(0.5);
    expect(DEFAULT_SOUND_PREFS.dealer.enabled).toBe(false);
    expect(DEFAULT_SOUND_PREFS.admin.enabled).toBe(false);
  });

  it('kapsam URL’den türer', () => {
    expect(scopeFromPath('/admin')).toBe('admin');
    expect(scopeFromPath('/admin/ekip')).toBe('admin');
    expect(scopeFromPath('/dealer/settings')).toBe('dealer');
    expect(scopeFromPath('/customer/me')).toBe('customer');
    expect(scopeFromPath('/q/abc')).toBe('customer');
    expect(scopeFromPath('/administrator')).toBe('customer');
    expect(scopeFromPath(null)).toBe('customer');
  });

  it('bozuk/eksik değer varsayılana düşer, seviye 0..1 kırpılır', () => {
    expect(parseSoundPrefs(null, 'dealer')).toEqual(DEFAULT_SOUND_PREFS.dealer);
    expect(parseSoundPrefs('{bozuk', 'customer')).toEqual(DEFAULT_SOUND_PREFS.customer);
    expect(parseSoundPrefs('{"enabled":"evet"}', 'admin').enabled).toBe(false);
    expect(parseSoundPrefs('{"enabled":true,"volume":7}', 'admin')).toEqual({ enabled: true, volume: 1 });
    expect(parseSoundPrefs('{"volume":-1}', 'customer').volume).toBe(0);
  });

  it('kapsam başına yazılır/okunur (admin kapatmak müşteriyi etkilemez)', () => {
    const s = memStore();
    writeSoundPrefs('admin', { enabled: true, volume: 0.8 }, s);
    expect(s.m.has(SOUND_STORAGE_PREFIX + 'admin')).toBe(true);
    expect(readSoundPrefs('admin', s)).toEqual({ enabled: true, volume: 0.8 });
    expect(readSoundPrefs('customer', s)).toEqual(DEFAULT_SOUND_PREFS.customer);
  });

  it('depolama fırlatırsa varsayılan döner', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readSoundPrefs('customer', bad)).toEqual(DEFAULT_SOUND_PREFS.customer);
    expect(() => writeSoundPrefs('customer', { enabled: false, volume: 0 }, bad)).not.toThrow();
  });
});

describe('SoundGate', () => {
  it('aynı ses minIntervalMs içinde tekrar çalmaz', () => {
    const g = new SoundGate();
    expect(g.tryAcquire('success', 0)).toBe(true);
    expect(g.tryAcquire('success', SOUND_RECIPES.success.minIntervalMs - 1)).toBe(false);
    expect(g.tryAcquire('success', SOUND_RECIPES.success.minIntervalMs + 1000)).toBe(true);
  });

  it('eşzamanlı ses sınırı aşılmaz, sesler bitince yer açılır', () => {
    const g = new SoundGate(2);
    expect(g.tryAcquire('reward', 0)).toBe(true);
    expect(g.tryAcquire('success', 1)).toBe(true);
    expect(g.tryAcquire('coin', 2)).toBe(false);
    expect(g.active(2)).toBe(2);
    expect(g.tryAcquire('coin', 2000)).toBe(true);
  });
});

describe('ses ailesi', () => {
  it('istenen tüm sesler var ve hepsi kısa (≤ 600 ms)', () => {
    for (const n of ['tap', 'toggle', 'success', 'coin', 'reward', 'error', 'notify', 'flip', 'tick'] as const) {
      expect(SOUND_NAMES).toContain(n);
      expect(recipeDuration(SOUND_RECIPES[n])).toBeLessThanOrEqual(0.6);
      for (const st of SOUND_RECIPES[n].steps) expect(st.gain).toBeLessThanOrEqual(0.4);
    }
  });

  it('takma adlar aile sesine çözülür', () => {
    for (const [alias, target] of Object.entries(SOUND_ALIASES)) expect(resolveSoundName(alias)).toBe(target);
    expect(resolveSoundName('coin')).toBe('coin');
    expect(resolveSoundName('yok')).toBeNull();
  });

  it('playSound sunucuda (window yok) sessizce geçer', () => {
    expect(() => playSound('success')).not.toThrow();
    expect(() => playSound('points')).not.toThrow();
  });
});

describe('genişletilmiş ses ailesi (2026-10)', () => {
  const NEW = [
    'like', 'copy', 'send', 'receive-message', 'swipe', 'unlock', 'streak', 'rank-up', 'purchase',
    'delete-soft', 'open-sheet', 'close-sheet', 'toggle-on', 'toggle-off', 'scan-success', 'celebration',
  ] as const;

  // C majör pentatonik (C D E G A) — her oktavda; tonal aile kuralı.
  const PENTA = [0, 2, 4, 7, 9];
  const inPenta = (hz: number) => {
    const midi = 69 + 12 * Math.log2(hz / 440);
    const r = Math.round(midi);
    return Math.abs(midi - r) < 0.05 && PENTA.includes(((r % 12) + 12) % 12);
  };

  it('yeni adların hepsi var', () => {
    for (const n of NEW) expect(SOUND_NAMES).toContain(n);
  });

  it('bütçe: kısa sesler ≤ 600 ms, yalnız celebration ≤ 1.2 s; kazanç ≤ 0.4', () => {
    for (const n of SOUND_NAMES) {
      const limit = LONG_SOUNDS.includes(n) ? 1.2 : 0.6;
      expect(recipeDuration(SOUND_RECIPES[n])).toBeLessThanOrEqual(limit);
      for (const st of SOUND_RECIPES[n].steps) expect(st.gain).toBeLessThanOrEqual(0.4);
    }
  });

  it('parametreler güvenli aralıkta (pan, atak, yankı, FM, detune)', () => {
    for (const n of SOUND_NAMES) {
      const r = SOUND_RECIPES[n];
      expect(r.reverb ?? 0).toBeGreaterThanOrEqual(0);
      expect(r.reverb ?? 0).toBeLessThanOrEqual(0.3);
      expect(r.minIntervalMs).toBeGreaterThan(0);
      for (const st of r.steps) {
        expect(Math.abs(st.pan ?? 0)).toBeLessThanOrEqual(0.5);
        if (st.attack !== undefined) expect(st.attack).toBeLessThan(st.dur);
        if (st.fm) expect(st.fm.index).toBeLessThanOrEqual(1);
        expect(Math.abs(st.detune ?? 0)).toBeLessThanOrEqual(12);
        expect(st.freq).toBeGreaterThan(0);
      }
    }
  });

  it('yeni seslerin tonal adımları C pentatonikte (aynı tonalite)', () => {
    for (const n of NEW) {
      for (const st of SOUND_RECIPES[n].steps) {
        if (st.wave === 'noise') continue;
        expect({ n, f: st.freq, ok: inPenta(st.freq) }).toEqual({ n, f: st.freq, ok: true });
        if (st.freqEnd) expect({ n, f: st.freqEnd, ok: inPenta(st.freqEnd) }).toEqual({ n, f: st.freqEnd, ok: true });
      }
    }
  });

  it('çift sesler ayna: toggle-on yukarı, toggle-off aşağı; open-sheet yukarı, close-sheet aşağı', () => {
    const dir = (n: (typeof NEW)[number]) => {
      const st = SOUND_RECIPES[n].steps.find((x) => x.wave !== 'noise' && x.freqEnd)!;
      return Math.sign(st.freqEnd! - st.freq);
    };
    expect(dir('toggle-on')).toBe(1);
    expect(dir('toggle-off')).toBe(-1);
    expect(dir('open-sheet')).toBe(1);
    expect(dir('close-sheet')).toBe(-1);
  });

  it('sık tekrar eden sesler kuru ve hızlı (tick yankısız, swipe/toggle düşük aralık)', () => {
    expect(SOUND_RECIPES.tick.reverb).toBe(0);
    expect(SOUND_RECIPES['toggle-on'].minIntervalMs).toBeLessThanOrEqual(100);
    expect(SOUND_RECIPES.celebration.minIntervalMs).toBeGreaterThanOrEqual(2000);
  });

  it('yeni takma adlar çözülür', () => {
    expect(resolveSoundName('heart')).toBe('like');
    expect(resolveSoundName('qr-scan')).toBe('scan-success');
    expect(resolveSoundName('confetti')).toBe('celebration');
    expect(resolveSoundName('rank-up')).toBe('rank-up');
  });

  it('playSound yeni adlarla sunucuda sessiz', () => {
    for (const n of NEW) expect(() => playSound(n)).not.toThrow();
  });
});
