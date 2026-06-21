/**
 * minigame-config-effective testleri: registry varsayılanı + admin DB override
 * birleştirme mantığı. Kritik: null/boş override alanı registry varsayılanına
 * düşmeli; negatif/geçersiz sayı yok sayılmalı; enabled doğru taşınmalı;
 * computeEffectiveReward eşik+cap'i effective değerlerden uygulamalı.
 */
const mockFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: { miniGameConfig: { findMany: (...a: unknown[]) => mockFindMany(...a) } },
}));

// unstable_cache: testte cache'i baypas et, fonksiyonu doğrudan çağır.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

import {
  getEffectiveMiniGame,
  getEffectiveMiniGames,
  computeEffectiveReward,
} from '@/lib/minigame-config-effective';
import { getMiniGame } from '@/lib/minigame-config';

beforeEach(() => {
  mockFindMany.mockReset();
});

describe('getEffectiveMiniGame — override merge', () => {
  it('override yoksa registry varsayılanı + enabled=true döner', async () => {
    mockFindMany.mockResolvedValue([]);
    const def = getMiniGame('bot-hunter')!;
    const eff = await getEffectiveMiniGame('bot-hunter');
    expect(eff).not.toBeNull();
    expect(eff!.enabled).toBe(true);
    expect(eff!.rewardPoints).toBe(def.rewardPoints);
    expect(eff!.title).toBe(def.title);
    expect(eff!.maxScore).toBe(def.maxScore);
  });

  it('bilinmeyen gameType → null', async () => {
    mockFindMany.mockResolvedValue([]);
    const eff = await getEffectiveMiniGame('does-not-exist');
    expect(eff).toBeNull();
  });

  it('override alanları registry değerini ezer; null alan varsayılana düşer', async () => {
    const def = getMiniGame('bot-hunter')!;
    mockFindMany.mockResolvedValue([
      {
        gameType: 'bot-hunter',
        enabled: true,
        rewardPoints: 999, // ez
        rewardXp: null, // varsayılana düş
        rewardThreshold: null,
        minDurationSec: null,
        maxScore: null,
        title: 'Yeni Başlık', // ez
        description: null,
        emoji: null,
        accent: null,
      },
    ]);
    const eff = await getEffectiveMiniGame('bot-hunter');
    expect(eff!.rewardPoints).toBe(999);
    expect(eff!.rewardXp).toBe(def.rewardXp); // null → varsayılan
    expect(eff!.title).toBe('Yeni Başlık');
    expect(eff!.description).toBe(def.description); // null → varsayılan
  });

  it('boş string görsel alan varsayılana düşer (geçersiz override yok sayılır)', async () => {
    const def = getMiniGame('bot-hunter')!;
    mockFindMany.mockResolvedValue([
      { gameType: 'bot-hunter', enabled: true, title: '   ', emoji: '', accent: null,
        description: null, rewardPoints: null, rewardXp: null, rewardThreshold: null,
        minDurationSec: null, maxScore: null },
    ]);
    const eff = await getEffectiveMiniGame('bot-hunter');
    expect(eff!.title).toBe(def.title); // boşluk → varsayılan
    expect(eff!.emoji).toBe(def.emoji); // '' → varsayılan
  });

  it('enabled=false override taşınır (pasif oyun)', async () => {
    mockFindMany.mockResolvedValue([
      { gameType: 'bot-hunter', enabled: false, title: null, description: null, emoji: null,
        accent: null, rewardPoints: null, rewardXp: null, rewardThreshold: null,
        minDurationSec: null, maxScore: null },
    ]);
    const eff = await getEffectiveMiniGame('bot-hunter');
    expect(eff!.enabled).toBe(false);
  });
});

describe('getEffectiveMiniGames — toplu', () => {
  it('DB erişilemezse (throw) registry varsayılanlarına düşer, oyunlar açık kalır', async () => {
    mockFindMany.mockRejectedValue(new Error('db down'));
    const all = await getEffectiveMiniGames();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((g) => g.enabled === true)).toBe(true);
  });
});

describe('computeEffectiveReward — eşik & cap', () => {
  const game = { ...getMiniGame('bot-hunter')!, enabled: true };

  it('skor eşik altında → ödül yok', () => {
    const r = computeEffectiveReward(game, game.rewardThreshold - 1);
    expect(r).toEqual({ points: 0, xp: 0 });
  });

  it('skor eşik veya üstü → sabit ödül', () => {
    const r = computeEffectiveReward(game, game.rewardThreshold);
    expect(r).toEqual({ points: game.rewardPoints, xp: game.rewardXp });
  });

  it('skor maxScore üstü olsa bile cap uygulanır (yine ödül, abartılı puan yok)', () => {
    const r = computeEffectiveReward(game, game.maxScore + 10_000);
    expect(r).toEqual({ points: game.rewardPoints, xp: game.rewardXp });
  });

  it('negatif skor → ödül yok', () => {
    const r = computeEffectiveReward(game, -50);
    expect(r).toEqual({ points: 0, xp: 0 });
  });
});
