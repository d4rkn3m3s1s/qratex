/**
 * Mini oyun deneme çekirdeği — SUNUCU OTORİTESİ (P0-17 → F4.1 temeli).
 *
 * Generic oyunlar (`/api/customer/games/[game]/*`) ve pacman (`/api/customer/games/pacman/*`)
 * AYNI kuralları buradan kullanır; kural tek yerde yaşar.
 *
 * Deneme modeli ("günde 1 hak" = günde 1 DENEME, yol haritası §7.2 + oyun-ekosistemi K3):
 *   - start: sunucu tohum (seed) + tek kullanımlık nonce + sunucu başlangıç saati +
 *     son geçerlilik (expiresAt) üretir; HMAC imzalı deneme belirteci döner. Deneme
 *     BAŞLANGIÇTA harcanır.
 *   - Aynı gün tekrar start: deneme bitmişse (`completed` = kazandı, `failed` = kaybetti /
 *     yarım bıraktı) `alreadyPlayed` + sonuç. Yarım kalan `active` deneme yalnız kısa bir
 *     ağ-tekrarı penceresinde (RESUME_GRACE_MS) aynen geri verilir; sonrası `failed`
 *     (yenile-tekrar dene istismarı kapalı). Süre penceresi (expiresAt) aşılmış deneme de
 *     `failed`.
 *   - complete: belirteç doğrulanır; skor sunucuda kırpılır; süre ve saniye başına skor
 *     makullüğü SUNUCU saatine göre denetlenir; kazanma kararı (`won`) sunucunundur —
 *     istemcinin `won` bayrağı yalnız kozmetiktir. Ödül `mintPoints` ile (atomik, tek
 *     seferlik `game:<sessionId>`, oyun kategorisi tavanı 600/gün · 3.000/hafta, kilit altında mintPoints içinde,
 *     aynı tx'te `points_credited`).
 *   - Tamamlanmış/başarısız denemeye tekrar complete → 409 DEĞİL, kayıtlı sonuç
 *     (idempotent; ağ tekrarı dürüst oyuncuya hata göstermez).
 *
 * Seed şimdilik içerik üretiminde kullanılmıyor (F4.2 ortak motor + replay için zemin);
 * belirteç ve satır onu taşıyor ki istemci/sunucu aynı tohumla deterministik oyun kurabilsin.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { prisma } from '@/lib/prisma';
import { mintPoints } from '@/lib/economy';
import { DEFAULT_MAX_DURATION_SEC } from '@/lib/minigame-config';
import { istanbulDay } from '@/components/ds/page/date-range';

type RootDb = typeof prisma;
type AnyDb = Prisma.TransactionClient | RootDb;

// ─────────────────────────────── Sabitler ───────────────────────────────

/** Yarım deneme bu süre içinde yeniden istenirse (çift tık, ağ tekrarı) aynısı döner. */
export const ATTEMPT_RESUME_GRACE_MS = 20_000;
/** İstemcinin bildirdiği süre sunucu süresini bu kadar aşarsa saat tutarsızlığı işareti. */
export const CLIENT_CLOCK_SLACK_SEC = 5;

/** Oturum durumları. `abandoned` eski/elle yazılmış satırlar için tanınır (yeni kod `failed` yazar). */
export type GameSessionStatus = 'active' | 'completed' | 'failed' | 'abandoned';

/** Deneme bitti mi (oynandı sayılır). */
export function isFinishedStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'abandoned';
}

/** Kullanıcıya gösterilecek sonuç. */
export function outcomeOfStatus(status: string): 'won' | 'lost' | null {
  if (status === 'completed') return 'won';
  if (status === 'failed' || status === 'abandoned') return 'lost';
  return null;
}

/**
 * Günlük hak anahtarı — Europe/Istanbul takvim günü "YYYY-MM-DD"
 * (`@@unique([userId, gameType, dayKey])`). Oyun günü Türkiye'de gece 00:00'da yenilenir
 * (oyun-ekosistemi O6: eskiden UTC → 03:00'te sıfırlanıyor, 00:00–03:00 arası "dün"
 * sayılıyor, Günün Kelimesi'nin İstanbul kelime günüyle çakışıyordu). Geçiş anında anahtar
 * yalnız İLERİ atlayabilir (İstanbul ≥ UTC tarihi) → aynı gün anahtarı iki kez açılamaz.
 * Seri/gün aritmetiği anahtar dizesi üzerinde (addDaysKey) — saat dilimi bağımsız.
 */
export function gameDayKey(now: Date = new Date()): string {
  return istanbulDay(now);
}

// ─────────────────────────────── Kurallar ───────────────────────────────

/** Sunucu doğrulamasının ihtiyaç duyduğu etkin oyun kuralları (EffectiveMiniGame uyumlu). */
export interface GameRules {
  gameType: string;
  maxScore: number;
  rewardThreshold: number;
  rewardPoints: number;
  rewardXp: number;
  minDurationSec: number;
  maxScorePerSec?: number;
  maxDurationSec?: number;
  enabled: boolean;
  hidden?: boolean;
}

export function maxDurationSecOf(game: Pick<GameRules, 'maxDurationSec'>): number {
  const v = game.maxDurationSec;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_DURATION_SEC;
}

// ───────────────────────────── Deneme belirteci ─────────────────────────────

const TOKEN_VERSION = 'ga1';

export interface AttemptClaims {
  sid: string;
  uid: string;
  g: string;
  n: string;
  seed: string;
  exp: number;
}

function tokenSecret(): string {
  const s = process.env.GAME_ATTEMPT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    // Fail-closed: imzasız deneme belirteci üretilmez.
    throw new Error('GAME_ATTEMPT_SECRET / NEXTAUTH_SECRET yapılandırılmamış.');
  }
  return s;
}

function mac(body: string): string {
  return createHmac('sha256', tokenSecret()).update(`${TOKEN_VERSION}.${body}`).digest('base64url');
}

/** HMAC imzalı deneme belirteci (oturum + kullanıcı + oyun + nonce + seed + son geçerlilik). */
export function signAttemptToken(c: AttemptClaims): string {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url');
  return `${TOKEN_VERSION}.${body}.${mac(body)}`;
}

/**
 * Belirteci doğrular ve beklenen denemeyle BİREBİR eşleştiğini kontrol eder. Süre
 * kontrolü burada değil, satırdaki `expiresAt` ile yapılır (tek gerçek kaynak DB).
 */
export function verifyAttemptToken(
  token: unknown,
  expected: { sessionId: string; userId: string; gameType: string; nonce: string }
): boolean {
  if (typeof token !== 'string' || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;
  const [, body, got] = parts;
  let want: string;
  try {
    want = mac(body);
  } catch {
    return false;
  }
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  let c: AttemptClaims;
  try {
    c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AttemptClaims;
  } catch {
    return false;
  }
  return (
    c.sid === expected.sessionId &&
    c.uid === expected.userId &&
    c.g === expected.gameType &&
    c.n === expected.nonce
  );
}

function newSeed(): string {
  return randomBytes(16).toString('hex');
}
function newNonce(): string {
  return randomBytes(18).toString('base64url');
}

// ───────────────────────────── Makullük değerlendirmesi ─────────────────────────────

/**
 * Bloklayan bayraklar kazanmayı ve ödülü engeller; `client_clock_mismatch` ve
 * `score_clamped` yalnız hile sinyalidir (incelemeye; dürüst oyuncuyu cezalandırmaz).
 */
export type AttemptFlag =
  | 'expired'
  | 'too_fast'
  | 'rate_exceeded'
  | 'below_threshold'
  | 'game_disabled'
  | 'game_hidden'
  | 'score_clamped'
  | 'client_clock_mismatch'
  // Oyun doğrulayıcısı (lib/games/verify) bayrakları:
  | 'proof_missing'
  | 'proof_invalid'
  | 'implausible'
  | 'score_mismatch';

const BLOCKING_WIN: ReadonlySet<AttemptFlag> = new Set([
  'expired',
  'too_fast',
  'rate_exceeded',
  'below_threshold',
  'proof_missing',
  'proof_invalid',
  'implausible',
]);

/** Oyun doğrulayıcısının sonucu (lib/games/verify → VerifierOutcome ile yapısal uyumlu). */
export interface AttemptVerification {
  verifiedScore: number;
  flags: ReadonlyArray<'proof_missing' | 'proof_invalid' | 'implausible' | 'score_mismatch'>;
  detail?: string;
}

export interface AttemptEvaluation {
  /** Sunucunun kabul ettiği skor (0..maxScore). */
  verifiedScore: number;
  /** İstemcinin ham beyanı. */
  clientScore: number;
  /** Sunucu saatine göre geçen süre (sn, ondalıklı). */
  serverElapsedSec: number;
  /** Sunucu kararı: deneme kazanıldı mı (eşik + makullük). Liderlik/turnuva/seri buna bakar. */
  won: boolean;
  /** Ödüle uygun mu (kazandı + oyun açık + gizli değil). */
  rewardEligible: boolean;
  flags: AttemptFlag[];
}

/** Saf fonksiyon: skor + zaman beyanını sunucu kurallarıyla değerlendirir. */
export function evaluateAttempt(
  game: GameRules,
  input: {
    clientScore: number;
    clientDurationSec: number;
    startedAt: Date;
    expiresAt: Date;
    now: Date;
    /**
     * Oyun doğrulayıcısının sonucu (varsa): skor İSTEMCİNİN değil doğrulayıcının skorudur;
     * bloklayan bayraklar kazanmayı engeller. Yoksa istemci skoru kırpılarak kullanılır.
     */
    verification?: AttemptVerification | null;
  }
): AttemptEvaluation {
  const flags: AttemptFlag[] = [];
  const raw = Number.isFinite(input.clientScore) ? Math.floor(input.clientScore) : 0;
  const v = input.verification;
  const basis = v ? (Number.isFinite(v.verifiedScore) ? Math.floor(v.verifiedScore) : 0) : raw;
  const verifiedScore = Math.max(0, Math.min(game.maxScore, basis));
  if (raw > game.maxScore) flags.push('score_clamped');
  if (v) for (const f of v.flags) if (!flags.includes(f)) flags.push(f);

  const serverElapsedSec = Math.max(0, (input.now.getTime() - input.startedAt.getTime()) / 1000);

  if (input.now.getTime() > input.expiresAt.getTime()) flags.push('expired');
  if (serverElapsedSec < game.minDurationSec || input.clientDurationSec < game.minDurationSec) {
    flags.push('too_fast');
  }
  const rate = game.maxScorePerSec;
  if (typeof rate === 'number' && rate > 0 && verifiedScore > rate * Math.max(1, serverElapsedSec)) {
    flags.push('rate_exceeded');
  }
  if (input.clientDurationSec > serverElapsedSec + CLIENT_CLOCK_SLACK_SEC) {
    flags.push('client_clock_mismatch');
  }
  if (verifiedScore < game.rewardThreshold) flags.push('below_threshold');

  const won = !flags.some((f) => BLOCKING_WIN.has(f));
  if (!game.enabled) flags.push('game_disabled');
  if (game.hidden) flags.push('game_hidden');
  const rewardEligible = won && game.enabled && !game.hidden && game.rewardPoints + game.rewardXp > 0;

  return { verifiedScore, clientScore: raw, serverElapsedSec, won, rewardEligible, flags };
}

/** Kullanıcıya gösterilecek Türkçe gerekçe (kazanılamadıysa / ödül yoksa). */
export function attemptReasonMessage(ev: AttemptEvaluation, game: Pick<GameRules, 'rewardThreshold'>): string | null {
  if (ev.flags.includes('expired')) return 'Deneme süresi doldu; bu deneme kayıp sayıldı.';
  if (ev.flags.includes('proof_missing') || ev.flags.includes('proof_invalid')) {
    return 'Oyun kaydı doğrulanamadı; bu deneme ödüle sayılmadı. Uygulamayı yenileyip yarın tekrar dene.';
  }
  if (ev.flags.includes('implausible')) return 'Oyun akışı makul görünmedi; bu deneme ödüle sayılmadı.';
  if (ev.flags.includes('too_fast')) return 'Oyun beklenenden çok kısa sürdü; bu deneme ödüle sayılmadı.';
  if (ev.flags.includes('rate_exceeded')) return 'Skor, oyun süresine göre makul değil; bu deneme ödüle sayılmadı.';
  if (ev.flags.includes('below_threshold')) return `Ödül için en az ${game.rewardThreshold} skor gerekiyordu.`;
  if (ev.flags.includes('game_disabled')) return 'Bu oyun şu anda ödül vermiyor.';
  if (ev.flags.includes('game_hidden')) return 'Bu oyun emekliye ayrıldı; ödül vermiyor.';
  return null;
}

// ───────────────────────────── Start ─────────────────────────────

const START_SELECT = {
  id: true,
  status: true,
  starsCollected: true,
  rewardPoints: true,
  startedAt: true,
  serverStartedAt: true,
  expiresAt: true,
  nonce: true,
  seed: true,
} as const;

type StartRow = {
  id: string;
  status: string;
  starsCollected: number;
  rewardPoints: number;
  startedAt: Date;
  serverStartedAt: Date | null;
  expiresAt: Date | null;
  nonce: string | null;
  seed: string | null;
};

export type StartResult =
  | {
      kind: 'played';
      outcome: 'won' | 'lost';
      /** Bu istekte süre aşımı / terk nedeniyle failed'a çekildi. */
      expiredNow: boolean;
      session: { id: string; status: string; starsCollected: number; rewardPoints: number };
    }
  | {
      kind: 'attempt';
      /** Ağ tekrarı penceresinde aynı deneme geri verildi. */
      resumed: boolean;
      sessionId: string;
      seed: string;
      token: string;
      startedAt: Date;
      expiresAt: Date;
    };

function playedResult(row: StartRow, status: string, expiredNow: boolean): StartResult {
  return {
    kind: 'played',
    outcome: outcomeOfStatus(status) ?? 'lost',
    expiredNow,
    session: { id: row.id, status, starsCollected: row.starsCollected, rewardPoints: row.rewardPoints },
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

/**
 * Günün denemesini çözer: biten → played; yeni → attempt; yarım → kısa pencere içinde
 * aynı deneme, değilse failed (deneme başlangıçta harcanır).
 */
export async function resolveStartAttempt(
  db: AnyDb,
  params: { userId: string; game: GameRules; now?: Date }
): Promise<StartResult> {
  const now = params.now ?? new Date();
  const { userId, game } = params;
  const dayKey = gameDayKey(now);
  const windowMs = maxDurationSecOf(game) * 1000;

  const issue = (row: { id: string; nonce: string; seed: string; startedAt: Date; expiresAt: Date }, resumed: boolean): StartResult => ({
    kind: 'attempt',
    resumed,
    sessionId: row.id,
    seed: row.seed,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    token: signAttemptToken({
      sid: row.id,
      uid: userId,
      g: game.gameType,
      n: row.nonce,
      seed: row.seed,
      exp: row.expiresAt.getTime(),
    }),
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = (await db.miniGameSession.findUnique({
      where: { userId_gameType_dayKey: { userId, gameType: game.gameType, dayKey } },
      select: START_SELECT,
    })) as StartRow | null;

    if (!existing) {
      const seed = newSeed();
      const nonce = newNonce();
      const expiresAt = new Date(now.getTime() + windowMs);
      try {
        const created = await db.miniGameSession.create({
          data: {
            userId,
            gameType: game.gameType,
            dayKey,
            status: 'active',
            startedAt: now,
            serverStartedAt: now,
            seed,
            nonce,
            expiresAt,
          },
          select: { id: true },
        });
        return issue({ id: created.id, nonce, seed, startedAt: now, expiresAt }, false);
      } catch (e) {
        // Paralel iki start: biri kazanır, diğeri onun satırını okuyup aynı yoldan devam eder.
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }

    if (isFinishedStatus(existing.status)) return playedResult(existing, existing.status, false);

    // ── active ──
    if (!existing.nonce) {
      // Dağıtım öncesinden kalan (nonce'suz) yarım deneme: bir kez yeni kurallarla yeniden
      // başlatılır. (Eski pacman hatası yüzünden bugünün denemeleri hiç gönderilemedi;
      // onları "kaybetti" saymak dürüst oyuncuyu cezalandırırdı.) nonce: null koşulu tek
      // seferliği garanti eder.
      const seed = newSeed();
      const nonce = newNonce();
      const expiresAt = new Date(now.getTime() + windowMs);
      const upgraded = await db.miniGameSession.updateMany({
        where: { id: existing.id, status: 'active', nonce: null },
        data: { serverStartedAt: now, seed, nonce, expiresAt },
      });
      if (upgraded.count === 1) return issue({ id: existing.id, nonce, seed, startedAt: now, expiresAt }, false);
      continue; // başka istek yükseltti → yeniden oku
    }

    const startedAt = existing.serverStartedAt ?? existing.startedAt;
    const expiresAt = existing.expiresAt ?? new Date(startedAt.getTime() + windowMs);
    const withinGrace = now.getTime() - startedAt.getTime() <= ATTEMPT_RESUME_GRACE_MS;
    if (withinGrace && now.getTime() <= expiresAt.getTime()) {
      return issue({ id: existing.id, nonce: existing.nonce, seed: existing.seed ?? '', startedAt, expiresAt }, true);
    }

    // Yarım bırakılmış ya da süresi dolmuş deneme: harcandı → failed (oynandı, kaybedildi).
    const expired = await db.miniGameSession.updateMany({
      where: { id: existing.id, status: 'active', nonce: existing.nonce },
      data: { status: 'failed', completedAt: now, rewardPoints: 0 },
    });
    if (expired.count === 1) return playedResult(existing, 'failed', true);
    // Bu arada tamamlandı → yeniden oku.
  }
  throw new Error('Oyun denemesi çözümlenemedi (yarış).');
}

// ───────────────────────────── Complete ─────────────────────────────

export type FinalizeResult =
  | { kind: 'not_found' }
  | { kind: 'invalid_token' }
  | {
      kind: 'already_finished';
      status: string;
      won: boolean;
      score: number;
      rewardPoints: number;
    }
  | {
      kind: 'finished';
      status: 'completed' | 'failed';
      evaluation: AttemptEvaluation;
      /** Bu tamamlamada gerçekten kredilenen puan (tavan sonrası). */
      credited: number;
      xpCredited: number;
      capped: boolean;
      streak: number;
      streakBonusXp: number;
    };

/** Günlük seri bonusu: her gün +10 XP, her 3. günde +30 XP ek. */
export function streakBonusFor(streak: number): number {
  if (streak <= 0) return 0;
  return 10 + (streak % 3 === 0 ? 30 : 0);
}

function addDaysKey(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Bugünden geriye kesintisiz gün sayısı (bugün dahil). */
export function countStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  set.add(today);
  let n = 0;
  let cur = today;
  while (set.has(cur)) {
    n += 1;
    cur = addDaysKey(cur, -1);
  }
  return n;
}

/**
 * Denemeyi sunucu kurallarıyla kapatır ve (uygunsa) ödülü atomik olarak basar.
 * `onValidated`: oturum doğrulandıktan sonra, tx'ten ÖNCE çağrılır (ör. başarımların
 * "önce" fotoğrafı) — geçersiz isteklerde pahalı iş yapılmasın.
 */
export async function finalizeAttempt(
  db: RootDb,
  params: {
    userId: string;
    game: GameRules;
    sessionId: string;
    clientScore: number;
    clientDurationSec: number;
    token?: string | null;
    now?: Date;
    onValidated?: () => Promise<void>;
    /**
     * Oyun doğrulayıcısı (lib/games/verify → runVerifier). Belirteç doğrulandıktan SONRA,
     * DB'deki tohum (istemciden değil) ve sunucu saatine göre geçen süreyle çağrılır.
     * null dönerse yalnız ortak makullük kuralları uygulanır.
     */
    verify?: (ctx: { seed: string | null; serverElapsedSec: number }) => AttemptVerification | null;
  }
): Promise<FinalizeResult> {
  const now = params.now ?? new Date();
  const { userId, game, sessionId } = params;

  const row = await db.miniGameSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      userId: true,
      gameType: true,
      status: true,
      starsCollected: true,
      rewardPoints: true,
      startedAt: true,
      serverStartedAt: true,
      expiresAt: true,
      nonce: true,
      seed: true,
    },
  });
  // gameType kontrolü: başka oyunun oturumu bu oyunun kuralıyla kapatılamaz (pacman B5).
  if (!row || row.userId !== userId || row.gameType !== game.gameType) return { kind: 'not_found' };

  if (row.status !== 'active') {
    return {
      kind: 'already_finished',
      status: row.status,
      won: row.status === 'completed',
      score: row.starsCollected,
      rewardPoints: row.rewardPoints,
    };
  }

  // Yeni denemeler nonce taşır → belirteç zorunlu. Nonce'suz (dağıtım öncesi) satır eski
  // istemciden gelebilir; onun için belirteç aranmaz ama tüm makullük kuralları geçerli.
  if (row.nonce && !verifyAttemptToken(params.token, { sessionId, userId, gameType: game.gameType, nonce: row.nonce })) {
    return { kind: 'invalid_token' };
  }

  const startedAt = row.serverStartedAt ?? row.startedAt;
  const expiresAt = row.expiresAt ?? new Date(startedAt.getTime() + maxDurationSecOf(game) * 1000);
  const verification = params.verify
    ? params.verify({
        seed: row.seed ?? null,
        serverElapsedSec: Math.max(0, (now.getTime() - startedAt.getTime()) / 1000),
      })
    : null;
  const evaluation = evaluateAttempt(game, {
    clientScore: params.clientScore,
    clientDurationSec: params.clientDurationSec,
    startedAt,
    expiresAt,
    now,
    verification,
  });

  if (params.onValidated) await params.onValidated();

  const status: 'completed' | 'failed' = evaluation.won ? 'completed' : 'failed';
  const today = gameDayKey(now);

  const out = await db.$transaction(async (tx) => {
    // Atomik tek-claim: yalnız hâlâ active olan (ve okuduğumuz nonce'a ait) deneme kapanır.
    const claimed = await tx.miniGameSession.updateMany({
      where: { id: sessionId, userId, gameType: game.gameType, status: 'active', nonce: row.nonce },
      data: {
        status,
        starsCollected: evaluation.verifiedScore,
        clientScore: evaluation.clientScore,
        rewardPoints: 0,
        completedAt: now,
      },
    });
    if (claimed.count === 0) return null;

    let credited = 0;
    let xpCredited = 0;
    let capped = false;
    if (evaluation.rewardEligible) {
      const r = await mintPoints(tx, {
        userId,
        points: game.rewardPoints,
        xp: game.rewardXp,
        source: 'game',
        sourceId: sessionId,
        idempotencyKey: `game:${sessionId}`,
        meta: { gameType: game.gameType, sessionId, score: evaluation.verifiedScore },
      });
      credited = r.credited;
      xpCredited = r.xpCredited;
      capped = r.capped;
      if (credited > 0) {
        await tx.miniGameSession.update({ where: { id: sessionId }, data: { rewardPoints: credited } });
      }
    }

    // Günlük seri bonusu: günün İLK kazanılan denemesi (sunucu kararı; tavandan bağımsız).
    // createMany + skipDuplicates = ON CONFLICT DO NOTHING: Postgres tx'i abort ETMEZ
    // (önceki create+P2002 yakalama, tx'i "current transaction is aborted"e sokuyordu).
    let streak = 0;
    let streakBonusXp = 0;
    if (evaluation.won && game.enabled && !game.hidden) {
      const claim = await tx.gameStreakClaim.createMany({
        data: [{ userId, dayKey: today }],
        skipDuplicates: true,
      });
      if (claim.count === 1) {
        const since = new Date(now.getTime() - 120 * 86_400_000);
        const rows = await tx.miniGameSession.findMany({
          where: { userId, status: 'completed', completedAt: { gte: since } },
          select: { dayKey: true },
          distinct: ['dayKey'],
        });
        streak = countStreak(
          rows.map((r) => r.dayKey),
          today
        );
        streakBonusXp = streakBonusFor(streak);
        if (streakBonusXp > 0) {
          await mintPoints(tx, {
            userId,
            points: 0,
            xp: streakBonusXp,
            source: 'game_streak',
            sourceId: sessionId,
            idempotencyKey: `game_streak:${userId}:${today}`,
            capCategory: null,
            meta: { streak, gameType: game.gameType },
          });
        }
      }
    }

    return { credited, xpCredited, capped, streak, streakBonusXp };
  });

  if (!out) {
    const after = await db.miniGameSession.findUnique({
      where: { id: sessionId },
      select: { status: true, starsCollected: true, rewardPoints: true },
    });
    return {
      kind: 'already_finished',
      status: after?.status ?? 'failed',
      won: after?.status === 'completed',
      score: after?.starsCollected ?? 0,
      rewardPoints: after?.rewardPoints ?? 0,
    };
  }

  return { kind: 'finished', status, evaluation, ...out };
}

/**
 * Süresi dolmuş yarım denemeleri `failed`'a çeker (cron/temizlik için; start ve complete
 * zaten tembel olarak uygular). Dönen sayı = kapatılan deneme.
 */
export async function expireStaleAttempts(db: AnyDb, now: Date = new Date()): Promise<number> {
  const r = await db.miniGameSession.updateMany({
    where: { status: 'active', expiresAt: { lt: now } },
    data: { status: 'failed', completedAt: now, rewardPoints: 0 },
  });
  return r.count;
}
