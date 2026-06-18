/**
 * computeMinigameReward testleri: ödül yalnızca yeterli yıldızda verilir, üst
 * sınır (totalStars) aşılamaz, geçersiz girdiler güvenli ele alınır.
 */
import { computeMinigameReward, MINIGAME } from '@/lib/minigame-config';

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
