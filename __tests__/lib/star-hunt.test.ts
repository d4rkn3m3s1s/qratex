/**
 * Yıldız Avı — saf simülasyon + sunucu doğrulayıcısı (deterministik replay).
 * DB'ye bağlanmaz; prisma/economy mock'lu (evaluateAttempt entegrasyonu için).
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  CELL_U,
  COLS,
  HZ,
  LEVELS,
  MAX_SCORE,
  MAX_SIM_TICKS,
  MAZES,
  ROWS,
  SH_CODE,
  STARS_PER_LEVEL,
  TOTAL_LEVELS,
  createStarHuntSim,
  getMaze,
  moverCell,
  moverPos,
  replayStarHunt,
  trophiesFor,
  type Dir,
  type StarHuntSim,
} from '@/components/customer/games/star-hunt/sim';
import { starHuntVerifier } from '@/lib/games/validators/star-hunt';
import { serverModule } from '@/lib/games/registry/star-hunt.server';
import { getVerifierForGameType } from '@/lib/games/registry/server';
import { starHuntGame } from '@/lib/games/registry/star-hunt';
import { resolveGameRoute } from '@/lib/games/registry';
import { runVerifier, hasBlockingVerifierFlag, type VerifierRules } from '@/lib/games/verify';
import { createInputRecorder, type InputLog } from '@/lib/games/engine/record';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';
import { PACMAN_GAME } from '@/lib/minigame-config';

const RULES: VerifierRules = {
  gameType: 'pacman',
  maxScore: PACMAN_GAME.maxScore,
  rewardThreshold: PACMAN_GAME.rewardThreshold,
  minDurationSec: PACMAN_GAME.minDurationSec,
  maxScorePerSec: PACMAN_GAME.maxScorePerSec,
  maxDurationSec: PACMAN_GAME.maxDurationSec,
};

const DX = [0, 0, 0, -1, 1];
const DY = [0, -1, 1, 0, 0];

/** Engel haritasıyla BFS: başlangıçtan hedef kümesine ilk adım yönü. */
function firstStep(sim: StarHuntSim, from: { x: number; y: number }, goals: Set<number>, blocked: Set<number>): Dir {
  const mz = sim.maze;
  const key = (x: number, y: number) => y * COLS + x;
  const prev = new Map<number, number>();
  const firstDir = new Map<number, Dir>();
  const q: number[] = [key(from.x, from.y)];
  prev.set(q[0], -1);
  while (q.length) {
    const k = q.shift()!;
    if (goals.has(k) && k !== key(from.x, from.y)) return firstDir.get(k) ?? 0;
    const x = k % COLS;
    const y = Math.floor(k / COLS);
    for (const d of [1, 3, 2, 4] as Dir[]) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const nk = key(nx, ny);
      if (mz.walls[nk] || prev.has(nk) || blocked.has(nk)) continue;
      prev.set(nk, k);
      firstDir.set(nk, k === key(from.x, from.y) ? d : firstDir.get(k)!);
      q.push(nk);
    }
  }
  return 0;
}

type Skill = 'pro' | 'idle' | 'wander';

/** Oyuncu botu: istemcinin yaptığını yapar (girdiyi `sim.tick`'te kaydeder, yalnız kabul edileni). */
function play(seed: string, skill: Skill): { sim: StarHuntSim; log: InputLog; steps: number } {
  const sim = createStarHuntSim(seed);
  const rec = createInputRecorder();
  const send = (code: number) => {
    if (code === 0 || code === sim.queued) return;
    if (sim.input(code)) rec.record(sim.tick, code);
  };
  while (!sim.over && sim.tick < MAX_SIM_TICKS) {
    if (skill === 'wander' && (sim.phase === 'play' || sim.phase === 'ready') && sim.tick % 45 === 0) {
      send(((sim.tick / 45) % 4) + 1);
    }
    if (skill === 'pro' && (sim.phase === 'play' || sim.phase === 'ready')) {
      const pl = sim.player;
      // Karar noktası: bir sonraki merkez hücre.
      const from = pl.dir === 0 || pl.p === 0 ? { x: pl.cx, y: pl.cy } : { x: pl.cx + DX[pl.dir], y: pl.cy + DY[pl.dir] };
      const blocked = new Set<number>();
      for (const g of sim.ghosts) {
        if (g.state !== 'active' || g.scared) continue;
        const gc = moverCell(g);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blocked.add((gc.y + dy) * COLS + gc.x + dx);
      }
      blocked.delete(from.y * COLS + from.x);
      const goals = new Set<number>();
      sim.maze.stars.forEach((s, i) => {
        if (!sim.starsTaken[i]) goals.add(s.y * COLS + s.x);
      });
      let d = firstStep(sim, from, goals, blocked);
      if (d === 0) {
        // Kaçış: hayaletlerden en uzak açık komşu.
        const pp = moverPos(pl);
        let best = 0;
        let bd = -1;
        for (const c of [1, 3, 2, 4] as Dir[]) {
          const nx = from.x + DX[c];
          const ny = from.y + DY[c];
          if (sim.maze.walls[ny * COLS + nx]) continue;
          let md = Infinity;
          for (const g of sim.ghosts) {
            if (g.state !== 'active') continue;
            const gp = moverPos(g);
            md = Math.min(md, Math.abs(gp.x - nx * CELL_U) + Math.abs(gp.y - ny * CELL_U));
          }
          if (md > bd) {
            bd = md;
            best = c;
          }
        }
        void pp;
        d = best as Dir;
      }
      send(d);
    }
    sim.step();
  }
  return { sim, log: rec.entries(), steps: sim.tick };
}

const elapsed = (steps: number) => Math.ceil(steps / HZ) + 2;

describe('labirentler', () => {
  it.each(MAZES.map((m, i) => [m.name, i] as const))('%s: 13×15, 5 yıldız, 2 kapsül, tüm yollar bağlı', (_n, i) => {
    const m = MAZES[i];
    expect(m.rows).toHaveLength(ROWS);
    for (const r of m.rows) expect(r).toHaveLength(COLS);
    const mz = getMaze(i);
    expect(mz.stars).toHaveLength(STARS_PER_LEVEL);
    expect(mz.pellets).toHaveLength(2);
    // BFS bağlılık
    const open: number[] = [];
    for (let k = 0; k < ROWS * COLS; k++) if (!mz.walls[k]) open.push(k);
    const seen = new Set<number>([mz.player.y * COLS + mz.player.x]);
    const q = [...seen];
    while (q.length) {
      const k = q.shift()!;
      for (const d of [1, 2, 3, 4]) {
        const nk = k + DY[d] * COLS + DX[d];
        if (!mz.walls[nk] && !seen.has(nk)) {
          seen.add(nk);
          q.push(nk);
        }
      }
    }
    expect(seen.size).toBe(open.length);
  });

  it('zorluk eğrisi monoton: hayalet sayısı/hızı/kararlılığı artar, güç süresi kısalır', () => {
    expect(LEVELS).toHaveLength(TOTAL_LEVELS);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].ghosts).toBeGreaterThanOrEqual(LEVELS[i - 1].ghosts);
      expect(LEVELS[i].ghostSpeed).toBeGreaterThanOrEqual(LEVELS[i - 1].ghostSpeed);
      expect(LEVELS[i].greedy).toBeGreaterThan(LEVELS[i - 1].greedy);
      expect(LEVELS[i].powerTicks).toBeLessThan(LEVELS[i - 1].powerTicks);
    }
    expect(MAX_SCORE).toBe(PACMAN_GAME.maxScore);
  });
});

describe('simülasyon', () => {
  it('aynı tohum + aynı kayıt → aynı skor (determinizm)', () => {
    const a = play('seed-a', 'pro');
    const r1 = replayStarHunt('seed-a', a.log, a.steps);
    const r2 = replayStarHunt('seed-a', a.log, a.steps);
    expect(r1).toEqual(r2);
    expect(r1.illegal).toBeUndefined();
    expect(r1.score).toBe(a.sim.score);
  });

  it('iyi oyuncu ödül eşiğine ulaşır; boşta duran oyuncu yakalanır ve 0 alır', () => {
    let reached = 0;
    for (const s of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const r = play(s, 'pro');
      expect(r.sim.over).toBe(true);
      if (r.sim.score >= PACMAN_GAME.rewardThreshold) reached++;
    }
    expect(reached).toBeGreaterThanOrEqual(4);
    const idle = play('idle', 'idle');
    expect(idle.sim.over).toBe(true);
    expect(idle.sim.score).toBe(0);
    expect(idle.sim.lives).toBe(0);
  });

  it('girdi yalnız hazır/oyun fazında kabul edilir; bilinmeyen kod reddedilir', () => {
    const sim = createStarHuntSim('x');
    expect(sim.input(SH_CODE.LEFT)).toBe(true);
    expect(sim.input(9)).toBe(false);
    expect(sim.input(0)).toBe(false);
    sim.phase = 'caught';
    expect(sim.input(SH_CODE.UP)).toBe(false);
  });

  it('hareket kare hızından bağımsız: hız adım başına sabit, 1 sn = 60 adım', () => {
    const sim = createStarHuntSim('speed');
    sim.input(SH_CODE.LEFT);
    while (sim.phase === 'ready') sim.step();
    const x0 = moverPos(sim.player).x;
    for (let i = 0; i < HZ; i++) sim.step();
    const moved = Math.abs(moverPos(sim.player).x - x0);
    // 9 alt birim × 60 = 540 alt birim = 4,5 hücre/sn (duvar yoksa)
    expect(moved).toBeLessThanOrEqual(9 * HZ);
    expect(moved).toBeGreaterThan(0);
  });

  it('kupa: eşik / 15 / tüm seviyeler', () => {
    expect(trophiesFor(4, false, 5)).toBe(0);
    expect(trophiesFor(5, false, 5)).toBe(1);
    expect(trophiesFor(15, false, 5)).toBe(2);
    expect(trophiesFor(MAX_SCORE, true, 5)).toBe(3);
  });
});

describe('sunucu doğrulayıcısı', () => {
  it('kayıt defteri: v2 + deterministik + pratik; pacman anahtarı doğrulayıcıya bağlı', () => {
    expect(starHuntGame.component?.contract).toBe('v2');
    expect(starHuntGame.verification).toBe('deterministic');
    expect(starHuntGame.modes.practice).toBe(true);
    expect(serverModule?.verifier).toBe(starHuntVerifier);
    expect(getVerifierForGameType('pacman')).toBe(starHuntVerifier);
    expect(resolveGameRoute('pacman')).toEqual({ kind: 'redirect', to: '/customer/games/star-hunt', permanent: true });
  });

  it('dürüst oyun: skor sunucuda hesaplanır, eşik geçilirse kazanılır', () => {
    const r = play('honest-1', 'pro');
    expect(r.sim.score).toBeGreaterThanOrEqual(PACMAN_GAME.rewardThreshold);
    const out = runVerifier(starHuntVerifier, {
      seed: 'honest-1',
      rules: RULES,
      proof: { log: r.log, steps: r.steps },
      clientScore: r.sim.score,
      serverElapsedSec: elapsed(r.steps),
    });
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(r.sim.score);
    const now = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));
    const ev = evaluateAttempt({ ...PACMAN_GAME, enabled: true } as unknown as GameRules, {
      clientScore: r.sim.score,
      clientDurationSec: Math.floor(r.steps / HZ),
      startedAt: new Date(now.getTime() - elapsed(r.steps) * 1000),
      expiresAt: new Date(now.getTime() + 60_000),
      now,
      verification: out,
    });
    expect(ev).toMatchObject({ won: true });
  });

  it('hile: eski açık — kanıtsız "won:true, 5 yıldız" → proof_missing, kazanılmaz', () => {
    const out = runVerifier(starHuntVerifier, { seed: 'x', rules: RULES, proof: undefined, clientScore: 5, serverElapsedSec: 6 });
    expect(out.flags).toContain('proof_missing');
    expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
  });

  it('hile: şişirilmiş skor beyanı sunucu skoruna iner (score_mismatch sinyali)', () => {
    const r = play('honest-2', 'pro');
    const out = runVerifier(starHuntVerifier, {
      seed: 'honest-2',
      rules: RULES,
      proof: { log: r.log, steps: r.steps },
      clientScore: MAX_SCORE,
      serverElapsedSec: elapsed(r.steps),
    });
    if (r.sim.score < MAX_SCORE) expect(out.flags).toContain('score_mismatch');
    expect(out.verifiedScore).toBe(r.sim.score);
  });

  it('hile: başka tohumun kaydı bu tohumda geçmez ya da aynı skoru vermez', () => {
    const r = play('seed-other', 'pro');
    const out = runVerifier(starHuntVerifier, {
      seed: 'seed-mine',
      rules: RULES,
      proof: { log: r.log, steps: r.steps },
      clientScore: r.sim.score,
      serverElapsedSec: elapsed(r.steps),
    });
    const honest = replayStarHunt('seed-mine', r.log, r.steps);
    // Ya kural dışı (oyun beyan edilen adımda bitmedi) ya da sunucu kendi skorunu hesaplar.
    if (honest.illegal) expect(hasBlockingVerifierFlag(out.flags)).toBe(true);
    else expect(out.verifiedScore).toBe(honest.score);
  });

  it('hile: hızlandırılmış betik (simülasyon süresi > sunucu süresi) → implausible', () => {
    const r = play('fast', 'pro');
    const out = runVerifier(starHuntVerifier, {
      seed: 'fast',
      rules: RULES,
      proof: { log: r.log, steps: r.steps },
      clientScore: r.sim.score,
      serverElapsedSec: Math.floor(r.steps / HZ / 3),
    });
    expect(out.flags).toContain('implausible');
  });

  it('hile: bilinmeyen kod / bozuk sıra / bitmemiş oyun / bitişten sonra girdi → proof_invalid', () => {
    const r = play('bad', 'pro');
    const base = { seed: 'bad', rules: RULES, clientScore: r.sim.score, serverElapsedSec: elapsed(r.steps) };
    const unknown = runVerifier(starHuntVerifier, { ...base, proof: { log: [[5, 42]], steps: r.steps } });
    expect(unknown.flags).toContain('proof_invalid');
    const early = runVerifier(starHuntVerifier, { ...base, proof: { log: r.log.filter((e) => e[0] < 600), steps: 600 } });
    expect(early.flags).toContain('proof_invalid');
    const after = runVerifier(starHuntVerifier, { ...base, proof: { log: [...r.log, [r.steps, 1]], steps: r.steps } });
    expect(after.flags).toContain('proof_invalid');
    const tooLong = runVerifier(starHuntVerifier, { ...base, proof: { log: [], steps: MAX_SIM_TICKS + 1 } });
    expect(hasBlockingVerifierFlag(tooLong.flags)).toBe(true);
  });
});
