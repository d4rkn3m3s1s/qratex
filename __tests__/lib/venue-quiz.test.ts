/**
 * Mekân Bilgi Yarışması — soru havuzu, tur kurulumu, sunucu doğrulayıcısı (hile reddi / dürüst
 * ödül), düello belirteçleri ve isteğe bağlı (admin açar) portföy kuralı. Gerçek DB'ye gidilmez.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-for-venue-quiz-0123456789';
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

import { VENUE_QUIZ_BANK, sponsoredBankItems, type SponsoredQuestion } from '@/lib/games/content/venue-quiz.server';
import {
  MAX_OVERHEAD_MS,
  VENUE_QUIZ_POOLS,
  buildDuelRound,
  buildPracticeRound,
  buildRankedRound,
  scoreRound,
  venueQuizVerifier,
} from '@/lib/games/validators/venue-quiz';
import { handleDuelRound, handleDuelSubmit, signDuelToken } from '@/lib/games/validators/venue-quiz-duel';
import {
  CATEGORIES,
  QUESTION_MS,
  RANKED_COUNT,
  TIMEOUT_VERDICT,
  TRANSITION_MS,
  maxPossibleScore,
  scoreRun,
  speedBonus,
  type TimedAnswer,
} from '@/components/customer/games/venue-quiz/rules';
import { runVerifier } from '@/lib/games/verify';
import type { ClassificationRound } from '@/lib/games/verify/types';
import { defaultEnabledOf, getMiniGame, visibleMiniGames } from '@/lib/minigame-config';
import { mergeGameConfig } from '@/lib/minigame-config-effective';
import { getGameEntry, liveGames, resolveGameRoute } from '@/lib/games/registry';

const SECRET = process.env.NEXTAUTH_SECRET!;
const def = getMiniGame('venue-quiz')!;
const rules = {
  gameType: 'venue-quiz',
  maxScore: def.maxScore,
  rewardThreshold: def.rewardThreshold,
  minDurationSec: def.minDurationSec,
  maxScorePerSec: def.maxScorePerSec,
  maxDurationSec: def.maxDurationSec,
};

/** Her soruya `gapMs` sonra cevap veren oyuncu (doğru ya da hep ilk şık). */
function play(round: ClassificationRound, opts: { gapMs: number; correct: (i: number) => boolean; n?: number }): TimedAnswer[] {
  const out: TimedAnswer[] = [];
  let t = 0;
  round.items.slice(0, opts.n ?? round.items.length).forEach((it, i) => {
    t += (i === 0 ? 0 : TRANSITION_MS) + opts.gapMs;
    const truth = round.answerKey[it.id];
    const wrong = (it.options as { id: string }[]).find((o) => o.id !== truth)!.id;
    out.push({ id: it.id, verdict: opts.correct(i) ? truth : wrong, tMs: t });
  });
  return out;
}

describe('soru havuzu', () => {
  it('en az 150 genel soru; kimlikler benzersiz, şıklar 4 ve benzersiz, kategoriler geçerli', () => {
    expect(VENUE_QUIZ_BANK.length).toBeGreaterThanOrEqual(150);
    const ids = VENUE_QUIZ_BANK.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(CATEGORIES.map((c) => c.id));
    for (const q of VENUE_QUIZ_BANK) {
      expect(q.id).toMatch(/^vq-[a-z]+-\d{2}$/);
      expect(cats.has(q.payload.category)).toBe(true);
      expect(q.payload.options).toHaveLength(4);
      expect(new Set(q.payload.options.map((o) => o.trim().toLocaleLowerCase('tr-TR'))).size).toBe(4);
      expect(q.payload.prompt.trim().length).toBeGreaterThan(10);
      expect([1, 2, 3]).toContain(q.difficulty);
    }
    for (const c of CATEGORIES) expect(VENUE_QUIZ_BANK.filter((q) => q.payload.category === c.id).length).toBeGreaterThanOrEqual(20);
  });

  it('havuz bölünmesi: sıralı her zorlukta yeterli, pratik her kategoride ≥ 3', () => {
    for (const d of [1, 2, 3]) expect(VENUE_QUIZ_POOLS.ranked.filter((q) => q.difficulty === d).length).toBeGreaterThanOrEqual(8);
    for (const c of CATEGORIES) expect(VENUE_QUIZ_POOLS.practice.filter((q) => q.payload.category === c.id).length).toBeGreaterThanOrEqual(3);
  });

  it('bayi sorusu yalnız incelenmiş + aktifse havuza girer ve sponsor adı taşır', () => {
    const base: SponsoredQuestion = {
      id: 'vqs-test-01',
      dealerId: 'd1',
      sponsorName: 'Örnek Kafe',
      category: 'kahve',
      difficulty: 2,
      prompt: 'Örnek bayi sorusu metni nedir?',
      options: ['A', 'B', 'C', 'D'],
      reviewed: true,
      active: true,
    };
    expect(sponsoredBankItems([base, { ...base, id: 'vqs-test-02', reviewed: false }, { ...base, id: 'vqs-test-03', active: false }]).map((s) => s.id)).toEqual([
      'vqs-test-01',
    ]);
    const items = sponsoredBankItems([base]);
    const round = buildRankedRound('seed-sponsor-1', items);
    const sponsored = round.items.filter((i) => (i as { sponsor?: { name: string } }).sponsor);
    expect(sponsored).toHaveLength(1);
    expect((sponsored[0] as { sponsor: { name: string } }).sponsor.name).toBe('Örnek Kafe');
  });
});

describe('tur kurulumu', () => {
  it('sıralı tur: tohumdan deterministik, 10 soru, zorluk artar, etiket/açıklama sızmaz', () => {
    const a = buildRankedRound('seed-A');
    const b = buildRankedRound('seed-A');
    expect(a).toEqual(b);
    expect(a.items).toHaveLength(RANKED_COUNT);
    const diffs = a.items.map((i) => Number(i.difficulty));
    expect(diffs).toEqual([...diffs].sort((x, y) => x - y));
    for (const it of a.items) {
      expect(it).not.toHaveProperty('why');
      expect(it).not.toHaveProperty('label');
      expect(JSON.stringify(it)).not.toMatch(/vq-/);
      const opts = it.options as { id: string }[];
      expect(opts.map((o) => o.id)).toEqual(['o0', 'o1', 'o2', 'o3']);
      expect(opts.map((o) => o.id)).toContain(a.answerKey[it.id]);
    }
    // Doğru şık her zaman ilk sırada değil (karıştırma çalışıyor).
    const keys = new Set(Array.from({ length: 6 }, (_, i) => Object.values(buildRankedRound(`s${i}`).answerKey)).flat());
    expect(keys.size).toBeGreaterThan(1);
    // Kategoriler dengeli: tek kategori 3'ten fazla soru almaz.
    const per = new Map<string, number>();
    for (const it of a.items) per.set(String(it.category), (per.get(String(it.category)) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(3);
  });

  it('sıralı ve pratik havuzu ayrık; pratik etiketli ve açıklamalı', () => {
    const rankedPrompts = new Set(VENUE_QUIZ_POOLS.ranked.map((q) => q.payload.prompt));
    const practice = buildPracticeRound('p1');
    expect(practice.items.length).toBe(VENUE_QUIZ_POOLS.practice.length);
    for (const it of practice.items) expect(rankedPrompts.has(String(it.prompt))).toBe(false);
    expect(practice.items.some((i) => typeof i.why === 'string')).toBe(true);
  });
});

describe('puanlama', () => {
  it('hız bonusu ve tavan', () => {
    expect(speedBonus(1000)).toBe(5);
    expect(speedBonus(3000)).toBe(5);
    expect(speedBonus(14_999)).toBe(1);
    expect(speedBonus(QUESTION_MS)).toBe(0);
    expect(maxPossibleScore(10)).toBe(def.maxScore);
  });

  it('seri bonusu 3. ardışık doğrudan itibaren; süre aşımı doğru şıkta da 0', () => {
    const key = { q0: 'o0', q1: 'o0', q2: 'o0', q3: 'o0' };
    const r = scoreRun(
      [
        { id: 'q0', verdict: 'o0', tMs: 2000 },
        { id: 'q1', verdict: 'o0', tMs: 2000 + TRANSITION_MS + 2000 },
        { id: 'q2', verdict: 'o0', tMs: 4000 + 2 * TRANSITION_MS + 2000 },
        { id: 'q3', verdict: 'o0', tMs: 6000 + 3 * TRANSITION_MS + 20_000 },
      ],
      key
    );
    expect(r.answers.map((a) => a.points)).toEqual([15, 15, 17, 0]);
    expect(r.answers[3].timedOut).toBe(true);
  });
});

describe('sunucu doğrulayıcısı (sıralı)', () => {
  const seed = 'ranked-seed-1';
  const round = buildRankedRound(seed);

  it('dürüst oyuncu: puanı sunucu hesaplar, eşiği geçen ödüle hak kazanır', () => {
    const answers = play(round, { gapMs: 2500, correct: (i) => i !== 4 });
    const elapsed = answers[answers.length - 1].tMs / 1000 + 8;
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: { answers }, clientScore: 0, serverElapsedSec: elapsed });
    expect(out.flags.filter((f) => f !== 'score_mismatch')).toEqual([]);
    expect(out.verifiedScore).toBe(scoreRun(answers, round.answerKey).score);
    expect(out.verifiedScore).toBeGreaterThanOrEqual(def.rewardThreshold);
  });

  it('istemcinin şişirdiği skor sunucu skoruna iner', () => {
    const answers = play(round, { gapMs: 5000, correct: (i) => i < 3 });
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: { answers }, clientScore: 166, serverElapsedSec: 70 });
    expect(out.verifiedScore).toBe(scoreRun(answers, round.answerKey).score);
    expect(out.verifiedScore).toBeLessThan(def.rewardThreshold);
    expect(out.flags).toContain('score_mismatch');
  });

  it('kanıtsız tamamlama ödülsüz (proof_missing)', () => {
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: undefined, clientScore: 166, serverElapsedSec: 60 });
    expect(out.flags).toContain('proof_missing');
    expect(out.verifiedScore).toBe(0);
  });

  it('sıra dışı / tekrarlı soru ve tur dışı şık reddedilir', () => {
    const answers = play(round, { gapMs: 3000, correct: () => true });
    const swapped = [answers[1], answers[0], ...answers.slice(2)];
    expect(runVerifier(venueQuizVerifier, { seed, rules, proof: { answers: swapped }, clientScore: 0, serverElapsedSec: 60 }).flags).toContain('proof_invalid');
    const dup = [answers[0], { ...answers[0], tMs: answers[1].tMs }];
    expect(runVerifier(venueQuizVerifier, { seed, rules, proof: { answers: dup }, clientScore: 0, serverElapsedSec: 60 }).flags).toContain('proof_invalid');
    const bogus = [{ ...answers[0], verdict: 'o9' }];
    expect(runVerifier(venueQuizVerifier, { seed, rules, proof: { answers: bogus }, clientScore: 0, serverElapsedSec: 60 }).flags).toContain('proof_invalid');
  });

  it('insanüstü hızlı bot reddedilir (implausible)', () => {
    const answers = play(round, { gapMs: 80, correct: () => true });
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: { answers }, clientScore: 0, serverElapsedSec: 20 });
    expect(out.flags).toContain('implausible');
    expect(out.verifiedScore).toBe(0);
  });

  it('süre bankası: soruları araştırıp hızlı cevap beyan etmek reddedilir', () => {
    const answers = play(round, { gapMs: 1500, correct: () => true });
    const out = runVerifier(venueQuizVerifier, {
      seed,
      rules,
      proof: { answers },
      clientScore: 0,
      serverElapsedSec: (answers[answers.length - 1].tMs + MAX_OVERHEAD_MS + 30_000) / 1000,
    });
    expect(out.flags).toContain('implausible');
  });

  it('sunucu süresinden sonraki cevap reddedilir', () => {
    const answers = play(round, { gapMs: 3000, correct: () => true });
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: { answers }, clientScore: 0, serverElapsedSec: 5 });
    expect(out.flags).toContain('implausible');
  });

  it('başka tohumun cevapları puan getirmez (cevap anahtarı tura özgü)', () => {
    const other = buildRankedRound('baska-tohum');
    const answers = play(other, { gapMs: 2500, correct: () => true });
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: { answers }, clientScore: 0, serverElapsedSec: 60 });
    expect(out.verifiedScore).toBeLessThan(def.rewardThreshold);
  });

  it('süre dolan sorular (timeout) geçerli ama puansız', () => {
    const answers: TimedAnswer[] = round.items.slice(0, 2).map((it, i) => ({ id: it.id, verdict: TIMEOUT_VERDICT, tMs: (i + 1) * (QUESTION_MS + TRANSITION_MS) }));
    const out = runVerifier(venueQuizVerifier, { seed, rules, proof: { answers }, clientScore: 0, serverElapsedSec: 40 });
    expect(out.verifiedScore).toBe(0);
    expect(out.flags.filter((f) => f !== 'score_mismatch')).toEqual([]);
  });
});

describe('düello', () => {
  const NOW = 1_800_000_000_000;
  const mem = () => {
    const seen = new Set<string>();
    return async (k: string) => (seen.has(k) ? false : (seen.add(k), true));
  };

  it('aynı tur belirteci ikinci kez gönderilemez (review ile öğrenilen cevaplarla replay)', async () => {
    const consume = mem();
    const a = handleDuelRound({ userId: 'u1', now: NOW, secret: SECRET });
    const round = buildDuelRound(a.code);
    const weak = play(round, { gapMs: 3000, correct: () => false });
    await handleDuelSubmit({ userId: 'u1', userName: null, roundToken: a.roundToken, answers: weak, now: NOW + 40_000, secret: SECRET, consume });
    const perfect = play(round, { gapMs: 3000, correct: () => true });
    await expect(
      handleDuelSubmit({ userId: 'u1', userName: null, roundToken: a.roundToken, answers: perfect, now: NOW + 45_000, secret: SECRET, consume })
    ).rejects.toThrow('zaten');
    const again = signDuelToken({ k: 'r', c: a.code, u: 'u1', t: NOW + 1000 }, SECRET);
    await expect(
      handleDuelSubmit({ userId: 'u1', userName: null, roundToken: again, answers: perfect, now: NOW + 45_000, secret: SECRET, consume })
    ).rejects.toThrow('zaten');
  });

  it('aynı kod → aynı sorular; meydan okuma skoru imzalı ve karşılaştırılır', async () => {
    const a = handleDuelRound({ userId: 'u1', now: NOW, secret: SECRET, consume: mem() });
    expect(a.items).toHaveLength(8);
    expect(a.challenger).toBeNull();
    expect(a.items.every((i) => !('why' in i))).toBe(true);
    const round = buildDuelRound(a.code);
    const answers = play(round, { gapMs: 2500, correct: (i) => i < 6 });
    const res = await handleDuelSubmit({ userId: 'u1', userName: 'Ayşe Yılmaz', roundToken: a.roundToken, answers, now: NOW + 40_000, secret: SECRET, consume: mem() });
    expect(res.score).toBe(scoreRun(answers, round.answerKey).score);
    expect(res.correct).toBe(6);
    expect(res.review[0].answer).toBe(round.answerKey.q0);
    expect(res.versus).toBeNull();

    const b = handleDuelRound({ userId: 'u2', challenge: res.challengeToken, now: NOW + 60_000, secret: SECRET, consume: mem() });
    expect(b.code).toBe(a.code);
    expect(b.items).toEqual(a.items);
    expect(b.challenger).toEqual({ name: 'Ayşe Y.', score: res.score });
    const answersB = play(round, { gapMs: 2000, correct: () => true });
    const resB = await handleDuelSubmit({ userId: 'u2', userName: 'Mehmet', roundToken: b.roundToken, answers: answersB, now: NOW + 100_000, secret: SECRET, consume: mem() });
    expect(resB.versus).toEqual({ opponentName: 'Ayşe Y.', opponentScore: res.score, result: 'win' });
  });

  it('kurcalanmış meydan okuma / kendi düellosu / süresi dolmuş bağlantı reddedilir', async () => {
    const a = handleDuelRound({ userId: 'u1', now: NOW, secret: SECRET, consume: mem() });
    const round = buildDuelRound(a.code);
    const res = await handleDuelSubmit({
      userId: 'u1',
      userName: 'Ayşe',
      roundToken: a.roundToken,
      answers: play(round, { gapMs: 3000, correct: () => false, n: 2 }),
      now: NOW + 30_000,
      secret: SECRET,
      consume: mem(),
    });
    const [v, body, mac] = res.challengeToken.split('.');
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString());
    forged.s = 999;
    const tampered = `${v}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${mac}`;
    expect(() => handleDuelRound({ userId: 'u2', challenge: tampered, now: NOW, secret: SECRET, consume: mem() })).toThrow('geçersiz');
    expect(() => handleDuelRound({ userId: 'u1', challenge: res.challengeToken, now: NOW, secret: SECRET, consume: mem() })).toThrow('Kendi');
    expect(() => handleDuelRound({ userId: 'u2', challenge: res.challengeToken, now: NOW + 8 * 24 * 3600_000, secret: SECRET, consume: mem() })).toThrow('süresi');
    const wrongKey = signDuelToken({ k: 'c', c: a.code, u: 'u9', s: 10, n: 'X', x: NOW + 1000 }, 'another-secret-0123456789');
    expect(() => handleDuelRound({ userId: 'u2', challenge: wrongKey, now: NOW, secret: SECRET, consume: mem() })).toThrow('geçersiz');
  });

  it('tur belirteci başka kullanıcıya geçmez; bot hızı ve süre aşımı reddedilir', async () => {
    const a = handleDuelRound({ userId: 'u1', now: NOW, secret: SECRET, consume: mem() });
    const round = buildDuelRound(a.code);
    const honest = play(round, { gapMs: 3000, correct: () => true });
    await expect(handleDuelSubmit({ userId: 'u2', userName: null, roundToken: a.roundToken, answers: honest, now: NOW + 50_000, secret: SECRET, consume: mem() })).rejects.toThrow();
    const bot = play(round, { gapMs: 50, correct: () => true });
    await expect(handleDuelSubmit({ userId: 'u1', userName: null, roundToken: a.roundToken, answers: bot, now: NOW + 15_000, secret: SECRET, consume: mem() })).rejects.toThrow('doğrulanamadı');
    await expect(handleDuelSubmit({ userId: 'u1', userName: null, roundToken: a.roundToken, answers: honest, now: NOW + 16 * 60_000, secret: SECRET, consume: mem() })).rejects.toThrow('süresi');
  });
});

describe('portföy: isteğe bağlı oyun (admin açar)', () => {
  it('canlı ama varsayılan kapalı; override ile açılır', () => {
    expect(getGameEntry('venue-quiz')?.status).toBe('live');
    expect(resolveGameRoute('venue-quiz')).toMatchObject({ kind: 'play' });
    expect(def.optIn).toBe(true);
    expect(def.hidden).toBeUndefined();
    expect(defaultEnabledOf(def)).toBe(false);
    expect(mergeGameConfig(def, null).enabled).toBe(false);
    expect(
      mergeGameConfig(def, {
        gameType: 'venue-quiz',
        enabled: true,
        rewardPoints: null,
        rewardXp: null,
        rewardThreshold: null,
        minDurationSec: null,
        maxScore: null,
        title: null,
        description: null,
        emoji: null,
        accent: null,
      }).enabled
    ).toBe(true);
    // Diğer oyunlar etkilenmez.
    expect(mergeGameConfig(getMiniGame('daily-word')!, null).enabled).toBe(true);
  });

  it('turnuva rotasyonuna ve portföy tavanı sayımına girmez', () => {
    expect(visibleMiniGames().some((g) => g.gameType === 'venue-quiz')).toBe(false);
    expect(liveGames().some((g) => g.id === 'venue-quiz')).toBe(false);
  });
});
