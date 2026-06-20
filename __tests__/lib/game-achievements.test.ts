/**
 * Başarım değerlendirme mantığı: eşik altı kilitli, eşikte/üstünde açık,
 * ilerleme yüzdesi doğru ve cap'li.
 */
import {
  evaluateAchievements,
  ACHIEVEMENTS,
  type AchievementStats,
} from '@/lib/game-achievements';

const ZERO: AchievementStats = {
  totalWins: 0,
  distinctGames: 0,
  bestScore: 0,
  totalPlays: 0,
  streak: 0,
};

describe('evaluateAchievements', () => {
  it('hiç oynanmamışsa hepsi kilitli, ilerleme 0', () => {
    const res = evaluateAchievements(ZERO);
    expect(res).toHaveLength(ACHIEVEMENTS.length);
    expect(res.every((a) => !a.unlocked)).toBe(true);
    expect(res.every((a) => a.progress === 0 && a.pct === 0)).toBe(true);
  });

  it('ilk galibiyet eşikte açılır', () => {
    const res = evaluateAchievements({ ...ZERO, totalWins: 1 });
    const first = res.find((a) => a.id === 'first-win');
    expect(first?.unlocked).toBe(true);
    expect(first?.pct).toBe(100);
  });

  it('eşik altı kilitli ama ilerleme yüzdesi doğru', () => {
    const res = evaluateAchievements({ ...ZERO, totalWins: 5 });
    const win10 = res.find((a) => a.id === 'win-10');
    expect(win10?.unlocked).toBe(false);
    expect(win10?.progress).toBe(5);
    expect(win10?.pct).toBe(50);
  });

  it('hedefin üstünde ilerleme cap’lenir (progress = target)', () => {
    const res = evaluateAchievements({ ...ZERO, streak: 100 });
    const s30 = res.find((a) => a.id === 'streak-30');
    expect(s30?.unlocked).toBe(true);
    expect(s30?.progress).toBe(30);
    expect(s30?.pct).toBe(100);
  });

  it('başarım id’leri benzersiz', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
