/**
 * Yorum İstifi — saf simülasyon + sunucu doğrulayıcısı (deterministik replay).
 * DB'ye bağlanmaz; prisma/economy mock'lu (evaluateAttempt entegrasyonu için).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CODE,
  COLS,
  KINDS,
  ROWS,
  SHAPES,
  createStackSim,
  replayReviewStack,
  starsFor,
  type StackSim,
} from '@/components/customer/games/review-stack/sim';
import { reviewStackVerifier } from '@/lib/games/validators/review-stack';
import { serverModule } from '@/lib/games/registry/review-stack.server';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { getMiniGame } from '@/lib/minigame-config';
import { reviewStackGame } from '@/lib/games/registry/review-stack';

const DEF = getMiniGame('review-stack')!;
const RULES: VerifierRules = {
  gameType: 'review-stack',
  maxScore: DEF.maxScore,
  rewardThreshold: DEF.rewardThreshold,
  minDurationSec: DEF.minDurationSec,
  maxScorePerSec: DEF.maxScorePerSec,
  maxDurationSec: DEF.maxDurationSec,
};

/** Yerleşim değerlendirmesi (Dellacherie benzeri): satır +, yükseklik/delik/pürüz −. */
function evaluate(board: Uint8Array, cells: [number, number][]): number {
  const b = board.slice();
  for (const [x, y] of cells) {
    if (y < 0) return -1e9;
    b[y * COLS + x] = 1;
  }
  let lines = 0;
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) if (!b[y * COLS + x]) full = false;
    if (full) lines++;
  }
  const heights: number[] = [];
  let holes = 0;
  for (let x = 0; x < COLS; x++) {
    let h = 0;
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (b[y * COLS + x]) {
        if (!seen) h = ROWS - y;
        seen = true;
      } else if (seen) holes++;
    }
    heights.push(h);
  }
  let bump = 0;
  for (let x = 1; x < COLS; x++) bump += Math.abs(heights[x] - heights[x - 1]);
  const agg = heights.reduce((a, c) => a + c, 0);
  return 0.76 * lines - 0.51 * agg - 0.36 * holes - 0.18 * bump;
}

function bestPlacement(sim: StackSim): { rot: number; x: number } {
  const p = sim.piece!;
  let best = { rot: 0, x: p.x, s: -Infinity };
  for (let rot = 0; rot < 4; rot++) {
    const shape = SHAPES[p.kind][rot];
    for (let x = -3; x < COLS; x++) {
      const fits = (y: number) =>
        shape.every(([cx, cy]) => {
          const gx = x + cx;
          const gy = y + cy;
          return gx >= 0 && gx < COLS && gy < ROWS && (gy < 0 || sim.board[gy * COLS + gx] === 0);
        });
      if (!fits(p.y)) continue;
      let y = p.y;
      while (fits(y + 1)) y++;
      const s = evaluate(sim.board, shape.map(([cx, cy]) => [x + cx, y + cy] as [number, number]));
      if (s > best.s) best = { rot, x, s };
    }
  }
  return best;
}

type Skill = 'pro' | 'idle' | 'dropper';

/** İstemcinin yaptığını yapar: girdiyi `sim.tick`'te, yalnız kabul edileni kaydeder; adım başına ≤1 girdi. */
function play(seed: string, skill: Skill, maxScore = RULES.maxScore) {
  const sim = createStackSim(seed, { maxScore });
  const rec = createInputRecorder();
  const send = (code: number) => {
    if (sim.input(code)) rec.record(sim.tick, code);
  };
  let plan: { rot: number; x: number; rotated: number; piece: number } | null = null;
  while (!sim.over && sim.tick < 60 * 60 * 30) {
    if (sim.countdown === 0 && sim.piece) {
      if (skill === 'dropper') send(CODE.HARD);
      else if (skill === 'pro' && sim.tick % 6 === 0) {
        // İnsan temposu: ~10 girdi/sn.
        if (!plan || plan.piece !== sim.pieces) plan = { ...bestPlacement(sim), rotated: 0, piece: sim.pieces };
        if (plan.rotated < plan.rot) {
          const before = sim.piece.rot;
          send(CODE.ROTATE_CW);
          plan.rotated++;
          if (sim.piece && sim.piece.rot === before && sim.piece.kind !== 'O') plan.rot = plan.rotated; // döndürülemedi
        } else if (sim.piece.x < plan.x) {
          const bx = sim.piece.x;
          send(CODE.RIGHT);
          if (sim.piece && sim.piece.x === bx) plan.x = bx;
        } else if (sim.piece.x > plan.x) {
          const bx = sim.piece.x;
          send(CODE.LEFT);
          if (sim.piece && sim.piece.x === bx) plan.x = bx;
        } else send(CODE.HARD);
      }
    }
    if (sim.over) break;
    sim.step();
  }
  return { sim, log: rec.entries(), steps: sim.tick };
}

const verify = (seed: string, proof: unknown, clientScore: number, serverElapsedSec: number, rules = RULES) =>
  runVerifier(reviewStackVerifier, { seed, rules, proof, clientScore, serverElapsedSec });

describe('Yorum İstifi — simülasyon', () => {
  it('7\'li torba: her 7 parçalık blokta 7 türün hepsi bir kez', () => {
    const sim = createStackSim('torba');
    const seen: string[] = [sim.piece!.kind, ...sim.queue(13)];
    expect(new Set(seen.slice(0, 7)).size).toBe(7);
    expect(new Set(seen.slice(7, 14)).size).toBe(7);
  });

  it('aynı tohum aynı diziyi, farklı tohum farklı diziyi üretir', () => {
    const a = createStackSim('x').queue(6).join('');
    expect(createStackSim('x').queue(6).join('')).toBe(a);
    const others = ['y', 'z', 'w'].map((s) => createStackSim(s).queue(6).join(''));
    expect(others.some((o) => o !== a)).toBe(true);
  });

  it('O parçası döndürmede kaymaz; T SRS ile 4 durumda döner ve başlangıca döner', () => {
    for (let i = 0; i < 40; i++) {
      const sim = createStackSim(`rot-${i}`, { maxScore: 40 });
      while (sim.countdown > 0) sim.step();
      const p = sim.piece!;
      const before = JSON.stringify(sim.cellsOf(p));
      for (let r = 0; r < 4; r++) expect(sim.input(CODE.ROTATE_CW)).toBe(true);
      expect(JSON.stringify(sim.cellsOf(sim.piece!))).toBe(before);
      if (p.kind === 'O') {
        sim.input(CODE.ROTATE_CW);
        expect(JSON.stringify(sim.cellsOf(sim.piece!))).toBe(before);
      }
    }
    expect(SHAPES.T[1]).toEqual([[2, 1], [1, 0], [1, 1], [1, 2]]);
    expect(KINDS).toHaveLength(7);
  });

  it('geri sayımda girdi reddedilir; bilinmeyen kod reddedilir', () => {
    const sim = createStackSim('cd');
    expect(sim.input(CODE.LEFT)).toBe(false);
    while (sim.countdown > 0) sim.step();
    expect(sim.input(99)).toBe(false);
    expect(sim.input(CODE.LEFT)).toBe(true);
  });

  it('girdisiz oyun tavana ulaşınca biter (lock-out), skor 0', () => {
    const { sim } = play('bos', 'idle');
    expect(sim.over).toBe(true);
    expect(sim.cause).toBe('topout');
    expect(sim.score).toBe(0);
  });

  it('sakla: parça başına bir kez', () => {
    const sim = createStackSim('hold');
    while (sim.countdown > 0) sim.step();
    const first = sim.piece!.kind;
    expect(sim.input(CODE.HOLD)).toBe(true);
    expect(sim.hold).toBe(first);
    expect(sim.canHold).toBe(false);
    const cur = sim.piece!.kind;
    sim.input(CODE.HOLD);
    expect(sim.piece!.kind).toBe(cur);
  });

  it('iyi oyuncu satır temizler, seviye atlar ve replay birebir aynı skoru verir', () => {
    const a = play('tohum-a', 'pro');
    expect(a.sim.score).toBeGreaterThanOrEqual(RULES.rewardThreshold);
    expect(a.sim.level).toBeGreaterThan(1);
    const r = replayReviewStack('tohum-a', a.log, a.steps, RULES.maxScore);
    expect(r.illegal).toBe(false);
    expect(r.score).toBe(a.sim.score);
  });

  it('tavan skora ulaşınca oyun "tam istif" ile biter ve tavanı aşmaz', () => {
    const a = play('tavan', 'pro', 10);
    expect(a.sim.over).toBe(true);
    expect(a.sim.cause).toBe('max');
    expect(a.sim.score).toBe(10);
  });

  it('yıldızlar: eşik 1, orta 2, tavan 3', () => {
    expect(starsFor(15, 16, 40)).toBe(0);
    expect(starsFor(16, 16, 40)).toBe(1);
    expect(starsFor(28, 16, 40)).toBe(2);
    expect(starsFor(40, 16, 40)).toBe(3);
  });
});

describe('Yorum İstifi — sunucu doğrulayıcısı', () => {
  const honest = play('dürüst', 'pro');
  const realSec = honest.steps / 60 + 2;

  it('kayıt defteri v2 + deterministik + pratik açık; sunucu modülü bağlı', () => {
    expect(reviewStackGame.component.contract).toBe('v2');
    expect(reviewStackGame.modes.practice).toBe(true);
    expect(serverModule?.verifier).toBe(reviewStackVerifier);
  });

  it('dürüst oyun geçer ve sunucu skoru esas alınır → ödül', () => {
    const out = verify('dürüst', { log: honest.log, steps: honest.steps }, honest.sim.score, realSec);
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(honest.sim.score);
    const game: GameRules = { ...DEF, enabled: true };
    const now = new Date();
    const ev = evaluateAttempt(game, {
      clientScore: honest.sim.score,
      clientDurationSec: realSec,
      startedAt: new Date(now.getTime() - realSec * 1000),
      expiresAt: new Date(now.getTime() + 3600_000),
      now,
      verification: out,
    });
    expect(ev.won).toBe(true);
  });

  it('şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch sinyali)', () => {
    const d = play('spam', 'dropper');
    const out = verify('spam', { log: d.log, steps: d.steps }, 40, d.steps / 60 + 2);
    expect(out.verifiedScore).toBe(d.sim.score);
    expect(d.sim.score).toBeLessThan(RULES.rewardThreshold);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız "40 puan" betiği reddedilir', () => {
    const out = verify('dürüst', undefined, 40, 30);
    expect(out.verifiedScore).toBe(0);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('başka tohumun kaydı bu tohumda tutmaz (kural dışı / bitmemiş)', () => {
    const out = verify('baska-tohum', { log: honest.log, steps: honest.steps }, honest.sim.score, realSec);
    expect(out.verifiedScore === honest.sim.score && out.flags.length === 0).toBe(false);
  });

  it('hızlandırılmış betik (simülasyon süresi > sunucu süresi) → implausible', () => {
    const out = verify('dürüst', { log: honest.log, steps: honest.steps }, honest.sim.score, 5);
    expect(out.flags).toContain('implausible');
    expect(out.verifiedScore).toBe(0);
  });

  it('bitmemiş oyun / uydurma kayıt → proof_invalid', () => {
    const cut = honest.log.slice(0, 20) as InputLog;
    const out = verify('dürüst', { log: cut, steps: cut[cut.length - 1][0] + 1 }, 10, realSec);
    expect(out.flags).toContain('proof_invalid');
    const fake: InputLog = [[0, CODE.HARD]];
    expect(verify('dürüst', { log: fake, steps: 10 }, 40, realSec).flags).toContain('proof_invalid');
  });

  it('admin tavanı düşürürse replay o tavanda biter', () => {
    const small = play('admin', 'pro', 8);
    const out = verify('admin', { log: small.log, steps: small.steps }, small.sim.score, small.steps / 60 + 2, {
      ...RULES,
      maxScore: 8,
    });
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(8);
  });

  it('sert-düşürme spamı düşük skorla dürüstçe doğrulanır', () => {
    const d = play('spam', 'dropper');
    const out = verify('spam', { log: d.log, steps: d.steps }, d.sim.score, d.steps / 60 + 2);
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(d.sim.score);
  });
});
