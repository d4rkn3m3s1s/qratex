/**
 * lib/games/verify — sunucu otoritesi çerçevesi + içerik havuzu + game-session entegrasyonu.
 * Saf fonksiyonlar; DB yok.
 */
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/economy', () => ({ mintPoints: jest.fn() }));

import {
  runVerifier,
  classificationVerifier,
  deterministicVerifier,
  actionVerifier,
  rankedContentFor,
  practiceContentFor,
  hasBlockingVerifierFlag,
  type VerifierRules,
} from '@/lib/games/verify';
import { drawRound, splitPools, type ContentItem } from '@/lib/games/content/pool';
import { createRng } from '@/lib/games/engine/rng';
import { evaluateAttempt, type GameRules } from '@/lib/game-session';

const RULES: VerifierRules = { gameType: 'test', maxScore: 10, rewardThreshold: 6, minDurationSec: 5, maxScorePerSec: 1 };

const BANK: ContentItem<'real' | 'fake', { text: string }>[] = Array.from({ length: 80 }, (_, i) => ({
  id: `item-${i}`,
  label: i % 2 === 0 ? 'real' : 'fake',
  payload: { text: `Yorum ${i}` },
}));
const POOLS = splitPools(BANK);

const cls = classificationVerifier({
  buildRound: (seed) => drawRound(POOLS.ranked, seed, { count: 10, minPerLabel: 3 }),
  practiceRound: (seed) => drawRound(POOLS.practice, seed, { count: 6 }),
});

function answersFor(seed: string, correctCount: number, gapMs = 1500) {
  const round = cls.buildRound(seed, RULES);
  return round.items.map((it, i) => ({
    id: it.id,
    verdict: i < correctCount ? round.answerKey[it.id] : round.answerKey[it.id] === 'real' ? 'fake' : 'real',
    tMs: 1000 + i * gapMs,
  }));
}

describe('içerik havuzu', () => {
  it('tur tohumdan deterministik; kimlikler opak (havuz kimliği ve etiket sızmaz)', () => {
    const a = drawRound(POOLS.ranked, 'tohum-1', { count: 10 });
    const b = drawRound(POOLS.ranked, 'tohum-1', { count: 10 });
    expect(a).toEqual(b);
    expect(a.items.map((i) => i.id)).toEqual(Array.from({ length: 10 }, (_, i) => `q${i}`));
    for (const it of a.items) {
      expect(JSON.stringify(it)).not.toMatch(/item-|"label"|"real"|"fake"/);
    }
    expect(drawRound(POOLS.ranked, 'tohum-2', { count: 10 }).items).not.toEqual(a.items);
  });

  it('pratik ve sıralı havuz ayrık; minPerLabel dengesi', () => {
    const ids = new Set(POOLS.ranked.map((i) => i.id));
    expect(POOLS.practice.length).toBeGreaterThan(0);
    expect(POOLS.practice.some((i) => ids.has(i.id))).toBe(false);
    const r = drawRound(POOLS.ranked, 'denge', { count: 6, minPerLabel: 3 });
    const labels = Object.values(r.answerKey);
    expect(labels.filter((l) => l === 'real').length).toBeGreaterThanOrEqual(3);
    expect(labels.filter((l) => l === 'fake').length).toBeGreaterThanOrEqual(3);
  });

  it('start içeriği etiketsiz; pratik içeriği etiketli ve pratik havuzundan', () => {
    const content = rankedContentFor(cls, 's', RULES)!;
    expect(content).toHaveLength(10);
    expect(JSON.stringify(content)).not.toMatch(/"real"|"fake"/);
    const practice = practiceContentFor(cls, 's', RULES)!;
    expect(Object.keys(practice.answerKey)).toHaveLength(6);
    expect(rankedContentFor(actionVerifier(), 's', RULES)).toBeNull();
    expect(rankedContentFor(null, 's', RULES)).toBeNull();
  });
});

describe('sınıflandırma doğrulayıcısı', () => {
  const base = { seed: 'tur-A', rules: RULES, serverElapsedSec: 30 };

  it('skor SUNUCUDA hesaplanır; istemci beyanı yok sayılır + uyuşmazlık sinyali', () => {
    const out = runVerifier(cls, { ...base, proof: { answers: answersFor('tur-A', 7) }, clientScore: 10 });
    expect(out.verifiedScore).toBe(7);
    expect(out.flags).toEqual(['score_mismatch']);
    expect(hasBlockingVerifierFlag(out.flags)).toBe(false);
  });

  it('kanıtsız → proof_missing (bloklayan); bozuk kanıt → proof_invalid', () => {
    expect(runVerifier(cls, { ...base, proof: undefined, clientScore: 10 })).toMatchObject({ verifiedScore: 0, flags: ['proof_missing'] });
    expect(runVerifier(cls, { ...base, proof: { answers: 'x' }, clientScore: 10 }).flags).toEqual(['proof_invalid']);
  });

  it('tekrarlı / turda olmayan öğe → proof_invalid', () => {
    const a = answersFor('tur-A', 10);
    expect(runVerifier(cls, { ...base, proof: { answers: [...a, a[0]] }, clientScore: 10 }).flags).toContain('proof_invalid');
    expect(runVerifier(cls, { ...base, proof: { answers: [{ id: 'q99', verdict: 'real', tMs: 100 }] }, clientScore: 1 }).flags).toContain('proof_invalid');
  });

  it('insanüstü hızlı cevaplar ve sunucu süresinden sonraki cevap → implausible', () => {
    const fast = answersFor('tur-A', 10, 20);
    expect(runVerifier(cls, { ...base, proof: { answers: fast }, clientScore: 10 }).flags).toContain('implausible');
    const late = answersFor('tur-A', 10, 1500).map((x) => ({ ...x, tMs: x.tMs + 60_000 }));
    expect(runVerifier(cls, { ...base, proof: { answers: late }, clientScore: 10 }).flags).toContain('implausible');
  });

  it('başka tohumun cevap anahtarı işe yaramaz (etiket tohuma bağlı)', () => {
    const other = answersFor('tur-B', 10);
    const out = runVerifier(cls, { ...base, proof: { answers: other }, clientScore: 10 });
    expect(out.verifiedScore).toBeLessThan(10);
  });
});

describe('deterministik doğrulayıcı (replay)', () => {
  // Basit sim: her 'primary' (kod 5) hamlesinde tohumdan gelen hedefle eşleşirse +1.
  const det = deterministicVerifier({
    simulate: (seed, log) => {
      const rng = createRng(seed).fork('targets');
      let score = 0;
      for (const [, code, a] of log) {
        if (code !== 5) return { score: 0, illegal: true, detail: 'bilinmeyen kod' };
        if (a === rng.int(0, 3)) score++;
      }
      return { score };
    },
  });
  const goodLog = (seed: string) => {
    const rng = createRng(seed).fork('targets');
    return Array.from({ length: 8 }, (_, i) => [i * 60, 5, rng.int(0, 3)] as [number, number, number]);
  };

  it('replay skoru esas; istemci şişirse de sunucu skoru', () => {
    const out = runVerifier(det, { seed: 'd1', rules: RULES, proof: { log: goodLog('d1'), steps: 600 }, clientScore: 10, serverElapsedSec: 15 });
    expect(out.verifiedScore).toBe(8);
    expect(out.flags).toEqual(['score_mismatch']);
  });

  it('simülasyon süresi sunucu süresini aşarsa (hızlandırılmış betik) implausible', () => {
    const out = runVerifier(det, { seed: 'd1', rules: RULES, proof: { log: goodLog('d1'), steps: 6000 }, clientScore: 8, serverElapsedSec: 15 });
    expect(out.flags).toContain('implausible');
    expect(out.verifiedScore).toBe(0);
  });

  it('kural dışı hamle → proof_invalid; kayıt oyun sonundan sonra → proof_invalid', () => {
    expect(runVerifier(det, { seed: 'd1', rules: RULES, proof: { log: [[0, 9]], steps: 60 }, clientScore: 0, serverElapsedSec: 15 }).flags).toContain('proof_invalid');
    expect(runVerifier(det, { seed: 'd1', rules: RULES, proof: { log: [[600, 5, 1]], steps: 60 }, clientScore: 0, serverElapsedSec: 15 }).flags).toContain('proof_invalid');
  });
});

describe('aksiyon doğrulayıcısı (checkpoint + makullük)', () => {
  const act = actionVerifier({ maxGapSec: 10, burstFactor: 2 });
  const input = (checkpoints: [number, number][], clientScore: number, serverElapsedSec = 30) => ({
    seed: 'a',
    rules: RULES,
    proof: { checkpoints },
    clientScore,
    serverElapsedSec,
  });

  it('düzgün iz geçer; istemci son checkpointi aşamaz', () => {
    const ok = runVerifier(act, input([[5000, 3], [10000, 6], [15000, 8]], 8));
    expect(ok).toEqual({ verifiedScore: 8, flags: [], detail: undefined });
    const over = runVerifier(act, input([[5000, 3], [10000, 6]], 10));
    expect(over.verifiedScore).toBe(6);
    expect(over.flags).toEqual(['score_mismatch']);
  });

  it('eksik iz, aşırı patlama, gerileyen skor reddedilir', () => {
    expect(runVerifier(act, input([[25000, 8]], 8)).flags).toContain('implausible'); // ilk nokta çok geç
    expect(runVerifier(act, input([[5000, 1], [6000, 9]], 9)).flags).toContain('implausible'); // 1 sn'de +8
    expect(runVerifier(act, input([[5000, 5], [9000, 3]], 3)).flags).toContain('proof_invalid');
  });
});

describe('game-session entegrasyonu', () => {
  const game: GameRules = {
    gameType: 'test',
    maxScore: 10,
    rewardThreshold: 6,
    rewardPoints: 100,
    rewardXp: 50,
    minDurationSec: 5,
    maxScorePerSec: 1,
    maxDurationSec: 300,
    enabled: true,
  };
  const t0 = new Date('2026-10-10T10:00:00Z');
  const now = new Date(t0.getTime() + 30_000);
  const base = { clientDurationSec: 30, startedAt: t0, expiresAt: new Date(t0.getTime() + 300_000), now };

  it('doğrulayıcı skoru esas alınır: istemci 10 dese de doğrulanmış 4 → kazanılmadı', () => {
    const ev = evaluateAttempt(game, { ...base, clientScore: 10, verification: { verifiedScore: 4, flags: ['score_mismatch'] } });
    expect(ev.verifiedScore).toBe(4);
    expect(ev.won).toBe(false);
    expect(ev.flags).toEqual(expect.arrayContaining(['score_mismatch', 'below_threshold']));
  });

  it('bloklayan doğrulayıcı bayrağı ödülü keser (skor yüksek olsa bile)', () => {
    const ev = evaluateAttempt(game, { ...base, clientScore: 8, verification: { verifiedScore: 8, flags: ['implausible'] } });
    expect(ev.won).toBe(false);
    expect(ev.rewardEligible).toBe(false);
  });

  it('doğrulayıcı yoksa eski davranış (istemci skoru kırpılır)', () => {
    const ev = evaluateAttempt(game, { ...base, clientScore: 8 });
    expect(ev).toMatchObject({ verifiedScore: 8, won: true, rewardEligible: true });
  });
});
