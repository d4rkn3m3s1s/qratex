/**
 * Günün Kelimesi — kurallar, kelime listesi, günlük kelime, zincirli tahmin uç noktası ve
 * sunucu doğrulayıcısı. Prisma yerine bellek içi sahte; gerçek DB'ye gidilmez.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-for-daily-word-0123456789';
jest.mock('@/lib/api-auth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {}, isPrismaConnectivityError: () => false }));

import { DAILY_WORD_ANSWERS, DAILY_WORD_EXTRA } from '@/lib/games/content/daily-word.server';
import {
  computeDailyWordStats,
  dailyWordFor,
  dailyWordVerifier,
  hashGuesses,
  practiceWordFor,
  signChain,
} from '@/lib/games/validators/daily-word';
import { handlePracticeGuess, handleRankedGuess, type DailyWordDb } from '@/lib/games/validators/daily-word-api';
import { istanbulDayKey, isWellFormed, normalizeWord, scoreGuess, shareText } from '@/components/customer/games/daily-word/rules';
import { runVerifier } from '@/lib/games/verify';
import { getMiniGame } from '@/lib/minigame-config';

const SECRET = process.env.NEXTAUTH_SECRET!;
const rules = (() => {
  const d = getMiniGame('daily-word')!;
  return { gameType: 'daily-word', maxScore: d.maxScore, rewardThreshold: d.rewardThreshold, minDurationSec: d.minDurationSec, maxScorePerSec: d.maxScorePerSec, maxDurationSec: d.maxDurationSec };
})();

describe('kurallar', () => {
  it('Türkçe büyük harf: i → İ, ı → I, şapka sadeleşir', () => {
    expect(normalizeWord('kitap')).toBe('KİTAP');
    expect(normalizeWord('ılık')).toBe('ILIK');
    expect(normalizeWord('rüzgâr')).toBe('RÜZGAR');
    expect(isWellFormed('KALEM')).toBe(true);
    expect(isWellFormed('KALEMX')).toBe(false);
    expect(isWellFormed('QUERY')).toBe(false);
  });

  it('tekrarlı harf renklendirmesi doğru', () => {
    expect(scoreGuess('KALEM', 'KALEM')).toEqual([2, 2, 2, 2, 2]);
    // Cevapta tek A var: ilk A doğru yerde, ikincisi yok.
    expect(scoreGuess('ARABA', 'ARMUT')).toEqual([2, 2, 0, 0, 0]);
    // Cevapta iki E: ikisi de "var".
    expect(scoreGuess('EKMEK', 'ŞEKER')).toEqual([1, 1, 0, 2, 0]);
    expect(scoreGuess('İNCİR', 'INCIR' as string)).toEqual([0, 2, 2, 0, 2]);
  });

  it('paylaşım kartı kelimeyi ele vermez', () => {
    const t = shareText({ dayLabel: '2026-10-11', rows: [[0, 1, 0, 0, 2], [2, 2, 2, 2, 2]], solved: true });
    expect(t).toContain('2/6');
    expect(t).toContain('🟩🟩🟩🟩🟩');
    expect(t).not.toMatch(/[A-ZÇĞİÖŞÜ]{5}/);
  });

  it('Europe/Istanbul günü (UTC+3)', () => {
    expect(istanbulDayKey(new Date('2026-10-10T21:30:00Z'))).toBe('2026-10-11');
    expect(istanbulDayKey(new Date('2026-10-10T20:59:00Z'))).toBe('2026-10-10');
  });
});

describe('kelime listesi', () => {
  it('en az 365 cevap, hepsi 5 Türkçe harf, tekrarsız, ek liste kesişmez', () => {
    expect(DAILY_WORD_ANSWERS.length).toBeGreaterThanOrEqual(365);
    for (const w of [...DAILY_WORD_ANSWERS, ...DAILY_WORD_EXTRA]) expect(isWellFormed(w)).toBe(true);
    expect(new Set(DAILY_WORD_ANSWERS).size).toBe(DAILY_WORD_ANSWERS.length);
    expect(new Set(DAILY_WORD_EXTRA).size).toBe(DAILY_WORD_EXTRA.length);
    const a = new Set(DAILY_WORD_ANSWERS);
    expect(DAILY_WORD_EXTRA.filter((w) => a.has(w))).toEqual([]);
  });

  it('herkese aynı günlük kelime; bir döngüde (365 gün) tekrar yok', () => {
    expect(dailyWordFor('2026-10-11', SECRET)).toBe(dailyWordFor('2026-10-11', SECRET));
    const seen = new Set<string>();
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 365; i++) seen.add(dailyWordFor(new Date(start + i * 86_400_000).toISOString().slice(0, 10), SECRET));
    expect(seen.size).toBe(365);
    // Anahtar değişince sıra değişir (kaynak kodu kelimeyi ele vermez).
    const other = Array.from({ length: 10 }, (_, i) => dailyWordFor(`2026-02-1${i}`, 'baska-bir-gizli-anahtar-123456'));
    const mine = Array.from({ length: 10 }, (_, i) => dailyWordFor(`2026-02-1${i}`, SECRET));
    expect(other).not.toEqual(mine);
  });

  it('pratik kelimesi dışlama yapmaz (bugün/yarın kâhini yok): tohumdan tekdüze', () => {
    const now = new Date('2026-10-11T09:00:00Z');
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(practiceWordFor(`seed${i}abcdef`, now, SECRET));
    // Örneklenmeyen kelime kümesi bugünün/yarının kelimesini ele vermemeli.
    expect(seen.has(dailyWordFor('2026-10-11', SECRET))).toBe(true);
    expect(seen.has(dailyWordFor('2026-10-12', SECRET))).toBe(true);
  });
});

// ───────────── Sahte DB ─────────────
type Row = { id: string; userId: string; gameType: string; seed: string; status: string; starsCollected: number; startedAt: Date; serverStartedAt: Date | null; expiresAt: Date | null };
function makeDb(rows: Row[]): DailyWordDb {
  return {
    miniGameSession: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => r.userId === where.userId && r.gameType === where.gameType && r.seed === where.seed && r.status === where.status) ?? null
      ),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((r) => r.userId === where.userId && r.gameType === where.gameType && r.id !== (where.id as { not: string }).not)
      ),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const r = rows.find((x) => x.id === where.id && x.status === where.status && x.starsCollected === where.starsCollected);
        if (!r) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
    } as unknown as DailyWordDb['miniGameSession'],
  };
}

const START = new Date('2026-10-11T08:00:00Z');
const NOW = new Date('2026-10-11T08:02:00Z');
const SEED = 'a'.repeat(32);
function freshRow(): Row {
  return { id: 's1', userId: 'u1', gameType: 'daily-word', seed: SEED, status: 'active', starsCollected: 0, startedAt: START, serverStartedAt: START, expiresAt: new Date(START.getTime() + 900_000) };
}
const WORD = () => dailyWordFor('2026-10-11', SECRET);
const wrongWords = () => DAILY_WORD_ANSWERS.filter((w) => w !== WORD()).slice(0, 6);

async function expectApiError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe('sıralı tahmin uç noktası', () => {
  it('dürüst oyun: 3. tahminde bulur → zincir doğrulanır, skor 4 ve ödül eşiği geçer', async () => {
    const row = freshRow();
    const db = makeDb([row]);
    const [w1, w2] = wrongWords();
    let chain: string | null = null;
    const guesses: string[] = [];
    for (const g of [w1, w2, WORD()]) {
      const r = await handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: g.toLocaleLowerCase('tr-TR'), chain, now: NOW });
      chain = r.chain!;
      guesses.push(r.guess);
      if (r.solved) {
        expect(r.done).toBe(true);
        expect(r.answer).toBe(WORD());
      } else {
        expect(r.answer).toBeUndefined();
      }
    }
    expect(row.starsCollected).toBe(3);
    const out = runVerifier(dailyWordVerifier, { seed: SEED, rules, proof: { chain, guesses }, clientScore: 4, serverElapsedSec: 120 });
    expect(out.flags).toEqual([]);
    expect(out.verifiedScore).toBe(4);
  });

  it('sözlük dışı tahmin hak yemez', async () => {
    const row = freshRow();
    await expectApiError(handleRankedGuess(makeDb([row]), { userId: 'u1', seed: SEED, guess: 'ZZZZZ', now: NOW }), 'NOT_IN_LIST');
    await expectApiError(handleRankedGuess(makeDb([row]), { userId: 'u1', seed: SEED, guess: 'KAL', now: NOW }), 'VALIDATION');
    expect(row.starsCollected).toBe(0);
  });

  it('hile: zinciri sıfırdan başlatıp sınırsız tahmin denemesi reddedilir', async () => {
    const row = freshRow();
    const db = makeDb([row]);
    const [w1, w2] = wrongWords();
    await handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: w1, chain: null, now: NOW });
    await expectApiError(handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: w2, chain: null, now: NOW }), 'CONFLICT');
  });

  it('hile: aynı zincirle paralel iki tahmin → biri reddedilir', async () => {
    const row = freshRow();
    const db = makeDb([row]);
    const [w1, w2, w3] = wrongWords();
    const r1 = await handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: w1, now: NOW });
    await handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: w2, chain: r1.chain, now: NOW });
    await expectApiError(handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: w3, chain: r1.chain, now: NOW }), 'CONFLICT');
  });

  it('6 hak dolunca kelime açıklanır; 7. tahmin reddedilir', async () => {
    const row = freshRow();
    const db = makeDb([row]);
    let chain: string | null = null;
    let last = null as Awaited<ReturnType<typeof handleRankedGuess>> | null;
    for (const g of wrongWords()) {
      last = await handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: g, chain, now: NOW });
      chain = last.chain!;
    }
    expect(last!.done).toBe(true);
    expect(last!.answer).toBe(WORD());
    await expectApiError(handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: WORD(), chain, now: NOW }), 'CONFLICT');
  });

  it('hile: UTC gün sınırında ikinci deneme aynı Istanbul kelimesine düşer → reddedilir', async () => {
    // 22:00 UTC (01:00 Istanbul, 12 Ekim) başlayan deneme 12 Ekim kelimesini oynar ve bitirir.
    const s1 = new Date('2026-10-11T22:00:00Z');
    const first: Row = { ...freshRow(), id: 'old', seed: 'b'.repeat(32), status: 'completed', starsCollected: 6, startedAt: s1, serverStartedAt: s1 };
    // Ertesi UTC günü (yeni günlük hak) 06:00 UTC = aynı Istanbul günü → cevap biliniyor.
    const s2 = new Date('2026-10-12T06:00:00Z');
    const second: Row = { ...freshRow(), id: 'new', startedAt: s2, serverStartedAt: s2, expiresAt: new Date(s2.getTime() + 900_000) };
    const db = makeDb([first, second]);
    await expectApiError(
      handleRankedGuess(db, { userId: 'u1', seed: SEED, guess: dailyWordFor('2026-10-12', SECRET), now: new Date(s2.getTime() + 60_000) }),
      'CONFLICT'
    );
    expect(second.starsCollected).toBe(0);
  });

  it('farklı Istanbul gününe ait önceki deneme engellemez', async () => {
    const s1 = new Date('2026-10-10T08:00:00Z');
    const first: Row = { ...freshRow(), id: 'old', seed: 'b'.repeat(32), status: 'completed', starsCollected: 4, startedAt: s1, serverStartedAt: s1 };
    const row = freshRow();
    const r = await handleRankedGuess(makeDb([first, row]), { userId: 'u1', seed: SEED, guess: wrongWords()[0], now: NOW });
    expect(r.guessCount).toBe(1);
  });

  it('başkasının tohumu / aktif olmayan deneme → 404', async () => {
    const row = freshRow();
    await expectApiError(handleRankedGuess(makeDb([row]), { userId: 'u2', seed: SEED, guess: 'KALEM', now: NOW }), 'NOT_FOUND');
  });
});

describe('doğrulayıcı hile senaryoları', () => {
  const day = '2026-10-11';
  it('kanıtsız → proof_missing; sahte imza → proof_invalid', () => {
    expect(runVerifier(dailyWordVerifier, { seed: SEED, rules, proof: undefined, clientScore: 6, serverElapsedSec: 60 }).flags).toContain('proof_missing');
    const forged = signChain({ s: SEED, d: day, n: 1, ok: true, h: hashGuesses([WORD()]) }, 'saldirganin-anahtari-0123456789');
    const out = runVerifier(dailyWordVerifier, { seed: SEED, rules, proof: { chain: forged, guesses: [WORD()] }, clientScore: 6, serverElapsedSec: 60 });
    expect(out.flags).toContain('proof_invalid');
    expect(out.verifiedScore).toBe(0);
  });

  it('başka denemenin zinciri ya da değiştirilmiş tahmin listesi reddedilir', () => {
    const chain = signChain({ s: 'b'.repeat(32), d: day, n: 1, ok: true, h: hashGuesses([WORD()]) }, SECRET);
    expect(runVerifier(dailyWordVerifier, { seed: SEED, rules, proof: { chain, guesses: [WORD()] }, clientScore: 6, serverElapsedSec: 60 }).flags).toContain('proof_invalid');
    const [w1] = wrongWords();
    const mine = signChain({ s: SEED, d: day, n: 2, ok: true, h: hashGuesses([w1, WORD()]) }, SECRET);
    const out = runVerifier(dailyWordVerifier, { seed: SEED, rules, proof: { chain: mine, guesses: [WORD()] }, clientScore: 6, serverElapsedSec: 60 });
    expect(out.flags).toContain('proof_invalid');
  });

  it('istemci skoru şişirirse sunucu skoru esas alınır', () => {
    const [w1, w2] = wrongWords();
    const chain = signChain({ s: SEED, d: day, n: 3, ok: true, h: hashGuesses([w1, w2, WORD()]) }, SECRET);
    const out = runVerifier(dailyWordVerifier, { seed: SEED, rules, proof: { chain, guesses: [w1, w2, WORD()] }, clientScore: 6, serverElapsedSec: 60 });
    expect(out.verifiedScore).toBe(4);
    expect(out.flags).toContain('score_mismatch');
  });
});

describe('pratik', () => {
  it('ödülsüz tahmin ve açıklama tutarlı', () => {
    const now = new Date('2026-10-11T09:00:00Z');
    const { answer } = handlePracticeGuess({ seed: 'p'.repeat(32), reveal: true, now });
    const r = handlePracticeGuess({ seed: 'p'.repeat(32), guess: answer!, now });
    expect(r.solved).toBe(true);
  });
});

describe('istatistik', () => {
  it('seri, en uzun seri, dağılım', () => {
    const s = computeDailyWordStats(
      [
        { dayKey: '2026-10-05', status: 'completed', starsCollected: 6 },
        { dayKey: '2026-10-06', status: 'completed', starsCollected: 5 },
        { dayKey: '2026-10-07', status: 'failed', starsCollected: 0 },
        { dayKey: '2026-10-09', status: 'completed', starsCollected: 4 },
        { dayKey: '2026-10-10', status: 'completed', starsCollected: 4 },
      ],
      '2026-10-11'
    );
    expect(s.played).toBe(5);
    expect(s.wins).toBe(4);
    expect(s.winRate).toBe(80);
    expect(s.currentStreak).toBe(2);
    expect(s.maxStreak).toBe(2);
    expect(s.distribution).toEqual([1, 1, 2, 0, 0, 0]);
    expect(s.today.played).toBe(false);
  });
});
