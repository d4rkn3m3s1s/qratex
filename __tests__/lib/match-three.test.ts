/**
 * Eşleştir-3 — saf simülasyon (eşleşme/özel taş/kombo/cam kuralları), seviye haritası ve sunucu
 * doğrulayıcısı (deterministik replay: hile reddi / dürüst ödül). DB'ye bağlanmaz.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CODE_END,
  CODE_SWAP,
  MIN_SWAP_GAP_TICKS,
  SP_BOMB,
  SP_LINE_H,
  SP_NONE,
  SP_PRISM,
  PRISM_KIND,
  createMatchSim,
  rankedLevels,
  replayMatchThree,
  levelScoreOf,
  type MatchSim,
  type Tile,
} from '@/components/customer/games/match-three/sim';
import { COLS, LEVELS, LEVEL_COUNT, MAX_RUN_SCORE, RANKED_BANDS, glassCells } from '@/components/customer/games/match-three/levels';
import { matchThreeVerifier } from '@/lib/games/validators/match-three';
import { serverModule } from '@/lib/games/registry/match-three.server';
import { matchThreeGame } from '@/lib/games/registry/match-three';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import type { InputLog, InputLogEntry } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { getMiniGame } from '@/lib/minigame-config';

const DEF = getMiniGame('match-three')!;
const RULES: VerifierRules = {
  gameType: 'match-three',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

const wait = (sim: MatchSim, n = MIN_SWAP_GAP_TICKS) => {
  for (let i = 0; i < n; i++) sim.step();
};

/** Açgözlü bot ile sıralı koşu; `quitAt` skora ulaşınca bitirir. */
function playRanked(seed: string, opts: { gap?: number; quitAt?: number } = {}) {
  const sim = createMatchSim(seed, rankedLevels(seed));
  const log: InputLog = [];
  let g = 0;
  while (!sim.over && g++ < 1000) {
    wait(sim, opts.gap ?? 30);
    if (opts.quitAt !== undefined && sim.score >= opts.quitAt) {
      sim.end();
      log.push([sim.tick, CODE_END]);
      break;
    }
    const m = sim.findMove()!;
    const r = sim.swap(m[0], m[1]);
    expect(r.ok).toBe(true);
    log.push([sim.tick, CODE_SWAP, m[0], m[1]]);
  }
  return { sim, log, steps: sim.tick + 30 };
}

/** Eşiği geçen ilk tohumu bulur (deterministik). */
function rewardingRun() {
  for (let i = 0; i < 80; i++) {
    const a = playRanked(`odul-${i}`, { gap: 120 });
    if (a.sim.score >= DEF.rewardThreshold) return { seed: `odul-${i}`, ...a };
  }
  throw new Error('eşiği geçen koşu bulunamadı');
}

function setBoard(sim: MatchSim, kinds: number[][], sp: Record<number, number> = {}) {
  const b = sim.board as (Tile | null)[];
  let id = 5000;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const i = r * COLS + c;
      const s = (sp[i] ?? SP_NONE) as Tile['sp'];
      b[i] = { id: id++, kind: s === SP_PRISM ? PRISM_KIND : kinds[r][c], sp: s };
    }
}

/** Eşleşmesiz desen (0..4 renkleri kaydırmalı). */
const base = () => Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (r * 2 + c) % 5));

describe('match-three seviye haritası', () => {
  it('en az 30 hedefli seviye; bant aralıkları haritada; tavan config ile hizalı', () => {
    expect(LEVEL_COUNT).toBeGreaterThanOrEqual(30);
    LEVELS.forEach((l, i) => {
      expect(l.n).toBe(i + 1);
      expect(l.moves).toBeGreaterThan(0);
      if (l.goal.type === 'glass') expect(glassCells(l.glass).some(Boolean)).toBe(true);
      if (l.goal.type === 'collect') expect(l.goal.kind).toBeLessThan(l.colors);
    });
    for (const [, hi] of RANKED_BANDS) expect(hi).toBeLessThanOrEqual(LEVEL_COUNT);
    expect(MAX_RUN_SCORE).toBe(DEF.maxScore);
  });

  it('günlük rota tohumdan deterministik ve her banttan bir seviye', () => {
    expect(rankedLevels('x')).toEqual(rankedLevels('x'));
    rankedLevels('y').forEach((n, i) => {
      expect(n).toBeGreaterThanOrEqual(RANKED_BANDS[i][0]);
      expect(n).toBeLessThanOrEqual(RANKED_BANDS[i][1]);
    });
  });
});

describe('match-three sim kuralları', () => {
  it('aynı tohum → aynı tahta; başlangıçta en az bir hamle var', () => {
    const a = createMatchSim('t1', [1]).board.map((t) => t!.kind);
    const b = createMatchSim('t1', [1]).board.map((t) => t!.kind);
    expect(a).toEqual(b);
    expect(createMatchSim('t2', [1]).board.map((t) => t!.kind)).not.toEqual(a);
    expect(createMatchSim('t1', [1]).findMove()).not.toBeNull();
  });

  it('eşleşmesiz takas geçersiz: tahta değişmez, hamle düşmez', () => {
    const sim = createMatchSim('nm', [1]);
    setBoard(sim, base());
    wait(sim);
    const before = sim.board.map((t) => t!.id);
    const r = sim.swap(0, 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('nomatch');
    expect(sim.board.map((t) => t!.id)).toEqual(before);
    expect(sim.movesLeft).toBe(LEVELS[0].moves);
    expect(sim.swap(0, 2).reason).toBe('adjacent');
    expect(sim.swap(-1, 0).reason).toBe('range');
  });

  it('hız sınırı: aralıksız ikinci takas reddedilir', () => {
    const sim = createMatchSim('hiz', [1]);
    wait(sim);
    const m = sim.findMove()!;
    expect(sim.swap(m[0], m[1]).ok).toBe(true);
    const m2 = sim.findMove();
    if (m2) expect(sim.swap(m2[0], m2[1]).reason).toBe('busy');
  });

  it('4lü yatay eşleşme Hat taşı oluşturur', () => {
    const k = base();
    k[7] = [1, 1, 3, 1, 4, 0, 2, 3];
    k[6] = [2, 3, 1, 4, 0, 2, 3, 4];
    // (6,2)=1 ↔ (7,2)=3 → satır 7: 1 1 1 1
    const sim = createMatchSim('dort', [1]);
    setBoard(sim, k);
    wait(sim);
    const r = sim.swap(6 * COLS + 2, 7 * COLS + 2);
    expect(r.ok).toBe(true);
    const p = r.phases[0];
    expect(p.created.some((c) => c.sp === SP_LINE_H && c.cell === 7 * COLS + 2)).toBe(true);
    expect(p.cleared.length).toBeGreaterThanOrEqual(4);
    expect(sim.movesLeft).toBe(LEVELS[0].moves - 1);
  });

  it('Bomba + Bomba 5×5; Prizma rengin tamamını; Prizma + Prizma tahtayı temizler', () => {
    const sim = createMatchSim('ozel', [1]);
    setBoard(sim, base(), { 27: SP_BOMB, 28: SP_BOMB });
    wait(sim);
    const r = sim.swap(27, 28);
    expect(r.ok).toBe(true);
    expect(r.phases[0].cleared.length).toBe(25);

    const s2 = createMatchSim('prizma', [1]);
    setBoard(s2, base(), { 0: SP_PRISM });
    wait(s2);
    const kind = s2.board[1]!.kind;
    const count = s2.board.filter((t) => t && t.sp !== SP_PRISM && t.kind === kind).length;
    const r2 = s2.swap(0, 1);
    expect(r2.ok).toBe(true);
    expect(r2.phases[0].cleared.length).toBe(count + 1);

    const s3 = createMatchSim('pp', [1]);
    setBoard(s3, base(), { 0: SP_PRISM, 1: SP_PRISM });
    wait(s3);
    expect(s3.swap(0, 1).phases[0].cleared.length).toBe(64);
  });

  it('cam: üstündeki taş temizlenince kırılır; tüm cam kırılınca seviye 3 yıldızla geçilir', () => {
    const n = LEVELS.find((l) => l.goal.type === 'glass')!.n;
    const sim = createMatchSim('cam', [n]);
    const total = sim.glassLeft;
    expect(total).toBeGreaterThan(0);
    setBoard(sim, base(), { 0: SP_PRISM, 1: SP_PRISM });
    wait(sim);
    const r = sim.swap(0, 1);
    expect(r.phases[0].glassBroken.length).toBe(total);
    expect(r.level?.passed).toBe(true);
    expect(r.level?.stars).toBe(3);
    expect(sim.over).toBe(true);
    expect(sim.score).toBe(levelScoreOf(3, r.level!.movesLeft));
  });

  it('kombo derinliği taş puanını artırır', () => {
    let saw = false;
    for (let s = 0; s < 40 && !saw; s++) {
      const sim = createMatchSim(`kombo-${s}`, [1]);
      for (let g = 0; g < 20 && !sim.over && !saw; g++) {
        wait(sim);
        const m = sim.findMove()!;
        const r = sim.swap(m[0], m[1]);
        const deep = r.phases.find((p) => p.depth >= 2 && p.created.length === 0);
        if (deep) {
          expect(deep.gained).toBe(deep.cleared.length * 10 * Math.min(deep.depth, 5));
          saw = true;
        }
      }
    }
    expect(saw).toBe(true);
  });

  it('hamle biterse koşu biter ve başarısız seviye skor eklemez', () => {
    const sim = createMatchSim('bit', [LEVEL_COUNT]);
    let g = 0;
    while (!sim.over && g++ < 200) {
      wait(sim);
      const m = sim.findMove()!;
      sim.swap(m[0], m[1]);
    }
    expect(sim.over).toBe(true);
    if (sim.endReason === 'failed') expect(sim.score).toBe(0);
  });
});

describe('match-three doğrulayıcı (hile reddi / dürüst ödül)', () => {
  const verify = (seed: string, proof: unknown, clientScore: number, elapsed: number) =>
    runVerifier(matchThreeVerifier, { seed, rules: RULES, proof, clientScore, serverElapsedSec: elapsed });

  it('kayıt defteri v2 + deterministik doğrulayıcı bağlı, canlı', () => {
    expect(matchThreeGame.status).toBe('live');
    expect(matchThreeGame.component?.contract).toBe('v2');
    expect(matchThreeGame.modes.practice).toBe(true);
    expect(serverModule?.verifier.kind).toBe('deterministic');
    expect(DEF.hidden).toBeFalsy();
  });

  it('dürüst koşu doğrulanır, aynı skor çıkar ve eşiği geçince ödüllendirilir', () => {
    const a = rewardingRun();
    const elapsed = a.steps / 60 + 2;
    const out = verify(a.seed, { log: a.log, steps: a.steps }, a.sim.score, elapsed);
    expect(out.flags).toEqual([]);
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
    expect(ev.rewardEligible).toBe(true);
  });

  it('bitir (CODE_END) ile erken bitirilen koşu da geçerli', () => {
    const a = playRanked('erken', { quitAt: 1 });
    expect(a.sim.endReason === 'quit' || a.sim.endReason === 'failed').toBe(true);
    const out = verify('erken', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 2);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
    expect(out.verifiedScore).toBe(a.sim.score);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch)', () => {
    const a = playRanked('sisir');
    const out = verify('sisir', { log: a.log, steps: a.steps }, DEF.maxScore, a.steps / 60 + 2);
    expect(out.verifiedScore).toBe(a.sim.score);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız gövde ödül almaz', () => {
    expect(hasBlockingVerifierFlag(verify('x', undefined, 150, 300).flags)).toBe(true);
  });

  it('başka tohumla oynanmış kayıt reddedilir (yeniden çekme işe yaramaz)', () => {
    const a = playRanked('baska');
    const out = verify('gercek-tohum', { log: a.log, steps: a.steps }, a.sim.score, a.steps / 60 + 2);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('insan üstü hız (adımlar sıkıştırılmış) reddedilir', () => {
    const a = playRanked('bot');
    const log: InputLog = a.log.map((e, i) => [i, ...e.slice(1)] as InputLogEntry);
    const out = verify('bot', { log, steps: log.length + 1 }, a.sim.score, 600);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('hızlandırılmış betik (sim süresi > sunucu süresi) implausible', () => {
    const a = playRanked('hizli');
    const out = verify('hizli', { log: a.log, steps: a.steps }, a.sim.score, 5);
    expect(out.flags).toContain('implausible');
  });

  it('komşu olmayan / eşleşmesiz takas, bilinmeyen kod, bitmiş oyuna girdi, bitmemiş oyun kural dışı', () => {
    const a = playRanked('kural');
    expect(replayMatchThree('kural', a.log.slice(0, 1), a.steps).illegal).toBe(true);
    expect(replayMatchThree('kural', [[20, CODE_SWAP, 0, 2]], 40).illegal).toBe(true);
    expect(replayMatchThree('kural', [[20, 99]], 40).illegal).toBe(true);
    expect(replayMatchThree('kural', [...a.log, [a.steps, CODE_END]], a.steps).illegal).toBe(true);
    let bad: [number, number] | null = null;
    for (let i = 0; i < 63 && !bad; i++) {
      if ((i + 1) % COLS === 0) continue;
      const probe = createMatchSim('kural', rankedLevels('kural'));
      wait(probe);
      if (!probe.swap(i, i + 1).ok) bad = [i, i + 1];
    }
    expect(bad).not.toBeNull();
    expect(replayMatchThree('kural', [[20, CODE_SWAP, bad![0], bad![1]], [30, CODE_END]], 40).illegal).toBe(true);
  });

  it('kurallar makul: eşik tavan içinde, eşik/hız tavanı süreye sığar', () => {
    expect(DEF.rewardThreshold).toBeLessThan(DEF.maxScore);
    expect(DEF.rewardThreshold / (DEF.maxScorePerSec as number)).toBeLessThan(DEF.maxDurationSec as number);
  });
});
