/**
 * Sinyal Bağla — saf simülasyon + sunucu doğrulayıcısı (deterministik replay). DB'ye bağlanmaz;
 * prisma/economy mock'lu (evaluateAttempt entegrasyonu için).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CODE_BANK,
  CODE_CCW,
  CODE_CW,
  LEVELS,
  MAX_TOTAL_SCORE,
  MIN_MOVE_GAP_TICKS,
  buildLevel,
  createPipeSim,
  cwTurns,
  isSolved,
  replaySignalPipe,
  rotateCCW,
  rotateCW,
  starsForMoves,
} from '@/components/customer/games/signal-pipe/sim';
import { signalPipeVerifier } from '@/lib/games/validators/signal-pipe';
import { serverModule } from '@/lib/games/registry/signal-pipe.server';
import { signalPipeGame } from '@/lib/games/registry/signal-pipe';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import type { InputLog, InputLogEntry } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { getMiniGame } from '@/lib/minigame-config';

const DEF = getMiniGame('signal-pipe')!;
const RULES: VerifierRules = {
  gameType: 'signal-pipe',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

/**
 * Çözüm botu: yol hücrelerini çözüm yönüne çevirir; her dokunuştan önce `think` adım bekler.
 * `waste` → her seviyede önce o kadar boşa (yol dışı) dokunuş.
 */
function play(seed: string, opts: { think?: number; stopAfterLevels?: number; waste?: number } = {}) {
  const sim = createPipeSim(seed);
  const log: InputLog = [];
  const think = opts.think ?? 30;
  let guard = 0;
  while (!sim.over && guard++ < 20_000) {
    if (opts.stopAfterLevels !== undefined && sim.results.length >= opts.stopAfterLevels && !sim.inTransition) {
      if (sim.bank()) log.push([sim.tick, CODE_BANK]);
      break;
    }
    if (sim.inTransition) {
      sim.step();
      continue;
    }
    const lv = sim.level;
    const wasting = sim.moves < (opts.waste ?? 0);
    let target = -1;
    for (let c = 0; c < lv.mask.length; c++) {
      if (lv.locked[c] || !lv.mask[c]) continue;
      if (wasting ? !lv.path[c] : lv.path[c] && cwTurns(lv.mask[c], lv.solution[c]) > 0) {
        target = c;
        break;
      }
    }
    if (target < 0) throw new Error(`hedef yok: ${seed} seviye ${sim.levelNo}`);
    for (let i = 0; i < think && !sim.over; i++) sim.step();
    if (sim.over) break;
    expect(sim.rotate(target, 1).ok).toBe(true);
    log.push([sim.tick, CODE_CW, target]);
  }
  return { sim, log, steps: sim.tick };
}

const verify = (seed: string, proof: unknown, clientScore: number, serverElapsedSec: number) =>
  runVerifier(signalPipeVerifier, { seed, rules: RULES, proof, clientScore, serverElapsedSec });

describe('signal-pipe sim', () => {
  it('döndürme: saat yönü ve tersi birbirinin tersi; cwTurns', () => {
    for (let m = 0; m < 16; m++) expect(rotateCCW(rotateCW(m))).toBe(m);
    expect(rotateCW(1)).toBe(2);
    expect(rotateCW(8)).toBe(1);
    expect(cwTurns(1, 8)).toBe(3);
    expect(cwTurns(5, 5)).toBe(0);
    expect(cwTurns(1, 3)).toBe(-1);
  });

  it('aynı tohum → aynı seviye; başlangıçta çözülmemiş, çözümü çözülmüş, ızgara büyüyor, kilit doğru yönde', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
      for (let l = 1; l <= LEVELS; l++) {
        const lv = buildLevel(seed, l);
        expect(buildLevel(seed, l).mask).toEqual(lv.mask);
        expect(isSolved(lv)).toBe(false);
        expect(isSolved({ ...lv, mask: lv.solution })).toBe(true);
        expect(lv.par).toBeGreaterThanOrEqual(1);
        expect(lv.n).toBe(l <= 3 ? 5 : l <= 7 ? 6 : 7);
        lv.locked.forEach((k, c) => {
          if (k) expect(lv.mask[c]).toBe(lv.solution[c]);
        });
        if (l >= 5) expect(lv.locked.some(Boolean)).toBe(true);
      }
    }
    expect(buildLevel('a', 1).mask).not.toEqual(buildLevel('b', 1).mask);
  });

  it('boş ve kilitli hücre döndürülemez; hız sınırı', () => {
    const sim = createPipeSim('kural');
    for (let i = 0; i < MIN_MOVE_GAP_TICKS; i++) sim.step();
    const empty = sim.level.mask.findIndex((m) => m === 0);
    if (empty >= 0) expect(sim.rotate(empty, 1).ok).toBe(false);
    const c = sim.level.mask.findIndex((m, i) => m !== 0 && !sim.level.path[i]);
    expect(sim.rotate(c, 1).ok).toBe(true);
    expect(sim.rotate(c, 1).ok).toBe(false); // aralıksız
    const lv5 = buildLevel('kural', 5);
    expect(lv5.locked.some(Boolean)).toBe(true);
  });

  it('yıldız: par ve altı 3, ⌈1,5×par⌉ 2, fazlası 1', () => {
    expect(starsForMoves(5, 5)).toBe(3);
    expect(starsForMoves(8, 5)).toBe(2);
    expect(starsForMoves(9, 5)).toBe(1);
  });

  it('süre biter → oyun biter, skor 0 (garanti ödül yok)', () => {
    const sim = createPipeSim('bekle');
    let n = 0;
    while (!sim.over && n++ < 100_000) sim.step();
    expect(sim.endReason).toBe('time');
    expect(sim.score).toBe(0);
  });

  it('dürüst bot 10 seviyeyi bitirir; replay aynı skoru verir; tavan aşılmaz', () => {
    for (const seed of ['durust', 'ikinci', 'ucuncu']) {
      const a = play(seed, { think: 20 });
      expect(a.sim.endReason).toBe('clear');
      expect(a.sim.results).toHaveLength(LEVELS);
      const r = replaySignalPipe(seed, a.log, a.steps);
      expect(r.illegal).toBe(false);
      expect(r.score).toBe(a.sim.score);
      expect(a.sim.score).toBeLessThanOrEqual(MAX_TOTAL_SCORE);
    }
    expect(MAX_TOTAL_SCORE).toBeLessThanOrEqual(DEF.maxScore);
  });

  it('yavaş oyuncu süreye yenilir; replay eşleşir', () => {
    const a = play('yavas', { think: 300 });
    expect(a.sim.endReason).toBe('time');
    expect(a.sim.results.length).toBeLessThan(LEVELS);
    const r = replaySignalPipe('yavas', a.log, a.steps);
    expect(r.illegal).toBe(false);
    expect(r.score).toBe(a.sim.score);
  });
});

describe('signal-pipe doğrulayıcı (hile reddi / dürüst ödül)', () => {
  it('kayıt defteri v2 + deterministik doğrulayıcı bağlı', () => {
    expect(signalPipeGame.component?.contract).toBe('v2');
    expect(signalPipeGame.modes.practice).toBe(true);
    expect(serverModule?.verifier.kind).toBe('deterministic');
  });

  it('dürüst oyun doğrulanır ve eşiği geçince ödüllendirilir', () => {
    const a = play('odul', { think: 40, stopAfterLevels: 6 });
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

  it('israflı ve kısa oyun daha az yıldız alır, eşik altında kalır', () => {
    const a = play('az', { think: 40, stopAfterLevels: 2, waste: 30 });
    expect(a.sim.results.every((r) => r.stars < 3)).toBe(true);
    const out = verify('az', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 2);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
    expect(out.verifiedScore).toBe(a.sim.score);
    expect(out.verifiedScore).toBeLessThan(DEF.rewardThreshold);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch)', () => {
    const a = play('sisir', { stopAfterLevels: 2 });
    const out = verify('sisir', { log: a.log, steps: a.steps }, 4000, a.steps / 60 + 2);
    expect(out.verifiedScore).toBe(a.sim.score);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız gövde ödül almaz', () => {
    expect(hasBlockingVerifierFlag(verify('x', undefined, 3000, 120).flags)).toBe(true);
  });

  it('başka tohumla oynanmış kayıt reddedilir', () => {
    const a = play('baska', { stopAfterLevels: 4 });
    const out = verify('gercek', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 2);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('insan üstü hız (adımlar sıkıştırılmış) reddedilir', () => {
    const a = play('bot', { stopAfterLevels: 3 });
    const squashed: InputLog = a.log.map((e, i) => [i, ...e.slice(1)] as InputLogEntry);
    const out = verify('bot', { log: squashed, steps: squashed.length }, a.sim.score, 60);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('hızlandırılmış betik (sim süresi > sunucu süresi) implausible', () => {
    const a = play('hizli', { stopAfterLevels: 6 });
    const out = verify('hizli', { log: a.log, steps: a.steps }, a.sim.score, 5);
    expect(out.flags).toContain('implausible');
  });

  it('boş/aralık dışı hücre, bilinmeyen kod, bitmemiş oyun kural dışı', () => {
    const lv = buildLevel('kd', 1);
    const empty = lv.mask.findIndex((m) => m === 0);
    if (empty >= 0) expect(replaySignalPipe('kd', [[10, CODE_CW, empty], [20, CODE_BANK]], 20).illegal).toBe(true);
    expect(replaySignalPipe('kd', [[10, 99, 0]], 20).illegal).toBe(true);
    expect(replaySignalPipe('kd', [[10, CODE_CCW, 999]], 20).illegal).toBe(true);
    const c = lv.mask.findIndex((m, i) => m !== 0 && !lv.path[i]);
    expect(replaySignalPipe('kd', [[10, CODE_CW, c]], 30).illegal).toBe(true); // bitmemiş
    expect(replaySignalPipe('kd', [[10, CODE_CW, c], [30, CODE_BANK]], 30).illegal).toBe(false);
    const lv5 = buildLevel('kd', 5);
    expect(lv5.locked.indexOf(true)).toBeGreaterThanOrEqual(0);
  });

  it('makullük: eşik süre sınırında erişilebilir, tavan anında alınamaz', () => {
    expect(DEF.rewardThreshold / (DEF.maxScorePerSec as number)).toBeLessThan(DEF.maxDurationSec as number);
    expect(DEF.maxScore).toBeGreaterThan((DEF.maxScorePerSec as number) * DEF.minDurationSec);
  });
});
