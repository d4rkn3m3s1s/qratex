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
import { SOUND_ALIASES, SOUND_NAMES, SOUND_RECIPES, recipeDuration, resolveSoundName } from '@/lib/sound/recipes';
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
