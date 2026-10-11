/**
 * Günün Kelimesi — tahmin ve istatistik işleyicileri (sunucu; DB erişimi enjekte edilir → jest).
 * HTTP kabuğu: `app/api/customer/daily-word/{guess,stats}/route.ts` (defineRoute: rol + zod + rate limit).
 *
 * Sıralı tahmin güvenliği:
 *   - Deneme kullanıcının kendi AKTİF `daily-word` oturumu olmalı (tohum + userId eşleşmesi).
 *   - Tahmin sayacı `MiniGameSession.starsCollected` (oyun sürerken kullanılmayan alan; `complete`
 *     onu sunucu skoruyla ezer). Artış ATOMİK ve önceki sayaca koşullu → paralel/yinelenen
 *     tahmin, zinciri sıfırdan başlatma ve 6'dan fazla tahmin imkânsız.
 *   - Sözlük dışı / bozuk tahmin hak YEMEZ.
 *   - Kelime yalnız oyun bittiğinde (bulundu ya da 6 hak doldu) döner.
 */
import { ApiError } from '@/lib/http/define-route';
import { gameDayKey } from '@/lib/game-session';
import {
  MAX_GUESSES,
  istanbulDayKey,
  isWellFormed,
  normalizeWord,
  scoreGuess,
  type Mark,
} from '@/components/customer/games/daily-word/rules';
import {
  DAILY_WORD_GAME_TYPE,
  computeDailyWordStats,
  dailyWordFor,
  dailyWordSecret,
  isAcceptedGuess,
  nextGuessHash,
  practiceWordFor,
  signChain,
  verifyChain,
  type ChainClaims,
  type DailyWordStats,
} from './daily-word';

interface SessionRow {
  id: string;
  status: string;
  starsCollected: number;
  startedAt: Date;
  serverStartedAt: Date | null;
  expiresAt: Date | null;
}

/** Bu işleyicilerin kullandığı Prisma alt kümesi. */
export interface DailyWordDb {
  miniGameSession: {
    findFirst(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

export interface GuessResult {
  guess: string;
  marks: Mark[];
  solved: boolean;
  guessCount: number;
  done: boolean;
  /** Yalnız oyun bittiğinde. */
  answer?: string;
  /** Sıralı: yeni zincir belirteci (complete kanıtına girer). */
  chain?: string;
  /** Sıralı: kelimenin Europe/Istanbul günü (paylaşım kartı). */
  dayKey?: string;
}

function checkGuess(raw: string): string {
  const guess = normalizeWord(raw);
  if (!isWellFormed(guess)) {
    throw new ApiError('VALIDATION', 'Tahmin tam 5 Türkçe harf olmalı.', { status: 400 });
  }
  if (!isAcceptedGuess(guess)) {
    throw new ApiError('NOT_IN_LIST', 'Bu kelime sözlükte yok. Hakkın gitmedi, başka bir kelime dene.', { status: 422 });
  }
  return guess;
}

export async function handleRankedGuess(
  db: DailyWordDb,
  p: { userId: string; seed: string; guess: string; chain?: string | null; now?: Date }
): Promise<GuessResult> {
  const now = p.now ?? new Date();
  const guess = checkGuess(p.guess);
  const secret = dailyWordSecret();

  const row = (await db.miniGameSession.findFirst({
    where: { userId: p.userId, gameType: DAILY_WORD_GAME_TYPE, seed: p.seed, status: 'active' },
    select: { id: true, status: true, starsCollected: true, startedAt: true, serverStartedAt: true, expiresAt: true },
  })) as SessionRow | null;
  if (!row) throw new ApiError('NOT_FOUND', 'Aktif bir Günün Kelimesi denemen yok. Oyunu yeniden başlat.', { status: 404 });
  if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) {
    throw new ApiError('ATTEMPT_EXPIRED', 'Deneme süresi doldu.', { status: 410 });
  }

  const n = row.starsCollected;
  let prev = null as ReturnType<typeof verifyChain>;
  if (n > 0) {
    prev = verifyChain(p.chain, secret);
    if (!prev || prev.s !== p.seed || prev.n !== n) {
      throw new ApiError('CONFLICT', 'Tahmin geçmişin bu cihazla uyuşmuyor (başka sekmede oynanmış olabilir).', { status: 409 });
    }
    if (prev.ok || n >= MAX_GUESSES) throw new ApiError('CONFLICT', 'Bu deneme zaten bitti.', { status: 409 });
  } else if (p.chain) {
    throw new ApiError('CONFLICT', 'Tahmin geçmişi geçersiz.', { status: 409 });
  }

  const dayKey = prev?.d ?? istanbulDayKey(row.serverStartedAt ?? row.startedAt);
  // Günlük hak anahtarı da artık Europe/Istanbul günü (gameDayKey). Eskiden UTC'ydi: 21:00–24:00 UTC
  // arası başlayan deneme ile ertesi UTC günü başlayan deneme AYNI kelimeye düşüyordu. Denetim,
  // geçiş günü ve olası saat kaymalarına karşı savunma derinliği olarak kalır.
  // Kök: aynı Istanbul kelime gününe ait başka (oynanmış) deneme varsa reddet. Her tahminde denetlenir
  // (iki denemeyi paralel açıp sürdürme de kapanır).
  await assertSingleAttemptPerWordDay(db, p.userId, row, dayKey);

  const answer = dailyWordFor(dayKey, secret);

  // Atomik tek-sayaç: yalnız okuduğumuz sayaçtan bir sonrakine geçer.
  const claimed = await db.miniGameSession.updateMany({
    where: { id: row.id, status: 'active', starsCollected: n },
    data: { starsCollected: n + 1 },
  });
  if (claimed.count !== 1) {
    throw new ApiError('CONFLICT', 'Bu tahmin zaten işlendi; sayfayı yenile.', { status: 409 });
  }

  // Önceki tahminlerin karması zincirde; yeni karma = önceki karma + bu tahmin.
  const marks = scoreGuess(guess, answer);
  const solved = guess === answer;
  const claims: ChainClaims = { s: p.seed, d: dayKey, n: n + 1, ok: solved, h: nextGuessHash(prev?.h, guess) };
  const done = solved || claims.n >= MAX_GUESSES;
  return {
    guess,
    marks,
    solved,
    guessCount: claims.n,
    done,
    ...(done ? { answer } : {}),
    chain: signChain(claims, secret),
    dayKey,
  };
}

async function assertSingleAttemptPerWordDay(db: DailyWordDb, userId: string, row: SessionRow, dayKey: string) {
  const t = (row.serverStartedAt ?? row.startedAt).getTime();
  const others = (await db.miniGameSession.findMany({
    where: {
      userId,
      gameType: DAILY_WORD_GAME_TYPE,
      id: { not: row.id },
      startedAt: { gte: new Date(t - 2 * 86_400_000), lte: new Date(t + 2 * 86_400_000) },
    },
    select: { id: true, status: true, starsCollected: true, startedAt: true, serverStartedAt: true },
    take: 10,
  })) as Array<Pick<SessionRow, 'id' | 'status' | 'starsCollected' | 'startedAt' | 'serverStartedAt'>>;
  const clash = others.some(
    (o) =>
      o.id !== row.id &&
      (o.starsCollected > 0 || o.status !== 'active') &&
      istanbulDayKey(o.serverStartedAt ?? o.startedAt) === dayKey
  );
  if (clash) throw new ApiError('CONFLICT', 'Bugünün kelimesini zaten oynadın. Yarın yeni kelime seni bekliyor!', { status: 409 });
}

export function handlePracticeGuess(p: { seed: string; guess?: string; reveal?: boolean; now?: Date }): {
  marks?: Mark[];
  guess?: string;
  solved?: boolean;
  answer?: string;
} {
  const answer = practiceWordFor(p.seed, p.now ?? new Date());
  if (p.reveal) return { answer };
  if (!p.guess) throw new ApiError('VALIDATION', 'Tahmin gerekli.', { status: 400 });
  const guess = checkGuess(p.guess);
  const marks = scoreGuess(guess, answer);
  return { guess, marks, solved: guess === answer };
}

export async function loadDailyWordStats(db: DailyWordDb, userId: string, now: Date = new Date()): Promise<DailyWordStats> {
  const rows = (await db.miniGameSession.findMany({
    where: { userId, gameType: DAILY_WORD_GAME_TYPE, status: { in: ['completed', 'failed'] } },
    select: { dayKey: true, status: true, starsCollected: true },
    orderBy: { dayKey: 'desc' },
    take: 800,
  })) as Array<{ dayKey: string; status: string; starsCollected: number }>;
  return computeDailyWordStats(rows, gameDayKey(now));
}
