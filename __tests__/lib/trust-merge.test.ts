/**
 * Güven Birleştir — saf simülasyon + sunucu doğrulayıcısı (deterministik replay) + skor
 * normalizasyonu. DB'ye bağlanmaz; prisma/economy mock'lu (evaluateAttempt entegrasyonu için).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CODE_BANK,
  MIN_MOVE_GAP_TICKS,
  createMergeSim,
  replayTrustMerge,
  starsFor,
  type Dir,
  type MergeSim,
} from '@/components/customer/games/trust-merge/sim';
import { trustMergeVerifier } from '@/lib/games/validators/trust-merge';
import { serverModule } from '@/lib/games/registry/trust-merge.server';
import { trustMergeGame } from '@/lib/games/registry/trust-merge';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import type { InputLog } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { getMiniGame } from '@/lib/minigame-config';
import { evaluateAchievements } from '@/lib/game-achievements';

const DEF = getMiniGame('trust-merge')!;
const RULES: VerifierRules = {
  gameType: 'trust-merge',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

/** Basit köşe stratejisi: sol > aşağı > sağ > yukarı (hareket edeni seç). */
function cornerBot(sim: MergeSim): Dir | null {
  for (const d of [3, 2, 4, 1] as Dir[]) if (sim.canMove(d)) return d;
  return null;
}

/** Oyna: her hamle arasında `gap` adım bekler; `stopAt` puana ulaşınca bitirir (bank). */
function play(seed: string, opts: { gap?: number; stopAt?: number } = {}) {
  const sim = createMergeSim(seed);
  const log: InputLog = [];
  const gap = opts.gap ?? 8;
  let guard = 0;
  while (!sim.over && guard++ < 100_000) {
    for (let i = 0; i < gap; i++) sim.step();
    if (opts.stopAt !== undefined && sim.score >= opts.stopAt) {
      sim.bank();
      log.push([sim.tick, CODE_BANK]);
      break;
    }
    const d = cornerBot(sim);
    if (d === null) break;
    const r = sim.move(d);
    expect(r.moved).toBe(true);
    log.push([sim.lastMoveTick, d]);
  }
  return { sim, log, steps: sim.tick };
}

const verify = (seed: string, proof: unknown, clientScore: number, serverElapsedSec: number) =>
  runVerifier(trustMergeVerifier, { seed, rules: RULES, proof, clientScore, serverElapsedSec });

describe('trust-merge sim', () => {
  it('aynı tohum → aynı başlangıç tahtası; farklı tohum → farklı', () => {
    const a = createMergeSim('t1').board.map((t) => t?.value ?? 0);
    const b = createMergeSim('t1').board.map((t) => t?.value ?? 0);
    const c = createMergeSim('t2').board.map((t) => t?.value ?? 0);
    expect(a).toEqual(b);
    expect(a.filter(Boolean)).toHaveLength(2);
    expect(c).not.toEqual(a);
  });

  it('standart 2048: [2,2,2,2] sola → [4,4], tek hamlede çift birleşme yok, puan = birleşim toplamı', () => {
    const sim = createMergeSim('kural');
    const board = sim.board as ({ id: number; value: number } | null)[];
    for (let i = 0; i < 16; i++) board[i] = null;
    [0, 1, 2, 3].forEach((i, k) => (board[i] = { id: 900 + k, value: 2 }));
    for (let i = 0; i < MIN_MOVE_GAP_TICKS; i++) sim.step();
    const r = sim.move(3);
    expect(r.moved).toBe(true);
    expect(board[0]?.value).toBe(4);
    expect(board[1]?.value).toBe(4);
    expect(r.gained).toBe(8);
    expect(sim.score).toBe(8);
  });

  it('hız sınırı: aralıksız ikinci hamle reddedilir', () => {
    const sim = createMergeSim('hiz');
    for (let i = 0; i < MIN_MOVE_GAP_TICKS; i++) sim.step();
    const first = ([1, 2, 3, 4] as Dir[]).find((d) => sim.canMove(d))!;
    expect(sim.move(first).moved).toBe(true);
    const second = ([1, 2, 3, 4] as Dir[]).find((d) => sim.canMove(d))!;
    expect(sim.move(second).moved).toBe(false);
  });

  it('köşe botu oyunu bitirir; replay aynı skoru verir', () => {
    const a = play('durust');
    expect(a.sim.over).toBe(true);
    const r = replayTrustMerge('durust', a.log, a.steps);
    expect(r.illegal).toBe(false);
    expect(r.score).toBe(a.sim.score);
    expect(r.maxTile).toBe(a.sim.maxTile);
  });

  it('yıldızlar eşiğe göre', () => {
    expect(starsFor(0, 1500)).toBe(0);
    expect(starsFor(1500, 1500)).toBe(1);
    expect(starsFor(3750, 1500)).toBe(2);
    expect(starsFor(9000, 1500)).toBe(3);
  });
});

describe('trust-merge doğrulayıcı (hile reddi / dürüst ödül)', () => {
  it('kayıt defteri v2 + deterministik doğrulayıcı bağlı', () => {
    expect(trustMergeGame.component?.contract).toBe('v2');
    expect(trustMergeGame.modes.practice).toBe(true);
    expect(serverModule?.verifier.kind).toBe('deterministic');
  });

  it('dürüst oyun doğrulanır ve eşiği geçince ödüllendirilir', () => {
    const a = play('odul', { stopAt: DEF.rewardThreshold });
    expect(a.sim.score).toBeGreaterThanOrEqual(DEF.rewardThreshold);
    const elapsed = a.steps / 60 + 2;
    const out = verify('odul', { log: a.log, steps: a.steps }, a.sim.score, elapsed);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
    expect(out.verifiedScore).toBe(a.sim.score);

    const now = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));
    const ev = evaluateAttempt({ ...DEF, enabled: true } as unknown as GameRules, {
      clientScore: a.sim.score,
      clientDurationSec: a.steps / 60,
      startedAt: new Date(now.getTime() - elapsed * 1000),
      expiresAt: new Date(now.getTime() + 60_000),
      now,
      verification: out,
    });
    expect(ev.flags).toEqual([]);
    expect(ev.won).toBe(true);
    expect(ev.rewardEligible).toBe(true);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch)', () => {
    const a = play('sisir', { stopAt: 300 });
    const out = verify('sisir', { log: a.log, steps: a.steps }, 9999, a.steps / 60 + 2);
    expect(out.verifiedScore).toBe(a.sim.score);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız gövde ödül almaz', () => {
    const out = verify('sahte', undefined, 2048, 60);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('başka tohumla oynanmış kayıt reddedilir (yeniden çekme işe yaramaz)', () => {
    const a = play('baska', { stopAt: 400 });
    const out = verify('gercek-tohum', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 2);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('insan üstü hız (her adımda hamle) reddedilir', () => {
    const sim = createMergeSim('bot');
    const log: InputLog = [];
    let t = 0;
    while (!sim.over && log.length < 200) {
      for (let i = 0; i < MIN_MOVE_GAP_TICKS; i++) sim.step();
      const d = cornerBot(sim);
      if (!d) break;
      sim.move(d);
      log.push([t++, d]); // kayıtta adımlar sıkıştırılmış
    }
    log.push([t, CODE_BANK]);
    const out = verify('bot', { log, steps: t }, sim.score, 60);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('hızlandırılmış betik (sim süresi > sunucu süresi) implausible', () => {
    const a = play('hizli', { stopAt: DEF.rewardThreshold });
    const out = verify('hizli', { log: a.log, steps: a.steps }, a.sim.score, 5);
    expect(out.flags).toContain('implausible');
  });

  it('etkisiz hamle ve bitmemiş oyun kural dışı', () => {
    const a = play('yarim', { stopAt: 200 });
    const cut = a.log.slice(0, -1); // bank kaydı yok → bitmemiş
    expect(replayTrustMerge('yarim', cut, a.steps).illegal).toBe(true);
    const sim = createMergeSim('etkisiz');
    const dead = ([1, 2, 3, 4] as Dir[]).find((d) => !sim.canMove(d));
    if (dead) expect(replayTrustMerge('etkisiz', [[10, dead], [20, CODE_BANK]], 30).illegal).toBe(true);
  });
});

describe('skor normalizasyonu ve başarımlar', () => {
  it('tek bir 64 karosu artık tavan oranlı başarımı açmaz', () => {
    // Eski birimde skor = 64 (karo). Yeni birimde 64 karosuna ulaşmak ~ 64×5 = 320 birleşim puanı.
    const pct = Math.floor((320 / DEF.maxScore) * 100);
    const ach = evaluateAchievements({ totalWins: 0, distinctGames: 1, bestScore: 320, bestScorePct: pct, totalPlays: 1, streak: 0 });
    expect(ach.find((a) => a.id === 'peak-80')!.unlocked).toBe(false);
  });

  it('eşik ve tavan makul: eşik birleşim puanı, tavan admin sınırı içinde', () => {
    expect(DEF.rewardThreshold).toBeGreaterThan(DEF.maxScore / 20);
    expect(DEF.maxScore).toBeLessThanOrEqual(10_000);
    expect(DEF.rewardThreshold / (DEF.maxScorePerSec as number)).toBeLessThan(DEF.maxDurationSec as number);
  });

  it('köşe botu tipik oyunda eşik bölgesine ulaşır (eşik dürüst oyuncuya erişilebilir)', () => {
    const scores = ['a', 'b', 'c', 'd', 'e'].map((s) => play(`dagilim-${s}`).sim.score);
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(DEF.rewardThreshold);
  });
});
