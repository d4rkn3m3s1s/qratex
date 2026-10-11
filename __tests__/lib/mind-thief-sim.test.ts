/**
 * Zihin Hırsızı — saf simülasyon + sunucu doğrulayıcısı (replay). DB yok.
 */
import { createSim, replayMindThief, HIT_CODE, MIN_REACT_STEPS, ROUND_STEPS, type MindThiefSim } from '@/components/customer/games/mind-thief/sim';
import { serverModule } from '@/lib/games/registry/mind-thief.server';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import type { InputLog } from '@/lib/games/engine/record';

const RULES: VerifierRules = {
  gameType: 'mind-thief',
  maxScore: 30,
  rewardThreshold: 15,
  minDurationSec: 8,
  maxScorePerSec: 2.7,
  maxDurationSec: 240,
};

/** İnsan benzeri oyuncu: bozuk kartı ~0,4 sn sonra vurur, güçleri toplar; ara sıra gerçek karta hata yapar. */
function playHonest(seed: string, opts: { reactSteps?: number; mistakeEvery?: number; maxScore?: number } = {}) {
  const react = opts.reactSteps ?? 24;
  const sim: MindThiefSim = createSim(seed, { maxScore: opts.maxScore ?? RULES.maxScore });
  const log: InputLog = [];
  let n = 0;
  let lastHitStep = -100;
  while (!sim.over) {
    if (sim.ticks - lastHitStep >= 8) {
      const target = sim.entities.find(
        (e) => e.kind !== 'genuine' && sim.ticks - e.bornStep >= react
      );
      const mistake =
        opts.mistakeEvery && sim.entities.find((e) => e.kind === 'genuine' && sim.ticks - e.bornStep >= react);
      if (mistake && ++n % opts.mistakeEvery! === 0) {
        log.push([sim.ticks, HIT_CODE, mistake.id]);
        sim.hit(mistake.id);
        lastHitStep = sim.ticks;
      } else if (target) {
        log.push([sim.ticks, HIT_CODE, target.id]);
        const r = sim.hit(target.id);
        expect(r.illegal).toBe(false);
        lastHitStep = sim.ticks;
      }
    }
    if (sim.over) break;
    sim.tick();
  }
  return { score: sim.score, steps: sim.ticks, log, sim };
}

const verify = (proof: unknown, clientScore: number, serverElapsedSec = 50, seed = 'seed-a') =>
  runVerifier(serverModule.verifier, { seed, rules: RULES, proof, clientScore, serverElapsedSec });

describe('mind-thief sim', () => {
  it('aynı tohum + aynı kayıt → aynı skor (determinizm)', () => {
    const a = playHonest('seed-a');
    const b = playHonest('seed-a');
    expect(a.score).toBe(b.score);
    expect(a.log).toEqual(b.log);
    expect(replayMindThief('seed-a', a.log, a.steps, RULES.maxScore)).toEqual({ score: a.score });
  });

  it('farklı tohum farklı doğuş dizisi üretir', () => {
    const a = createSim('x1', { maxScore: 30 });
    const b = createSim('x2', { maxScore: 30 });
    for (let i = 0; i < 200; i++) {
      a.tick();
      b.tick();
    }
    expect(a.entities.map((e) => [e.kind, Math.round(e.x)])).not.toEqual(b.entities.map((e) => [e.kind, Math.round(e.x)]));
  });

  it('hiç dokunmayan oyuncu bozuk sızıntılarıyla canlarını kaybeder ve skor 0', () => {
    const sim = createSim('idle', { maxScore: 30 });
    while (!sim.over) sim.tick();
    expect(sim.score).toBe(0);
    expect(sim.endReason).toBe('lives');
    expect(sim.ticks).toBeLessThan(ROUND_STEPS);
  });

  it('gerçek yoruma dokunmak can götürür, kombo sıfırlanır', () => {
    const sim = createSim('wrong', { maxScore: 30 });
    let g;
    while (!(g = sim.entities.find((e) => e.kind === 'genuine' && sim.ticks - e.bornStep >= MIN_REACT_STEPS))) sim.tick();
    const r = sim.hit(g.id);
    expect(r.illegal).toBe(false);
    expect(sim.lives).toBe(2);
    expect(sim.combo).toBe(0);
  });

  it('maxScore (admin override) tavanında oyun biter', () => {
    const r = playHonest('cap', { maxScore: 5 });
    expect(r.score).toBe(5);
    expect(r.sim.endReason).toBe('max');
  });
});

describe('mind-thief sunucu doğrulayıcısı', () => {
  it('dürüst oyun: skor birebir doğrulanır, eşik geçilir, engelleyici bayrak yok', () => {
    const r = playHonest('seed-a');
    expect(r.score).toBeGreaterThanOrEqual(RULES.rewardThreshold);
    const out = verify({ log: r.log, steps: r.steps }, r.score, Math.ceil(r.steps / 60) + 2);
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(r.score);
  });

  it('hatalı ama dürüst oyun da doğrulanır (gerçek yoruma dokunma kayıtta)', () => {
    const r = playHonest('seed-b', { mistakeEvery: 9 });
    const out = verify({ log: r.log, steps: r.steps }, r.score, 60, 'seed-b');
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
    expect(out.verifiedScore).toBe(r.score);
  });

  it('HİLE: şişirilmiş skor beyanı sunucu skoruna iner', () => {
    const r = playHonest('seed-a', { mistakeEvery: 2 });
    expect(r.score).toBeLessThan(30);
    const out = verify({ log: r.log, steps: r.steps }, 30, 60);
    expect(out.verifiedScore).toBe(r.score);
    expect(out.flags).toContain('score_mismatch');
  });

  it('HİLE: kanıtsız tamamlama reddedilir', () => {
    expect(verify(undefined, 30).flags).toContain('proof_missing');
  });

  it('HİLE: boş kayıtla 30 beyanı → sunucu skoru 0', () => {
    const out = verify({ log: [], steps: 600 }, 30, 60);
    expect(out.verifiedScore).toBe(0);
  });

  it('HİLE: olmayan varlığa dokunuş → proof_invalid', () => {
    const out = verify({ log: [[100, HIT_CODE, 9999]], steps: 200 }, 1, 60);
    expect(out.flags).toContain('proof_invalid');
  });

  it('HİLE: insanüstü tepki (kart belirir belirmez) → proof_invalid', () => {
    const sim = createSim('seed-a', { maxScore: 30 });
    while (!sim.entities.length) sim.tick();
    const e = sim.entities[0];
    const out = verify({ log: [[sim.ticks, HIT_CODE, e.id]], steps: sim.ticks + 10 }, 1, 60);
    expect(out.flags).toContain('proof_invalid');
  });

  it('HİLE: hızlandırılmış betik (simülasyon süresi > sunucu süresi) → implausible', () => {
    const r = playHonest('seed-a');
    const out = verify({ log: r.log, steps: r.steps }, r.score, 10);
    expect(out.flags).toContain('implausible');
    expect(out.verifiedScore).toBe(0);
  });

  it('HİLE: başka tohumun kaydı bu denemede geçmez', () => {
    const r = playHonest('seed-other');
    const out = verify({ log: r.log, steps: r.steps }, r.score, 60, 'seed-a');
    expect(hasBlockingVerifierFlag(out.flags) || out.verifiedScore < r.score).toBe(true);
  });

  it('HİLE: adım sayısını kısaltmak/uzatmak reddedilir', () => {
    const r = playHonest('seed-a');
    expect(verify({ log: r.log, steps: r.steps + 30 }, r.score, 60).flags).toContain('proof_invalid');
  });

  it('HİLE: bilinmeyen girdi kodu → proof_invalid', () => {
    expect(verify({ log: [[50, 5]], steps: 100 }, 0, 60).flags).toContain('proof_invalid');
  });
});
