/**
 * Mekân Bilgi Yarışması — asenkron düello (ödülsüz, sunucu puanlı). HTTP kabuğu:
 * `app/api/customer/venue-quiz/duel/route.ts` (defineRoute: rol + zod + rate limit).
 *
 * Kod → pratik havuzundan 8 soru (`buildDuelRound`; etiketler zaten pratikte açık olduğu için
 * sıralı havuzun cevapları düelloyla kazınamaz). Tur ve meydan okuma HMAC imzalı, durumsuz
 * belirteçlerdir (şema gerekmez); puanı sunucu sıralı turla aynı `scoreRound` ile hesaplar.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { randomSeed } from '@/lib/games/engine/rng';
import type { PublicContentItem } from '@/lib/games/verify/types';
import { ApiError } from '@/lib/http/define-route';
import { QUESTION_MS, TRANSITION_MS, shortDisplayName, type TimedAnswer } from '@/components/customer/games/venue-quiz/rules';
import { buildDuelRound, scoreRound } from './venue-quiz';

const TOKEN_VERSION = 'vqd1';
/** Tur belirteci geçerliliği (bir düello turu en fazla bu sürede bitirilir). */
export const DUEL_ROUND_TTL_MS = 15 * 60 * 1000;
/** Meydan okuma bağlantısı geçerliliği. */
export const DUEL_CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CodeSchema = z.string().regex(/^[a-f0-9]{16}$/);
const RoundClaims = z.object({
  k: z.literal('r'),
  c: CodeSchema,
  u: z.string().min(1).max(64),
  t: z.number().int().positive(),
  ch: z.object({ s: z.number().int().min(0).max(10_000), n: z.string().max(40) }).optional(),
});
const ChallengeClaims = z.object({
  k: z.literal('c'),
  c: CodeSchema,
  u: z.string().min(1).max(64),
  s: z.number().int().min(0).max(10_000),
  n: z.string().max(40),
  x: z.number().int().positive(),
});
export type DuelRoundClaims = z.infer<typeof RoundClaims>;
export type DuelChallengeClaims = z.infer<typeof ChallengeClaims>;

export function duelSecret(): string {
  const s = process.env.GAME_ATTEMPT_SECRET || process.env.NEXTAUTH_SECRET;
  // Fail-closed: anahtarsız belirteç üretilmez (sahte meydan okuma skoru = yanıltma).
  if (!s || s.length < 16) throw new Error('GAME_ATTEMPT_SECRET / NEXTAUTH_SECRET yapılandırılmamış.');
  return s;
}

function mac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_VERSION}.duel.${body}`).digest('base64url');
}

export function signDuelToken(claims: DuelRoundClaims | DuelChallengeClaims, secret: string = duelSecret()): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${TOKEN_VERSION}.${body}.${mac(body, secret)}`;
}

function readToken(token: unknown, secret: string): unknown {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const a = Buffer.from(mac(parts[1], secret));
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function verifyRoundToken(token: unknown, secret: string = duelSecret()): DuelRoundClaims | null {
  const r = RoundClaims.safeParse(readToken(token, secret));
  return r.success ? r.data : null;
}

export function verifyChallengeToken(token: unknown, secret: string = duelSecret()): DuelChallengeClaims | null {
  const r = ChallengeClaims.safeParse(readToken(token, secret));
  return r.success ? r.data : null;
}

export function newDuelCode(): string {
  return randomSeed().slice(0, 16);
}

export interface DuelRoundResponse {
  code: string;
  items: PublicContentItem[];
  questionMs: number;
  transitionMs: number;
  roundToken: string;
  challenger: { name: string; score: number } | null;
}

/** POST action=round — yeni düello ya da gelen meydan okumanın turu. */
export function handleDuelRound(input: { userId: string; challenge?: string | null; now?: number; secret?: string }): DuelRoundResponse {
  const secret = input.secret ?? duelSecret();
  const now = input.now ?? Date.now();
  let code = newDuelCode();
  let ch: DuelRoundClaims['ch'];
  if (input.challenge) {
    const c = verifyChallengeToken(input.challenge, secret);
    if (!c) throw new ApiError('BAD_REQUEST', 'Düello bağlantısı geçersiz.');
    if (c.x < now) throw new ApiError('BAD_REQUEST', 'Bu düello bağlantısının süresi dolmuş.');
    if (c.u === input.userId) throw new ApiError('BAD_REQUEST', 'Kendi düellonu oynayamazsın; bağlantıyı bir arkadaşınla paylaş.');
    code = c.c;
    ch = { s: c.s, n: c.n };
  }
  const round = buildDuelRound(code);
  return {
    code,
    items: round.items,
    questionMs: QUESTION_MS,
    transitionMs: TRANSITION_MS,
    roundToken: signDuelToken({ k: 'r', c: code, u: input.userId, t: now, ...(ch ? { ch } : {}) }, secret),
    challenger: ch ? { name: ch.n, score: ch.s } : null,
  };
}

export interface DuelSubmitResponse {
  score: number;
  correct: number;
  total: number;
  review: { id: string; answer: string; correct: boolean; timedOut: boolean; points: number; why: string | null }[];
  challengeToken: string;
  challengeExpiresAt: string;
  versus: { opponentName: string; opponentScore: number; result: 'win' | 'lose' | 'draw' } | null;
}

/** POST action=submit — düello cevaplarını sunucu puanlar; paylaşılabilir meydan okuma döner. */
export function handleDuelSubmit(input: {
  userId: string;
  userName: string | null | undefined;
  roundToken: string;
  answers: readonly TimedAnswer[];
  now?: number;
  secret?: string;
}): DuelSubmitResponse {
  const secret = input.secret ?? duelSecret();
  const now = input.now ?? Date.now();
  const claims = verifyRoundToken(input.roundToken, secret);
  if (!claims || claims.u !== input.userId) throw new ApiError('BAD_REQUEST', 'Düello turu doğrulanamadı.');
  const elapsed = now - claims.t;
  if (elapsed < 0 || elapsed > DUEL_ROUND_TTL_MS) throw new ApiError('BAD_REQUEST', 'Düello turunun süresi doldu; yeniden başlat.');
  const round = buildDuelRound(claims.c);
  const scored = scoreRound(round, input.answers, elapsed);
  if (scored.outcome.flags.length > 0) {
    throw new ApiError('BAD_REQUEST', 'Sonuç doğrulanamadı (cevap zamanlaması tutarsız). Turu yeniden oyna.');
  }
  const score = scored.outcome.verifiedScore;
  const challenge: DuelChallengeClaims = {
    k: 'c',
    c: claims.c,
    u: input.userId,
    s: score,
    n: shortDisplayName(input.userName),
    x: now + DUEL_CHALLENGE_TTL_MS,
  };
  const pq = new Map(scored.perQuestion.map((p) => [p.id, p]));
  return {
    score,
    correct: scored.correct,
    total: round.items.length,
    review: round.items.map((it) => {
      const p = pq.get(it.id);
      return {
        id: it.id,
        answer: round.answerKey[it.id],
        correct: p?.correct ?? false,
        timedOut: p ? p.timedOut : true,
        points: p?.points ?? 0,
        why: round.why[it.id] ?? null,
      };
    }),
    challengeToken: signDuelToken(challenge, secret),
    challengeExpiresAt: new Date(challenge.x).toISOString(),
    versus: claims.ch
      ? {
          opponentName: claims.ch.n,
          opponentScore: claims.ch.s,
          result: score > claims.ch.s ? 'win' : score < claims.ch.s ? 'lose' : 'draw',
        }
      : null,
  };
}
