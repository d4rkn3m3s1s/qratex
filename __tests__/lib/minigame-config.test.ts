/**
 * computeMinigameReward testleri: ödül yalnızca yeterli yıldızda verilir, üst
 * sınır (totalStars) aşılamaz, geçersiz girdiler güvenli ele alınır.
 */
import {
  computeMinigameReward,
  MINIGAME,
  MINI_GAMES,
  getMiniGame,
  computeGameReward,
} from '@/lib/minigame-config';

describe('computeMinigameReward', () => {
  it('eşik altında ödül yok', () => {
    expect(computeMinigameReward(0)).toEqual({ points: 0, xp: 0 });
    expect(computeMinigameReward(MINIGAME.starsForReward - 1)).toEqual({ points: 0, xp: 0 });
  });

  it('eşikte tam ödül verilir', () => {
    expect(computeMinigameReward(MINIGAME.starsForReward)).toEqual({
      points: MINIGAME.rewardPoints,
      xp: MINIGAME.rewardXp,
    });
  });

  it('totalStars üstü değer cap’lenir, yine tam ödül', () => {
    expect(computeMinigameReward(MINIGAME.totalStars + 50)).toEqual({
      points: MINIGAME.rewardPoints,
      xp: MINIGAME.rewardXp,
    });
  });

  it('negatif / ondalık girdiler güvenli', () => {
    expect(computeMinigameReward(-3)).toEqual({ points: 0, xp: 0 });
    expect(computeMinigameReward(4.9)).toEqual({ points: 0, xp: 0 }); // floor → 4 < 5
    expect(computeMinigameReward(5.9)).toEqual({
      points: MINIGAME.rewardPoints,
      xp: MINIGAME.rewardXp,
    });
  });
});

describe('MINI_GAMES registry', () => {
  it('gameType anahtarları benzersiz ve kebab-case', () => {
    const types = MINI_GAMES.map((g) => g.gameType);
    expect(new Set(types).size).toBe(types.length);
    for (const t of types) {
      expect(t).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('her oyunun eşiği skor üst sınırını aşmaz ve ödülü pozitif', () => {
    for (const g of MINI_GAMES) {
      expect(g.rewardThreshold).toBeGreaterThan(0);
      expect(g.rewardThreshold).toBeLessThanOrEqual(g.maxScore);
      expect(g.rewardPoints).toBeGreaterThan(0);
      expect(g.rewardXp).toBeGreaterThan(0);
      expect(g.minDurationSec).toBeGreaterThanOrEqual(1);
    }
  });

  it('getMiniGame bilinen tipi bulur, bilinmeyene undefined', () => {
    expect(getMiniGame(MINI_GAMES[0].gameType)?.gameType).toBe(MINI_GAMES[0].gameType);
    expect(getMiniGame('yok-boyle-oyun')).toBeUndefined();
  });
});

describe('computeGameReward', () => {
  const g = MINI_GAMES[0];

  it('eşik altında ödül yok', () => {
    expect(computeGameReward(g, 0)).toEqual({ points: 0, xp: 0 });
    expect(computeGameReward(g, g.rewardThreshold - 1)).toEqual({ points: 0, xp: 0 });
  });

  it('eşikte ve üstünde tam ödül (cap’li)', () => {
    expect(computeGameReward(g, g.rewardThreshold)).toEqual({
      points: g.rewardPoints,
      xp: g.rewardXp,
    });
    expect(computeGameReward(g, g.maxScore + 999)).toEqual({
      points: g.rewardPoints,
      xp: g.rewardXp,
    });
  });

  it('negatif girdi güvenli', () => {
    expect(computeGameReward(g, -10)).toEqual({ points: 0, xp: 0 });
  });
});
