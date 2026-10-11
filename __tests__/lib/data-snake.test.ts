/**
 * Veri Yılanı — saf simülasyon + sunucu doğrulayıcısı (deterministik replay).
 * DB'ye bağlanmaz; prisma/economy mock'lu (evaluateAttempt entegrasyonu için).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  DIR,
  GRID,
  LEVELS,
  TOTAL_PACKETS,
  cellX,
  cellY,
  createSnakeSim,
  replayDataSnake,
  starsFor,
  type SnakeSim,
} from '@/components/customer/games/data-snake/sim';
import { dataSnakeVerifier } from '@/lib/games/validators/data-snake';
import { serverModule } from '@/lib/games/registry/data-snake.server';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { getMiniGame } from '@/lib/minigame-config';
import { dataSnakeGame } from '@/lib/games/registry/data-snake';

const DEF = getMiniGame('data-snake')!;
const RULES: VerifierRules = {
  gameType: 'data-snake',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

const DELTA: Record<number, [number, number]> = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] };

/** BFS ile yeme en kısa güvenli yol → ilk yön (yoksa güvenli herhangi bir yön). */
function botDir(sim: SnakeSim): number | null {
  const blocked = new Set<number>([...sim.walls, ...sim.snake.slice(0, -1)]);
  for (const b of sim.bots) b.path.forEach((c) => blocked.add(c));
  const head = sim.snake[0];
  const prev = new Map<number, [number, number]>();
  const q = [head];
  prev.set(head, [-1, 0]);
  while (q.length) {
    const c = q.shift()!;
    if (c === sim.food) {
      let cur = c;
      let first = 0;
      while (cur !== head) {
        const [p, d] = prev.get(cur)!;
        first = d;
        cur = p;
      }
      return first;
    }
    for (const d of [1, 2, 3, 4]) {
      const [dx, dy] = DELTA[d];
      const x = cellX(c) + dx;
      const y = cellY(c) + dy;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      const n = y * GRID + x;
      if (prev.has(n) || blocked.has(n)) continue;
      prev.set(n, [c, d]);
      q.push(n);
    }
  }
  for (const d of [1, 2, 3, 4]) {
    const [dx, dy] = DELTA[d];
    const x = cellX(head) + dx;
    const y = cellY(head) + dy;
    if (x >= 0 && y >= 0 && x < GRID && y < GRID && !blocked.has(y * GRID + x)) return d;
  }
  return null;
}

type Skill = 'pro' | 'suicide' | 'idle';

/** İstemcinin yaptığını yapar: girdiyi `sim.tick`'te, yalnız kabul edileni kaydeder. */
function play(seed: string, skill: Skill, stopAtScore = Infinity) {
  const sim = createSnakeSim(seed);
  const rec = createInputRecorder();
  let lastMoveTimer = -1;
  while (!sim.over && sim.tick < 60 * 60 * 20) {
    if (skill === 'pro' && sim.phase === 'play' && sim.moveTimer !== lastMoveTimer) {
      lastMoveTimer = sim.moveTimer;
      if (sim.score >= stopAtScore) {
        // Kasıtlı olarak kenara sür.
        if (sim.input(DIR.UP)) rec.record(sim.tick, DIR.UP);
      } else if (sim.moveTimer === 1) {
        const d = botDir(sim);
        if (d && sim.input(d)) rec.record(sim.tick, d);
      }
    }
    sim.step();
  }
  return { sim, log: rec.entries(), steps: sim.tick };
}

const verify = (seed: string, proof: unknown, clientScore: number, serverElapsedSec: number) =>
  runVerifier(dataSnakeVerifier, { seed, rules: RULES, proof, clientScore, serverElapsedSec });

describe('Veri Yılanı — simülasyon', () => {
  it('aynı tohum + aynı kayıt → aynı skor (replay ile birebir)', () => {
    const a = play('tohum-a', 'pro');
    expect(a.sim.score).toBeGreaterThan(5);
    const r = replayDataSnake('tohum-a', a.log, a.steps);
    expect(r.illegal).toBe(false);
    expect(r.score).toBe(a.sim.score);
    expect(play('tohum-a', 'pro').sim.score).toBe(a.sim.score);
  });

  it('farklı tohum farklı yem dizisi üretir', () => {
    expect(createSnakeSim('x').food).not.toBe(createSnakeSim('y').food);
  });

  it('girdisiz yılan kenara çarpar, skor 0, ölüm nedeni kenar', () => {
    const { sim } = play('bos', 'idle');
    expect(sim.over).toBe(true);
    expect(sim.score).toBe(0);
    expect(sim.cause).toBe('edge');
  });

  it('180° dönüş ve aynı yön reddedilir; tampon en çok 2', () => {
    const sim = createSnakeSim('t');
    expect(sim.input(DIR.LEFT)).toBe(false);
    expect(sim.input(DIR.RIGHT)).toBe(false);
    expect(sim.input(DIR.UP)).toBe(true);
    expect(sim.input(DIR.DOWN)).toBe(false);
    expect(sim.input(DIR.LEFT)).toBe(true);
    expect(sim.input(DIR.UP)).toBe(false);
    expect(sim.input(9)).toBe(false);
  });

  it('seviye 2+ bot duvarları ve 4+ devriye botları gelir; engeller ızgarayı bölmez', () => {
    let sawWalls = false;
    let sawBots = false;
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const sim = createSnakeSim(seed);
      const rec = createInputRecorder();
      let last = -1;
      while (!sim.over && sim.tick < 60 * 60 * 20) {
        if (sim.phase === 'play' && sim.moveTimer !== last) {
          last = sim.moveTimer;
          if (sim.moveTimer === 1) {
            const d = botDir(sim);
            if (d && sim.input(d)) rec.record(sim.tick, d);
          }
        }
        if (sim.level >= 2 && sim.walls.size > 0) sawWalls = true;
        if (sim.level >= 4 && sim.bots.length > 0) sawBots = true;
        sim.step();
      }
    }
    expect(sawWalls).toBe(true);
    expect(sawBots).toBe(true);
  });

  it('yıldızlar: eşik=1, ara=2, tam tur=3', () => {
    expect(starsFor(11, 12)).toBe(0);
    expect(starsFor(12, 12)).toBe(1);
    expect(starsFor(21, 12)).toBe(2);
    expect(starsFor(TOTAL_PACKETS, 12)).toBe(3);
    expect(LEVELS * 6).toBe(TOTAL_PACKETS);
  });
});

describe('Veri Yılanı — sunucu doğrulayıcısı', () => {
  it('registry v2 + pratik açık; sunucu modülü bu doğrulayıcı', () => {
    expect(dataSnakeGame.component?.contract).toBe('v2');
    expect(dataSnakeGame.modes.practice).toBe(true);
    expect(serverModule?.verifier).toBe(dataSnakeVerifier);
    expect(DEF.maxScore).toBe(TOTAL_PACKETS);
  });

  it('dürüst oyun geçer ve skor sunucunundur', () => {
    const a = play('durust', 'pro');
    const out = verify('durust', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 3);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
    expect(out.verifiedScore).toBe(a.sim.score);
  });

  it('eşiği geçip ÇARPAN oyuncu ödüllendirilir (ölmek ödülü silmez)', () => {
    const a = play('esik', 'pro', DEF.rewardThreshold + 1);
    expect(a.sim.cause).not.toBeNull();
    expect(a.sim.score).toBeGreaterThanOrEqual(DEF.rewardThreshold);
    const rules: GameRules = { ...DEF, enabled: true } as unknown as GameRules;
    const elapsed = a.steps / 60 + 2;
    const now = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));
    const ev = evaluateAttempt(rules, {
      clientScore: a.sim.score,
      clientDurationSec: a.steps / 60,
      startedAt: new Date(now.getTime() - elapsed * 1000),
      expiresAt: new Date(now.getTime() + 60_000),
      now,
      verification: verify('esik', { log: a.log, steps: a.steps }, a.sim.score, elapsed),
    });
    expect(ev.verifiedScore).toBe(a.sim.score);
    expect(ev.won).toBe(true);
    expect(ev.rewardEligible).toBe(true);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch)', () => {
    const a = play('sisir', 'pro', 4);
    const out = verify('sisir', { log: a.log, steps: a.steps }, 30, a.steps / 60 + 3);
    expect(out.verifiedScore).toBe(a.sim.score);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız sahte gövde ödül almaz', () => {
    const out = verify('sahte', undefined, 30, 11);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
    expect(out.verifiedScore).toBe(0);
  });

  it('başka tohumun kaydı bu tohumda tutmaz', () => {
    const a = play('kaynak', 'pro');
    const out = verify('baska', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 3);
    expect(out.verifiedScore === a.sim.score && !hasBlockingVerifierFlag(out.flags)).toBe(false);
  });

  it('hızlandırılmış betik (simülasyon > sunucu süresi) implausible', () => {
    const a = play('hizli', 'pro');
    const out = verify('hizli', { log: a.log, steps: a.steps }, a.sim.score, 10);
    expect(out.flags).toContain('implausible');
  });

  it('kural dışı girdi (180° dönüş) proof_invalid', () => {
    const a = play('kural', 'pro');
    const bad: InputLog = [[1, DIR.LEFT], ...a.log];
    const out = verify('kural', { log: bad, steps: a.steps }, a.sim.score, a.steps / 60 + 3);
    expect(out.flags).toContain('proof_invalid');
  });

  it('bitmemiş oyun (kısaltılmış adım) proof_invalid', () => {
    const a = play('yarim', 'pro');
    const out = verify('yarim', { log: a.log.filter((e) => e[0] < 300), steps: 300 }, 0, a.steps / 60 + 3);
    expect(out.flags).toContain('proof_invalid');
  });
});
