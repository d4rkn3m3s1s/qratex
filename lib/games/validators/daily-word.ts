/**
 * Günün Kelimesi — SUNUCU otoritesi (saf kısım). Yalnız sunucu modülleri içe aktarır
 * (`registry/daily-word.server.ts`, `validators/daily-word-api.ts`, testler).
 *
 * Akış:
 *   1. Sıralı `start` (ortak) → deneme tohumu. İçerik YOK: kelime istemciye hiç gitmez.
 *   2. Her tahmin `POST /api/customer/daily-word/guess` → sunucu kelimeyi Europe/Istanbul gününden
 *      (deneme başlangıcının günü) bulur, rengi döner ve HMAC imzalı bir ZİNCİR belirteci verir:
 *      { tohum, gün, tahmin sayısı, çözüldü mü, tahminlerin karması }. Sayaç DB'de atomik.
 *   3. `complete` kanıtı = { chain, guesses }. Doğrulayıcı imzayı, tohumu, karmayı ve (imzalı
 *      günden yeniden hesaplanan) kelimeyi denetler; skor = 7 − tahmin (bulunamazsa 0).
 *
 * Herkese aynı kelime: gün dizini (2026-01-01'den) → gizli anahtarla karıştırılmış döngü
 * permütasyonu. Döngü içinde kelime tekrarlanmaz; kaynak kodu görmek kelimeyi ele vermez.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { createRng } from '@/lib/games/engine/rng';
import type { ClassificationVerifier, VerifierOutcome } from '@/lib/games/verify/types';
import { DAILY_WORD_ANSWERS, DAILY_WORD_EXTRA } from '@/lib/games/content/daily-word.server';
import {
  MAX_GUESSES,
  isWellFormed,
  istanbulDayKey,
  normalizeWord,
  scoreFor,
  scoreGuess,
} from '@/components/customer/games/daily-word/rules';

export const DAILY_WORD_GAME_TYPE = 'daily-word';

const EPOCH_DAY = Date.UTC(2026, 0, 1) / 86_400_000;

const VALID = new Set<string>([...DAILY_WORD_ANSWERS, ...DAILY_WORD_EXTRA]);

export function dailyWordSecret(): string {
  const s = process.env.GAME_ATTEMPT_SECRET || process.env.NEXTAUTH_SECRET;
  // Fail-closed: anahtarsız kelime/belirteç üretilmez (tahmin edilebilir kelime = hile).
  if (!s || s.length < 16) throw new Error('GAME_ATTEMPT_SECRET / NEXTAUTH_SECRET yapılandırılmamış.');
  return s;
}

/** Sözlükte (cevap ∪ ek liste) mi. Girdi normalize edilmiş olmalı. */
export function isAcceptedGuess(word: string): boolean {
  return isWellFormed(word) && VALID.has(word);
}

function dayIndex(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000 - EPOCH_DAY);
}

const permCache = new Map<string, readonly number[]>();
function cyclePerm(secret: string, cycle: number): readonly number[] {
  const key = `${createHash('sha256').update(secret).digest('hex').slice(0, 16)}:${cycle}`;
  const hit = permCache.get(key);
  if (hit) return hit;
  const idx = DAILY_WORD_ANSWERS.map((_, i) => i);
  const perm = createRng(`dw:${createHmac('sha256', secret).update(`cycle:${cycle}`).digest('hex')}`).shuffle(idx);
  if (permCache.size > 8) permCache.clear();
  permCache.set(key, perm);
  return perm;
}

/** Bir Europe/Istanbul gününün kelimesi (herkese aynı). */
export function dailyWordFor(dayKey: string, secret: string = dailyWordSecret()): string {
  const n = DAILY_WORD_ANSWERS.length;
  const i = dayIndex(dayKey);
  const cycle = Math.floor(i / n);
  const pos = ((i % n) + n) % n;
  return DAILY_WORD_ANSWERS[cyclePerm(secret, cycle)[pos]];
}

/**
 * Pratik kelimesi: pratik tohumundan (gizli anahtarla) — bugünün ve yarının kelimesi ASLA
 * çıkmaz (pratikle sıralı cevap kazınamaz).
 */
export function practiceWordFor(seed: string, now: Date = new Date(), secret: string = dailyWordSecret()): string {
  const today = istanbulDayKey(now);
  const tomorrow = istanbulDayKey(new Date(now.getTime() + 86_400_000));
  const banned = new Set([dailyWordFor(today, secret), dailyWordFor(tomorrow, secret)]);
  const h = createHmac('sha256', secret).update(`practice:${seed}`).digest();
  let i = h.readUInt32BE(0) % DAILY_WORD_ANSWERS.length;
  while (banned.has(DAILY_WORD_ANSWERS[i])) i = (i + 1) % DAILY_WORD_ANSWERS.length;
  return DAILY_WORD_ANSWERS[i];
}

// ───────────────────────────── Zincir belirteci ─────────────────────────────

const CHAIN_VERSION = 'dw1';

export interface ChainClaims {
  /** Deneme tohumu. */
  s: string;
  /** Kelimenin Europe/Istanbul günü. */
  d: string;
  /** Kabul edilen tahmin sayısı. */
  n: number;
  /** Çözüldü mü. */
  ok: boolean;
  /** Tahmin karması zinciri. */
  h: string;
}

/** Zincir karmasının bir adımı (sunucu tahmin kabul ettikçe artımlı kurar). */
export function nextGuessHash(prevHash: string | undefined, guess: string): string {
  return createHash('sha256').update(`${prevHash ?? 'dw'}|${guess}`).digest('hex').slice(0, 32);
}

export function hashGuesses(guesses: readonly string[]): string {
  let h: string | undefined;
  for (const g of guesses) h = nextGuessHash(h, g);
  return h ?? 'dw';
}

function chainMac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${CHAIN_VERSION}.${body}`).digest('base64url');
}

export function signChain(c: ChainClaims, secret: string = dailyWordSecret()): string {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url');
  return `${CHAIN_VERSION}.${body}.${chainMac(body, secret)}`;
}

export function verifyChain(token: unknown, secret: string = dailyWordSecret()): ChainClaims | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== CHAIN_VERSION) return null;
  const a = Buffer.from(chainMac(parts[1], secret));
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as ChainClaims;
    if (typeof c.s !== 'string' || typeof c.d !== 'string' || typeof c.n !== 'number' || typeof c.h !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

// ───────────────────────────── Doğrulayıcı ─────────────────────────────

export const dailyWordProofSchema = z.object({
  chain: z.string().min(10).max(1024),
  guesses: z.array(z.string().min(1).max(16)).min(1).max(MAX_GUESSES),
});
export type DailyWordProof = z.infer<typeof dailyWordProofSchema>;

export function scoreDailyWordProof(seed: string, proof: DailyWordProof, secret: string = dailyWordSecret()): VerifierOutcome {
  const c = verifyChain(proof.chain, secret);
  if (!c) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'zincir imzası geçersiz' };
  if (c.s !== seed) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'zincir başka denemenin' };
  const guesses = proof.guesses.map(normalizeWord);
  if (c.n !== guesses.length || c.n > MAX_GUESSES) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'tahmin sayısı uyuşmuyor' };
  if (hashGuesses(guesses) !== c.h) return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'tahmin listesi değiştirilmiş' };
  const word = dailyWordFor(c.d, secret);
  const lastSolved = guesses[guesses.length - 1] === word;
  if (lastSolved !== c.ok || guesses.slice(0, -1).includes(word)) {
    return { verifiedScore: 0, flags: ['proof_invalid'], detail: 'zincir durumu kelimeyle uyuşmuyor' };
  }
  return { verifiedScore: scoreFor(c.ok, c.n), flags: [] };
}

/**
 * Sınıflandırma ailesi kabuğu: tur içeriği BOŞ (kelime istemciye gitmez); pratik turu da boş
 * (pratik kelimesi yalnız tahmin uç noktasında, tohumdan sunucuda çözülür).
 */
export const dailyWordVerifier: ClassificationVerifier<DailyWordProof> = {
  kind: 'classification',
  requireProof: true,
  proofSchema: dailyWordProofSchema,
  buildRound: () => ({ items: [], answerKey: {} }),
  practiceRound: () => ({ items: [], answerKey: {} }),
  score: (_round, proof, input) => scoreDailyWordProof(input.seed, proof),
};

// ───────────────────────────── İstatistik (saf) ─────────────────────────────

export interface DailyWordStats {
  played: number;
  wins: number;
  winRate: number;
  currentStreak: number;
  maxStreak: number;
  /** distribution[i] = i+1 tahminde bulunan gün sayısı. */
  distribution: number[];
  today: { played: boolean; won: boolean; guesses: number | null };
}

function prevDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Sıralı deneme satırlarından istatistik. `dayKey` oturum günüdür (UTC; ortak deneme anahtarı),
 * `today` aynı anahtarla verilmeli. Kazanılan satırda `starsCollected` = sunucu skoru (7 − tahmin).
 */
export function computeDailyWordStats(
  rows: ReadonlyArray<{ dayKey: string; status: string; starsCollected: number }>,
  today: string
): DailyWordStats {
  const finished = rows.filter((r) => r.status === 'completed' || r.status === 'failed');
  const byDay = new Map<string, { won: boolean; score: number }>();
  for (const r of finished) byDay.set(r.dayKey, { won: r.status === 'completed', score: r.starsCollected });
  const distribution = new Array(MAX_GUESSES).fill(0) as number[];
  let wins = 0;
  for (const v of byDay.values()) {
    if (!v.won) continue;
    wins++;
    const g = MAX_GUESSES + 1 - v.score;
    if (g >= 1 && g <= MAX_GUESSES) distribution[g - 1]++;
  }
  const days = Array.from(byDay.keys()).sort();
  let maxStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    const won = byDay.get(d)!.won;
    run = won ? (prev && prevDay(d) === prev && run > 0 ? run + 1 : 1) : 0;
    maxStreak = Math.max(maxStreak, run);
    prev = d;
  }
  // Güncel seri: bugünden (oynanmadıysa dünden) geriye kesintisiz kazanılan günler.
  let cursor = byDay.has(today) ? today : prevDay(today);
  let currentStreak = 0;
  while (byDay.get(cursor)?.won) {
    currentStreak++;
    cursor = prevDay(cursor);
  }
  const t = byDay.get(today);
  return {
    played: byDay.size,
    wins,
    winRate: byDay.size ? Math.round((wins / byDay.size) * 100) : 0,
    currentStreak,
    maxStreak,
    distribution,
    today: { played: !!t, won: !!t?.won, guesses: t?.won ? MAX_GUESSES + 1 - t.score : null },
  };
}

export { scoreGuess };
