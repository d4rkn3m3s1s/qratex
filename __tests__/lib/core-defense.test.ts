/**
 * Çekirdek Savunması — saf simülasyon + sunucu doğrulayıcısı (deterministik replay).
 * DB'ye bağlanmaz; prisma/economy mock'lu (evaluateAttempt entegrasyonu için).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CD_CODE,
  CORE_X,
  CORE_Y,
  TOTAL_WAVES,
  createCoreSim,
  replayCoreDefense,
  starsFor,
  waveSpec,
  type CoreSim,
} from '@/components/customer/games/core-defense/sim';
import { coreDefenseVerifier } from '@/lib/games/validators/core-defense';
import { serverModule } from '@/lib/games/registry/core-defense.server';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { getMiniGame } from '@/lib/minigame-config';
import { coreDefenseGame } from '@/lib/games/registry/core-defense';

const DEF = getMiniGame('core-defense')!;
const RULES: VerifierRules = {
  gameType: 'core-defense',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

type Skill = 'pro' | 'good' | 'weak' | 'idle';

/**
 * Oyuncu botu: istemcinin yapacağını yapar (girdiyi `sim.tick`'te kaydeder, yalnız kabul
 * edileni). `pro` dokunuşla en yakın hedefi vurur ve kalkanı kullanır; `weak` seyrek ateş eder.
 */
function play(seed: string, skill: Skill, maxTicks = 9 * 60 * 60): { sim: CoreSim; log: InputLog; steps: number } {
  const sim = createCoreSim(seed);
  const rec = createInputRecorder();
  const every = skill === 'pro' ? 1 : skill === 'good' ? 20 : skill === 'weak' ? 60 : Infinity;
  const send = (code: number, a?: number, b?: number) => {
    if (sim.input(code, a, b)) rec.record(sim.tick, code, a, b);
  };
  while (!sim.over && sim.tick < maxTicks) {
    if (sim.phase === 'pick' && skill !== 'idle' && sim.phaseTicks < 12 * 60 - 90) send(CD_CODE.PICK, sim.tick % 3 === 0 ? 1 : 0);
    if ((sim.phase === 'wave' || sim.phase === 'intro') && sim.tick % every === 0 && sim.cooldown === 0) {
      // En yakın (çekirdeğe) düşmana dokun.
      let best = null as null | { x: number; y: number; d: number };
      for (const e of sim.enemies) {
        if (e.x < 0 || e.x > 360 || e.y < 0 || e.y > 480) continue;
        const d = (e.x - CORE_X) ** 2 + (e.y - CORE_Y) ** 2;
        if (!best || d < best.d) best = { x: Math.round(e.x), y: Math.round(e.y), d };
      }
      if (best) send(CD_CODE.TAP, best.x, best.y);
    }
    if (skill === 'pro' && sim.charge >= 1 && sim.enemies.filter((e) => (e.x - CORE_X) ** 2 + (e.y - CORE_Y) ** 2 < 110 * 110).length >= 3) {
      send(CD_CODE.PULSE);
    }
    sim.step();
  }
  return { sim, log: rec.entries(), steps: sim.tick };
}

const verify = (seed: string, proof: unknown, clientScore: number, serverElapsedSec: number) =>
  runVerifier(coreDefenseVerifier, { seed, rules: RULES, proof, clientScore, serverElapsedSec });

describe('Çekirdek Savunması — simülasyon', () => {
  it('aynı tohum + aynı kayıt → aynı skor (replay ile birebir)', () => {
    const a = play('tohum-a', 'good');
    const r = replayCoreDefense('tohum-a', a.log, a.steps);
    expect(r.illegal).toBeFalsy();
    expect(r.score).toBe(a.sim.score);
    const b = play('tohum-a', 'good');
    expect(b.sim.score).toBe(a.sim.score);
    expect(b.log).toEqual(a.log);
  });

  it('farklı tohum farklı doğuş dizisi üretir', () => {
    const a = createCoreSim('x1');
    const b = createCoreSim('x2');
    for (let i = 0; i < 400; i++) {
      a.step();
      b.step();
    }
    expect(a.enemies.map((e) => [Math.round(e.x), Math.round(e.y)])).not.toEqual(
      b.enemies.map((e) => [Math.round(e.x), Math.round(e.y)])
    );
  });

  it('hiç oynamayan oyuncu çekirdeği kaybeder (kaybetme koşulu gerçek)', () => {
    const { sim } = play('bos', 'idle');
    expect(sim.over).toBe(true);
    expect(sim.won).toBe(false);
    expect(sim.coreHp).toBe(0);
    expect(sim.score).toBe(0);
  });

  it('zorluk eğrisi: dalgalar büyür, aralık kısalır, 4 ve 8 boss', () => {
    for (let w = 2; w <= TOTAL_WAVES; w++) {
      expect(waveSpec(w).count).toBeGreaterThan(waveSpec(w - 1).count);
      expect(waveSpec(w).interval).toBeLessThanOrEqual(waveSpec(w - 1).interval);
    }
    expect(waveSpec(4).boss && waveSpec(8).boss && !waveSpec(3).boss).toBe(true);
  });

  it('beceri ödüllenir: usta > iyi > zayıf; usta ödül eşiğini geçer, zayıf geçemez', () => {
    const seeds = ['s1', 's2', 's3', 's4'];
    for (const s of seeds) {
      const pro = play(s, 'pro').sim;
      const good = play(s, 'good').sim;
      const weak = play(s, 'weak').sim;
      expect(pro.score).toBeGreaterThanOrEqual(good.score);
      expect(good.score).toBeGreaterThan(weak.score);
      expect(pro.score).toBeGreaterThanOrEqual(DEF.rewardThreshold);
      expect(weak.score).toBeLessThan(DEF.rewardThreshold);
      expect(pro.score).toBeLessThanOrEqual(DEF.maxScore);
    }
  });

  it('kalkan darbesi menzildeki her düşmana TEK kez vurur (eski 3-4 kat hasar hatası)', () => {
    const sim = createCoreSim('kalkan');
    while (sim.phase !== 'wave' || sim.enemies.filter((e) => e.kind === 'spam').length < 1) sim.step();
    // Kalkanı doldurmak için doğrudan dokunuşlarla öldürmek yerine durumu ilerlet.
    while (sim.charge < 1 && !sim.over) {
      const e = sim.enemies[0];
      if (e && sim.cooldown === 0) sim.input(CD_CODE.TAP, Math.round(e.x), Math.round(e.y));
      sim.step();
    }
    expect(sim.input(CD_CODE.PULSE)).toBe(true);
    expect(sim.charge).toBe(0);
    expect(sim.input(CD_CODE.PULSE)).toBe(false); // dolmamış kalkan reddedilir
  });

  it('dokunma: çekirdek çevresinde ölü bölge yok — düşmanın üstüne dokunmak onu vurur', () => {
    const sim = createCoreSim('olu-bolge');
    while (!sim.enemies.some((e) => Math.hypot(e.x - CORE_X, e.y - CORE_Y) < 70) && !sim.over) sim.step();
    const e = sim.enemies.find((x) => Math.hypot(x.x - CORE_X, x.y - CORE_Y) < 70)!;
    const before = sim.hits;
    sim.input(CD_CODE.TAP, Math.round(e.x), Math.round(e.y));
    expect(sim.hits).toBe(before + 1);
  });

  it('yıldızlar: eşik / zafer / zafer + sağlam çekirdek', () => {
    expect(starsFor({ score: 10, won: false, coreHp: 0, coreMaxHp: 10 }, 100)).toBe(0);
    expect(starsFor({ score: 120, won: false, coreHp: 0, coreMaxHp: 10 }, 100)).toBe(1);
    expect(starsFor({ score: 200, won: true, coreHp: 3, coreMaxHp: 10 }, 100)).toBe(2);
    expect(starsFor({ score: 250, won: true, coreHp: 6, coreMaxHp: 10 }, 100)).toBe(3);
  });
});

describe('Çekirdek Savunması — sunucu doğrulayıcısı', () => {
  it('kayıt defteri ve sunucu modülü deterministik doğrulayıcıyla bağlı', () => {
    expect(serverModule?.verifier.kind).toBe('deterministic');
    expect(coreDefenseGame.verification).toBe('deterministic');
    expect(coreDefenseGame.status).toBe('live');
    expect(DEF.hidden).toBeFalsy();
  });

  it('dürüst oyun: sunucu skoru = istemci skoru, bloklayan bayrak yok, ödüle uygun', () => {
    const { sim, log, steps } = play('durust', 'pro');
    const elapsed = steps / 60 + 2;
    const out = verify('durust', { log, steps }, sim.score, elapsed);
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(sim.score);

    const game: GameRules = { ...DEF, enabled: true } as unknown as GameRules;
    const now = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));
    const ev = evaluateAttempt(game, {
      clientScore: sim.score,
      clientDurationSec: steps / 60,
      startedAt: new Date(now.getTime() - elapsed * 1000),
      expiresAt: new Date(now.getTime() + 60_000),
      now,
      verification: out,
    });
    expect(ev.won).toBe(true);
    expect(ev.rewardEligible).toBe(true);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch sinyali, ödül yine sunucu skorundan)', () => {
    const { sim, log, steps } = play('sisir', 'weak');
    const out = verify('sisir', { log, steps }, DEF.maxScore, steps / 60 + 2);
    expect(out.verifiedScore).toBe(sim.score);
    expect(out.flags).toContain('score_mismatch');
    expect(out.verifiedScore).toBeLessThan(DEF.rewardThreshold);
  });

  it('kanıtsız tamamlama reddedilir (proof_missing)', () => {
    const out = verify('kanitsiz', undefined, 300, 120);
    expect(out.flags).toEqual(['proof_missing']);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('başka tohumun kaydı bu tohumda tutmaz (kayıt kopyalama) → proof_invalid', () => {
    const { sim, log, steps } = play('kaynak', 'pro');
    const out = verify('baska-tohum', { log, steps }, sim.score, steps / 60 + 2);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('dolmamış kalkan / seçim dışı yükseltme gibi kural dışı girdi → proof_invalid', () => {
    const { sim, log, steps } = play('kural', 'good');
    const forged: InputLog = [[0, CD_CODE.PULSE], ...log];
    const out = verify('kural', { log: forged, steps }, sim.score, steps / 60 + 2);
    expect(out.flags).toContain('proof_invalid');
    const forged2: InputLog = [[5, CD_CODE.PICK, 0], ...log.filter((e) => e[0] > 5)];
    expect(verify('kural', { log: forged2, steps }, sim.score, steps / 60 + 2).flags).toContain('proof_invalid');
  });

  it('beyan edilen adımda bitmemiş oyun (erken kesilmiş kayıt) → proof_invalid', () => {
    const { sim, log, steps } = play('erken', 'pro');
    const out = verify('erken', { log, steps: Math.floor(steps / 2) }, sim.score, steps / 60 + 2);
    expect(out.flags).toContain('proof_invalid');
  });

  it('hızlandırılmış betik (simülasyon süresi > sunucu süresi) → implausible', () => {
    const { sim, log, steps } = play('hizli', 'pro');
    const out = verify('hizli', { log, steps }, sim.score, steps / 60 / 3);
    expect(out.flags).toContain('implausible');
  });

  it('bozuk kanıt şekli → proof_invalid, asla fırlatmaz', () => {
    expect(verify('bozuk', { log: 'x', steps: 1 }, 10, 60).flags).toContain('proof_invalid');
    expect(verify('bozuk', { log: [[10, 16], [5, 16]], steps: 20 }, 10, 60).flags).toContain('proof_invalid');
    expect(verify('bozuk', { log: [], steps: 0 }, 0, 60).flags).toContain('proof_invalid');
  });
});
