/**
 * Özellik ve Deney Kontrolü — saf mantık: deney istatistikleri ve kademeli açılış değerlendirmesi.
 */
/** @jest-environment node */
import { chiSquare1P, compareVariants, newcombeDiff, normalCdf, sampleRatioMismatch, twoProportionP, wilson } from '@/lib/admin-flags/stats';
import { evaluateRollout, isRuleLive, parseRolloutMeta, rolloutBucket, type RolloutRule } from '@/lib/admin-flags/rollout';

describe('istatistik', () => {
  it('normal CDF bilinen değerler', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
  });

  it('Wilson aralığı: 0/0 null, 0/10 alt sınır 0, yayın değeri', () => {
    expect(wilson(0, 0)).toBeNull();
    const z = wilson(0, 10)!;
    expect(z[0]).toBe(0);
    expect(z[1]).toBeCloseTo(0.2775, 3);
    const w = wilson(50, 100)!;
    expect(w[0]).toBeCloseTo(0.4038, 3);
    expect(w[1]).toBeCloseTo(0.5962, 3);
  });

  it('iki oran z-testi: eşit oranlarda p=1, belirgin farkta küçük p', () => {
    expect(twoProportionP(50, 100, 50, 100)).toBeCloseTo(1, 6);
    expect(twoProportionP(100, 1000, 150, 1000)!).toBeLessThan(0.001);
    expect(twoProportionP(0, 0, 1, 10)).toBeNull();
  });

  it('Newcombe farkı nokta tahminini kapsar', () => {
    const ci = newcombeDiff(100, 1000, 150, 1000)!;
    expect(ci[0]).toBeLessThan(0.05);
    expect(ci[1]).toBeGreaterThan(0.05);
    expect(ci[0]).toBeGreaterThan(0);
  });

  it('ki-kare (sd=1) üst kuyruk: 3,841 → ~0,05', () => {
    expect(chiSquare1P(3.841)).toBeCloseTo(0.05, 2);
    expect(chiSquare1P(0)).toBe(1);
  });

  it('SRM: dengeli dağılım uyumlu, ciddi sapma uyumsuz; küçük hacimde alarm yok', () => {
    expect(sampleRatioMismatch(500, 500, 0.5).mismatch).toBe(false);
    expect(sampleRatioMismatch(600, 400, 0.5).mismatch).toBe(true);
    expect(sampleRatioMismatch(30, 10, 0.5).mismatch).toBe(false);
    expect(sampleRatioMismatch(0, 0, 0.5).chi2).toBeNull();
  });

  it('karar: yetersiz örneklemde yorum yok; anlamlı farkta yön doğru', () => {
    expect(compareVariants({ aExposed: 20, aConverted: 2, bExposed: 20, bConverted: 8 }).verdict).toBe('insufficient');
    const b = compareVariants({ aExposed: 1000, aConverted: 100, bExposed: 1000, bConverted: 150 });
    expect(b.verdict).toBe('b_better');
    expect(b.diffPp).toBeCloseTo(5, 6);
    expect(b.relativeLift).toBeCloseTo(50, 6);
    expect(compareVariants({ aExposed: 1000, aConverted: 150, bExposed: 1000, bConverted: 100 }).verdict).toBe('a_better');
    expect(compareVariants({ aExposed: 1000, aConverted: 100, bExposed: 1000, bConverted: 104 }).verdict).toBe('not_significant');
  });
});

describe('kademeli açılış', () => {
  const rule = (p: Partial<RolloutRule> = {}): RolloutRule => ({ key: 'squads', active: true, percent: 30, allowUserIds: [], expiresAt: null, ...p });

  it('kova deterministik ve 0–99 arası', () => {
    expect(rolloutBucket('squads', 'u1')).toBe(rolloutBucket('squads', 'u1'));
    for (let i = 0; i < 200; i++) {
      const b = rolloutBucket('squads', `u${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it('kural yok / etkin değil / süresi dolmuş / %100 → geçer', () => {
    expect(evaluateRollout(null, 'u1')).toBe('pass');
    expect(evaluateRollout(rule({ active: false, percent: 0 }), 'u1')).toBe('pass');
    expect(evaluateRollout(rule({ percent: 0, expiresAt: new Date(Date.now() - 1000) }), 'u1')).toBe('pass');
    expect(evaluateRollout(rule({ percent: 100 }), null)).toBe('pass');
  });

  it('allowlist geçer, oturumsuz kapsam dışı, yüzde kovaya göre', () => {
    expect(evaluateRollout(rule({ percent: 0, allowUserIds: ['vip'] }), 'vip')).toBe('pass');
    expect(evaluateRollout(rule({ percent: 50 }), null)).toBe('excluded');
    const users = Array.from({ length: 2000 }, (_, i) => `user-${i}`);
    const passed = users.filter((u) => evaluateRollout(rule({ percent: 30 }), u) === 'pass').length;
    expect(passed / users.length).toBeGreaterThan(0.25);
    expect(passed / users.length).toBeLessThan(0.35);
    // Yüzdeyi artırmak mevcut kapsamdakileri korur (monoton).
    for (const u of users.slice(0, 300)) {
      if (evaluateRollout(rule({ percent: 30 }), u) === 'pass') expect(evaluateRollout(rule({ percent: 60 }), u)).toBe('pass');
    }
  });

  it('meta ayrıştırma güvenli varsayılanlar', () => {
    expect(parseRolloutMeta(null)).toEqual({ kind: null, percent: 100, allowUserIds: [], note: null, archivedAt: null });
    expect(parseRolloutMeta({ kind: 'module_rollout', percent: 150, allowUserIds: ['a', 3] })).toMatchObject({ kind: 'module_rollout', percent: 100, allowUserIds: ['a'] });
    expect(isRuleLive({ active: true, expiresAt: new Date(Date.now() + 60_000) })).toBe(true);
  });
});
