/**
 * Kar Tanesi Yakala — saf simülasyon + sunucu doğrulayıcısı (deterministik replay).
 * DB'ye bağlanmaz; prisma/economy mock'lu.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  ARENA_W,
  DIR_CODE,
  GLOVE_SPEED,
  GLOVE_Y,
  HZ,
  ROUND_STEPS,
  TARGET_CODE,
  createSim,
  itemDrawX,
  replayFrost,
  type FrostSim,
} from '@/components/customer/games/frost-catcher/sim';
import { frostCatcherVerifier } from '@/lib/games/validators/frost-catcher';
import { serverModule } from '@/lib/games/registry/frost-catcher.server';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import { getMiniGame } from '@/lib/minigame-config';
import { frostCatcherGame } from '@/lib/games/registry/frost-catcher';

const DEF = getMiniGame('frost-catcher')!;
const RULES: VerifierRules = {
  gameType: 'frost-catcher',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

type Skill = 'pro' | 'good' | 'weak' | 'idle';

/** Oyuncu botu: istemci gibi girdiyi `sim.ticks` adımında kaydeder; adım başına en fazla 1 hedef. */
function play(seed: string, skill: Skill, maxScore = RULES.maxScore): { sim: FrostSim; log: InputLog; steps: number } {
  const sim = createSim(seed, { maxScore });
  const rec = createInputRecorder();
  const every = skill === 'pro' ? 1 : skill === 'good' ? 8 : skill === 'weak' ? 45 : Infinity;
  let last = -1;
  while (!sim.over) {
    if (sim.ticks % every === 0) {
      // En alttaki iyi eşya (kara buz hariç).
      let best: { x: number; y: number } | null = null;
      for (const it of sim.items) {
        if (it.kind === 'shard' || it.y > GLOVE_Y) continue;
        if (!best || it.y > best.y) best = { x: itemDrawX(it, sim.ticks), y: it.y };
      }
      let goal = best ? best.x : ARENA_W / 2;
      if (skill === 'pro' || skill === 'good') {
        // Usta: inmek üzere olan kara buzun altından çekil (en yakın güvenli konum).
        const danger = sim.items.filter((it) => it.kind === 'shard' && it.y > GLOVE_Y - 110 && it.y < GLOVE_Y + 10);
        const safe = (x: number) => danger.every((d) => Math.abs(itemDrawX(d, sim.ticks) - x) > 38 + 26);
        if (!safe(goal) || !safe(sim.gloveX)) {
          let bestX = goal;
          let bestCost = Infinity;
          for (let x = 38; x <= ARENA_W - 38; x += 6) {
            if (!safe(x)) continue;
            const cost = Math.abs(x - goal) + Math.abs(x - sim.gloveX) * 0.5;
            if (cost < bestCost) {
              bestCost = cost;
              bestX = x;
            }
          }
          goal = bestX;
        }
      }
      const tx = Math.round(Math.min(ARENA_W, Math.max(0, goal)));
      if (tx !== last && !sim.setTarget(tx).illegal) {
        rec.record(sim.ticks, TARGET_CODE, tx);
        last = tx;
      }
    }
    sim.tick();
  }
  return { sim, log: rec.entries(), steps: sim.ticks };
}

const input = (proof: unknown, clientScore: number, serverElapsedSec = 50) => ({
  seed: 's-1',
  rules: RULES,
  proof,
  clientScore,
  serverElapsedSec,
});

describe('frost-catcher sim', () => {
  it('aynı tohum + aynı kayıt → aynı skor (replay)', () => {
    for (const seed of ['a', 'b', 'c', 'kış-2026']) {
      const { sim, log, steps } = play(seed, 'good');
      expect(replayFrost(seed, log, steps, RULES.maxScore)).toEqual({ score: sim.score });
    }
  });

  it('kalibrasyon: usta eşiği geçer ama tavana dayanmaz; hareketsiz oyuncu eşiğin altında', () => {
    const scores: Record<Skill, number[]> = { pro: [], good: [], weak: [], idle: [] };
    for (let i = 0; i < 40; i++) {
      for (const k of Object.keys(scores) as Skill[]) scores[k].push(play(`cal-${i}`, k, 9999).sim.score);
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    if (process.env.FROST_CAL) {
      // eslint-disable-next-line no-console
      console.log('kalibrasyon', {
        pro: avg(scores.pro), good: avg(scores.good), weak: avg(scores.weak), idle: avg(scores.idle),
        proMin: Math.min(...scores.pro), proMax: Math.max(...scores.pro), goodMin: Math.min(...scores.good), weakMax: Math.max(...scores.weak), idleMax: Math.max(...scores.idle),
      });
    }
    // Dikkatli oyuncu ortalamada eşiği geçer; seyrek hareket eden ortalamada geçemez;
    // hareketsiz oyuncu hiç geçemez; hiçbir oyun tavana dayanmaz (tavan yalnız betik sigortası).
    expect(avg(scores.good)).toBeGreaterThanOrEqual(RULES.rewardThreshold);
    expect(avg(scores.weak)).toBeLessThan(RULES.rewardThreshold);
    expect(Math.max(...scores.idle)).toBeLessThan(RULES.rewardThreshold);
    expect(Math.max(...scores.pro, ...scores.good)).toBeLessThan(RULES.maxScore);
  });

  it('çarpışma eldiven hareketsizken de işler (yalnız işaretçi olayına bağlı değil)', () => {
    const { sim } = play('collide', 'idle', 9999);
    expect(sim.caught + (3 - sim.lives)).toBeGreaterThan(0);
  });

  it('eldiven hızı sınırlı: tek adımda ışınlanamaz', () => {
    const sim = createSim('tp', { maxScore: 999 });
    sim.setTarget(0);
    sim.tick();
    expect(Math.abs(sim.gloveX - ARENA_W / 2)).toBeLessThanOrEqual(GLOVE_SPEED / HZ + 1e-9);
  });

  it('klavye yönü eldiveni hareket ettirir ve sınırda durur', () => {
    const sim = createSim('kb', { maxScore: 999 });
    sim.setDir(1);
    for (let i = 0; i < 120; i++) sim.tick();
    expect(sim.gloveX).toBeCloseTo(ARENA_W - 38, 5);
  });

  it('süre dolunca en geç ROUND_STEPS adımında biter', () => {
    const { steps, sim } = play('long', 'pro', 100000);
    expect(sim.over).toBe(true);
    expect(steps).toBeLessThanOrEqual(ROUND_STEPS);
  });
});

describe('frost-catcher doğrulayıcı', () => {
  it('kayıt sunucu modülüne bağlı ve v2/pratik açık', () => {
    expect(serverModule?.verifier).toBe(frostCatcherVerifier);
    expect(frostCatcherGame.component?.contract).toBe('v2');
    expect(frostCatcherGame.modes.practice).toBe(true);
  });

  it('dürüst oyun ödüllenir: sunucu skoru = istemci skoru, bayrak yok', () => {
    const { sim, log, steps } = play('s-1', 'good');
    const out = runVerifier(frostCatcherVerifier, input({ log, steps }, sim.score));
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(sim.score);
    expect(out.verifiedScore).toBeGreaterThanOrEqual(RULES.rewardThreshold);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch sinyali)', () => {
    const { sim, log, steps } = play('s-1', 'weak');
    const out = runVerifier(frostCatcherVerifier, input({ log, steps }, RULES.maxScore));
    expect(out.verifiedScore).toBe(sim.score);
    expect(out.verifiedScore).toBeLessThan(RULES.rewardThreshold);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız tamamlama bloklanır', () => {
    const out = runVerifier(frostCatcherVerifier, input(undefined, 50));
    expect(out.flags).toContain('proof_missing');
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('kurgu kanıt (oyun bitmeden adım beyanı) reddedilir', () => {
    const fake = { log: [[0, TARGET_CODE, 100]] as InputLog, steps: 10 };
    expect(runVerifier(frostCatcherVerifier, input(fake, 40)).flags).toContain('proof_invalid');
  });

  it('aralık dışı hedef / bilinmeyen kod / oyun sonrası girdi → proof_invalid', () => {
    const { log, steps } = play('s-1', 'good');
    const bad: InputLog[] = [
      [[0, TARGET_CODE, 9999], ...log],
      [[0, 99, 1], ...log],
      [...log, [steps, DIR_CODE, 1]],
    ];
    for (const l of bad) {
      expect(runVerifier(frostCatcherVerifier, input({ log: l, steps }, 10)).flags).toContain('proof_invalid');
    }
  });

  it('insanüstü girdi hızı reddedilir', () => {
    const { steps } = play('s-1', 'idle');
    const flood: InputLog = [];
    for (let i = 0; i < 100; i++) flood.push([5, TARGET_CODE, i]);
    expect(runVerifier(frostCatcherVerifier, input({ log: flood, steps }, 0)).flags).toContain('proof_invalid');
  });

  it('hızlandırılmış betik (sunucu süresi < simülasyon süresi) → implausible', () => {
    const { sim, log, steps } = play('s-1', 'pro');
    const out = runVerifier(frostCatcherVerifier, input({ log, steps }, sim.score, 5));
    expect(out.flags).toContain('implausible');
  });

  it('admin tavanı (rules.maxScore) replay skorunu sınırlar', () => {
    const { log, steps } = play('s-1', 'pro', 10);
    const out = runVerifier(frostCatcherVerifier, { ...input({ log, steps }, 10), rules: { ...RULES, maxScore: 10 } });
    expect(out.verifiedScore).toBe(10);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
  });
});
