/**
 * Sezonluk etkinlik challenge çekirdeği: spec ayrıştırma, ilerleme, pencere/geri sayım.
 * Yanlış eşik/pencere hesabı ya ödülü erken açar (challenge tamamlanmadan) ya da hiç açmaz.
 */
import {
  parseChallengeSpec,
  challengeProgress,
  formatRemaining,
  msUntilEnd,
  isWithinWindow,
} from '@/lib/seasonal-event-core';

describe('parseChallengeSpec', () => {
  it('geçerli games_played spec', () => {
    const s = parseChallengeSpec({
      challengeType: 'games_played', challengeGoal: 5, challengeRewardPoints: 300, challengeRewardBadgeId: 'badge-x',
    });
    expect(s).toEqual({ type: 'games_played', goal: 5, rewardPoints: 300, rewardBadgeId: 'badge-x' });
  });

  it('tip yoksa/geçersizse null', () => {
    expect(parseChallengeSpec({ challengeType: null, challengeGoal: 5, challengeRewardPoints: 100, challengeRewardBadgeId: null })).toBeNull();
    expect(parseChallengeSpec({ challengeType: 'bilinmeyen', challengeGoal: 5, challengeRewardPoints: 100, challengeRewardBadgeId: null })).toBeNull();
  });

  it('goal yoksa/≤0 ise null', () => {
    expect(parseChallengeSpec({ challengeType: 'games_played', challengeGoal: 0, challengeRewardPoints: 100, challengeRewardBadgeId: null })).toBeNull();
    expect(parseChallengeSpec({ challengeType: 'games_played', challengeGoal: null, challengeRewardPoints: 100, challengeRewardBadgeId: null })).toBeNull();
  });

  it('ödül puanı yoksa 0\'a normalize', () => {
    const s = parseChallengeSpec({ challengeType: 'reviews_written', challengeGoal: 3, challengeRewardPoints: null, challengeRewardBadgeId: null });
    expect(s?.rewardPoints).toBe(0);
  });
});

describe('challengeProgress', () => {
  it('yarı yol: ratio 0.5, tamam değil', () => {
    const p = challengeProgress(2, 4);
    expect(p.ratio).toBe(0.5);
    expect(p.complete).toBe(false);
  });

  it('hedefe ulaşınca complete + ratio 1', () => {
    const p = challengeProgress(5, 5);
    expect(p.complete).toBe(true);
    expect(p.ratio).toBe(1);
  });

  it('hedefi aşınca ratio 1\'de kalır (taşma yok)', () => {
    const p = challengeProgress(9, 5);
    expect(p.ratio).toBe(1);
    expect(p.complete).toBe(true);
  });

  it('negatif current 0\'a çekilir', () => {
    const p = challengeProgress(-3, 5);
    expect(p.current).toBe(0);
    expect(p.ratio).toBe(0);
  });
});

describe('msUntilEnd / isWithinWindow', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');
  it('gelecekteki bitiş → pozitif kalan', () => {
    expect(msUntilEnd(new Date('2026-08-10T12:00:00.000Z'), now)).toBe(2 * 86400 * 1000);
  });
  it('geçmiş bitiş → 0', () => {
    expect(msUntilEnd(new Date('2026-08-01T00:00:00.000Z'), now)).toBe(0);
  });
  it('pencere içindeyse true', () => {
    expect(isWithinWindow(new Date('2026-08-01'), new Date('2026-08-15'), now)).toBe(true);
  });
  it('pencere dışındaysa false', () => {
    expect(isWithinWindow(new Date('2026-08-09'), new Date('2026-08-15'), now)).toBe(false);
  });
});

describe('formatRemaining', () => {
  it('gün+saat', () => {
    expect(formatRemaining((2 * 86400 + 3 * 3600) * 1000)).toBe('2 gün 3 saat');
  });
  it('saat+dakika', () => {
    expect(formatRemaining((5 * 3600 + 20 * 60) * 1000)).toBe('5 saat 20 dakika');
  });
  it('sadece dakika', () => {
    expect(formatRemaining(45 * 60 * 1000)).toBe('45 dakika');
  });
});
