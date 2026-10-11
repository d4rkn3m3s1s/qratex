/**
 * Spam Kırıcı — saf simülasyon + sunucu doğrulayıcısı (deterministik replay).
 * DB'ye bağlanmaz; prisma/economy mock'lu.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CODE_HOLD,
  CODE_LAUNCH,
  CODE_TARGET,
  HZ,
  LEVEL_PATTERNS,
  MAX_TICKS,
  MAX_TOTAL_HITS,
  SB_W,
  createBreakerSim,
  patternHits,
  replaySpamBreaker,
  starsFor,
  type BreakerSim,
} from '@/components/customer/games/spam-breaker/sim';
import { serverModule } from '@/lib/games/registry/spam-breaker.server';
import { spamBreakerGame } from '@/lib/games/registry/spam-breaker';
import { runVerifier, hasBlockingVerifierFlag, type AnyGameVerifier, type VerifierRules } from '@/lib/games/verify';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import { getMiniGame } from '@/lib/minigame-config';

const DEF = getMiniGame('spam-breaker')!;
const RULES: VerifierRules = {
  gameType: 'spam-breaker',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};
const verifier = serverModule!.verifier as AnyGameVerifier;

/**
 * Bot: kalkanı topun altında tutar, her kalkan vuruşunda nişan kaymasını değiştirir (açı çeşitliliği).
 * `maxTicks` ile erken kesilebilir. Yalnız sim'in kabul ettiği girdi kayda girer.
 */
function playBot(seed: string, opts: { maxTicks?: number; sloppy?: boolean } = {}) {
  const sim = createBreakerSim(seed, { events: true });
  const rec = createInputRecorder();
  const offsets = opts.sloppy ? [-60, 60, 0, -45, 45] : [-25, 12, 0, -12, 25, -6, 6];
  let k = 0;
  let off = 0;
  let lastTarget = -1;
  const limit = opts.maxTicks ?? MAX_TICKS + 10;
  while (!sim.over && sim.tick < limit) {
    if (sim.phase === 'serve' && sim.tick % 37 === 5 && sim.input(CODE_LAUNCH)) rec.record(sim.tick, CODE_LAUNCH);
    if (sim.tick % 2 === 0) {
      const t = Math.max(0, Math.min(SB_W, Math.round(sim.ballX + off)));
      if (t !== lastTarget && sim.input(CODE_TARGET, t)) {
        rec.record(sim.tick, CODE_TARGET, t);
        lastTarget = t;
      }
    }
    sim.step();
    for (const e of sim.drainEvents()) if (e.t === 'paddle') off = offsets[++k % offsets.length];
  }
  return { sim, log: rec.entries(), steps: sim.tick };
}

describe('Spam Kırıcı simülasyonu', () => {
  it('desen satırları 8 sütun; tavan skor = büyük varyantların toplamı ve sunucu maxScore ile hizalı', () => {
    for (const variants of LEVEL_PATTERNS) for (const v of variants) for (const r of v) expect(r).toHaveLength(8);
    expect(MAX_TOTAL_HITS).toBe(
      LEVEL_PATTERNS.reduce((s, vs) => s + Math.max(...vs.map((v) => patternHits(v))), 0)
    );
    expect(DEF.maxScore).toBe(MAX_TOTAL_HITS);
    expect(DEF.rewardThreshold).toBeLessThan(DEF.maxScore);
  });

  it('aynı tohum + aynı kayıt → aynı skor (determinizm)', () => {
    const a = playBot('det-1', { sloppy: true });
    const b = replaySpamBreaker('det-1', a.log, a.steps);
    expect(b.illegal).toBe(false);
    expect(b.score).toBe(a.sim.score);
  });

  it('hız tazeleme hızından bağımsız: adım başına top yer değiştirmesi sabit', () => {
    const sim = createBreakerSim('speed');
    sim.input(CODE_LAUNCH);
    sim.step();
    const d1 = Math.hypot(sim.ballX - sim.prevBallX, sim.ballY - sim.prevBallY);
    sim.step();
    const d2 = Math.hypot(sim.ballX - sim.prevBallX, sim.ballY - sim.prevBallY);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.05);
  });

  it('servis 3 sn içinde fırlatılmazsa top kendiliğinden fırlar', () => {
    const sim = createBreakerSim('auto');
    for (let i = 0; i < 3 * HZ + 1; i++) sim.step();
    expect(sim.phase).toBe('play');
  });

  it('kural dışı girdi reddedilir (oyun sırasında fırlat, aralık dışı hedef, geçersiz yön)', () => {
    const sim = createBreakerSim('rules');
    expect(sim.input(CODE_TARGET, 9999)).toBe(false);
    expect(sim.input(CODE_TARGET, 12.5)).toBe(false);
    expect(sim.input(CODE_HOLD, 2)).toBe(false);
    expect(sim.input(99)).toBe(false);
    expect(sim.input(CODE_LAUNCH)).toBe(true);
    expect(sim.input(CODE_LAUNCH)).toBe(false);
  });

  it('iyi oynayan bot eşiği geçer; hiç oynamayan eşiğin altında kalır', () => {
    const good = playBot('skill-1');
    expect(good.sim.over).toBe(true);
    expect(good.sim.score).toBeGreaterThanOrEqual(DEF.rewardThreshold);
    const idle = createBreakerSim('idle');
    while (!idle.over) idle.step();
    expect(idle.score).toBeLessThan(DEF.rewardThreshold);
    expect(idle.cause).toBe('lives');
  });

  it('klavye yönü kalkanı sabit hızda sürer ve hedefi iptal eder', () => {
    const sim = createBreakerSim('hold');
    const x0 = sim.paddleX;
    expect(sim.input(CODE_HOLD, 1)).toBe(true);
    for (let i = 0; i < 5; i++) sim.step();
    expect(sim.paddleX).toBe(x0 + 30);
    expect(sim.input(CODE_HOLD, 0)).toBe(true);
    sim.step();
    expect(sim.paddleX).toBe(x0 + 30);
  });

  it('top kaçınca can gider; eşiği geçmiş skor silinmez', () => {
    const r = playBot('lose-1', { sloppy: true });
    expect(r.sim.over).toBe(true);
    const replay = replaySpamBreaker('lose-1', r.log, r.steps);
    expect(replay.score).toBe(r.sim.score);
  });

  it('yıldızlar: eşik 1, yarı 2, tam temizlik 3', () => {
    expect(starsFor(0, 40, false)).toBe(0);
    expect(starsFor(40, 40, false)).toBe(1);
    expect(starsFor(MAX_TOTAL_HITS - 1, 40, false)).toBe(2);
    expect(starsFor(10, 40, true)).toBe(3);
  });
});

describe('Spam Kırıcı sunucu doğrulayıcısı', () => {
  const honest = playBot('srv-1');
  const elapsed = honest.steps / 60 + 2;

  it('dürüst kanıt: sunucu skoru = istemci skoru, bloklayan bayrak yok, eşik geçilir', () => {
    const out = runVerifier(verifier, {
      seed: 'srv-1',
      rules: RULES,
      proof: { log: honest.log, steps: honest.steps },
      clientScore: honest.sim.score,
      serverElapsedSec: elapsed,
    });
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
    expect(out.verifiedScore).toBe(Math.min(RULES.maxScore, honest.sim.score));
    expect(out.verifiedScore).toBeGreaterThanOrEqual(RULES.rewardThreshold);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch sinyali)', () => {
    const out = runVerifier(verifier, {
      seed: 'srv-1',
      rules: RULES,
      proof: { log: honest.log, steps: honest.steps },
      clientScore: RULES.maxScore,
      serverElapsedSec: elapsed,
    });
    expect(out.verifiedScore).toBe(honest.sim.score);
    expect(out.flags).toContain('score_mismatch');
  });

  it('başka tohumla oynanmış kayıt kabul edilmez ya da aynı skoru vermez', () => {
    const out = runVerifier(verifier, {
      seed: 'srv-OTHER',
      rules: RULES,
      proof: { log: honest.log, steps: honest.steps },
      clientScore: honest.sim.score,
      serverElapsedSec: elapsed,
    });
    expect(hasBlockingVerifierFlag(out.flags) || out.verifiedScore !== honest.sim.score).toBe(true);
  });

  it('kanıtsız → proof_missing; hızlandırılmış betik → implausible; uydurma kayıt → proof_invalid', () => {
    const none = runVerifier(verifier, {
      seed: 'srv-1',
      rules: RULES,
      proof: undefined,
      clientScore: 100,
      serverElapsedSec: elapsed,
    });
    expect(none.flags).toContain('proof_missing');

    const fast = runVerifier(verifier, {
      seed: 'srv-1',
      rules: RULES,
      proof: { log: honest.log, steps: honest.steps },
      clientScore: honest.sim.score,
      serverElapsedSec: 5,
    });
    expect(fast.flags).toContain('implausible');

    const forged: InputLog = [[0, CODE_LAUNCH], [1, CODE_LAUNCH]];
    const bad = runVerifier(verifier, {
      seed: 'srv-1',
      rules: RULES,
      proof: { log: forged, steps: 200 },
      clientScore: 50,
      serverElapsedSec: elapsed,
    });
    expect(bad.flags).toContain('proof_invalid');
    expect(bad.verifiedScore).toBe(0);
  });

  it('beyan edilen adım sayısı oyunun bitişiyle tutmazsa reddedilir', () => {
    const out = runVerifier(verifier, {
      seed: 'srv-1',
      rules: RULES,
      proof: { log: honest.log, steps: honest.steps + 500 },
      clientScore: honest.sim.score,
      serverElapsedSec: elapsed + 20,
    });
    expect(out.flags).toContain('proof_invalid');
  });

  it('kayıt defteri v2 + deterministik + pratik açık', () => {
    expect(spamBreakerGame.component.contract).toBe('v2');
    expect(spamBreakerGame.verification).toBe('deterministic');
    expect(spamBreakerGame.modes.practice).toBe(true);
  });
});
