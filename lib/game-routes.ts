/**
 * Mini oyun start/complete HTTP işleyicileri — generic `[game]` route'ları ve eski pacman
 * route'ları AYNI işleyiciyi çağırır (kural tek yerde: lib/game-session.ts).
 *
 * Yanıt sözleşmesi geriye uyumlu (lib/use-mini-game.ts ve pacman bileşeni):
 *   start    → { success, canPlay, mode:'ranked', sessionId, config, attemptToken, seed, serverStartedAt,
 *                expiresAt, verification, content? (sınıflandırma ailesi: ETİKETSİZ tur) }
 *              | { success, canPlay:false, alreadyPlayed:true, outcome, session, message }
 *   complete → { success, rewarded, rewardPoints, rewardXp, won, score, streak, streakBonusXp,
 *                newAchievements, tooFast, capped, reason, alreadyCompleted? }
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import {
  getEffectiveMiniGame,
  getEffectiveMiniGameFresh,
  publicGameConfig,
} from '@/lib/minigame-config-effective';
import { attemptReasonMessage, finalizeAttempt, gameDayKey, resolveStartAttempt } from '@/lib/game-session';
import { getVerifierForGameType } from '@/lib/games/registry/server';
import { isLiveGameType } from '@/lib/games/registry/live-game-types';
import { practiceContentFor, rankedContentFor, runVerifier, type VerifierRules } from '@/lib/games/verify';
import { randomSeed } from '@/lib/games/engine/rng';
import type { EffectiveMiniGame } from '@/lib/minigame-config-effective';
import {
  loadAchievementBasis,
  statsFromBasis,
  withFinishedAttempt,
  type AchievementBasis,
} from '@/lib/game-achievement-stats';
import { invalidateGameRankings } from '@/lib/game-rankings';
import { evaluateAchievements } from '@/lib/game-achievements';
import { isEconomyError } from '@/lib/economy';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

/** İnceleme için analytics'e yazılan bayraklar (dürüst oyuncuyu cezalandırmaz). */
const INTEGRITY_SIGNAL_FLAGS: ReadonlySet<string> = new Set([
  'proof_missing',
  'proof_invalid',
  'implausible',
  'score_mismatch',
  'score_clamped',
  'client_clock_mismatch',
  'rate_exceeded',
]);

/** Doğrulayıcının ihtiyaç duyduğu kural alt kümesi. */
function verifierRules(game: EffectiveMiniGame): VerifierRules {
  return {
    gameType: game.gameType,
    maxScore: game.maxScore,
    rewardThreshold: game.rewardThreshold,
    minDurationSec: game.minDurationSec,
    maxScorePerSec: game.maxScorePerSec,
    maxDurationSec: game.maxDurationSec,
  };
}

/** Gizli oyunun Türkçe gerekçesi (emekli ↔ yapım aşamasında). */
function hiddenMessage(game: EffectiveMiniGame): string {
  return game.release === 'building'
    ? 'Bu oyun henüz yayında değil. Oyun Merkezi’nden başka bir oyun seçebilirsin.'
    : 'Bu oyun emekliye ayrıldı. Oyun Merkezi’nden başka bir oyun seçebilirsin.';
}

/** Sunucu modülü olmayan (emekli/birleşmiş, doğrulayıcısız) oyunun gerekçesi. */
const NO_MODULE_MESSAGE = 'Bu oyun emekliye ayrıldı. Oyun Merkezi’nden başka bir oyun seçebilirsin.';

/** Doğrulayıcısı olmayan eski oyunda sıralı deneme kazanılamaz (fail-closed). */
const NO_MODULE_VERIFICATION = { verifiedScore: 0, flags: ['proof_missing' as const], detail: 'sunucu modülü yok' };
/**
 * Canlı listede olup doğrulayıcısı bağlanmamış oyun (kayıt hatası): istemci beyanına puan
 * basılmaz — K1 sunucu otoritesi kayıt defteri hatasında da fail-closed kalır.
 */
const UNWIRED_VERIFICATION = { verifiedScore: 0, flags: ['proof_missing' as const], detail: 'doğrulayıcı bağlı değil' };

/**
 * POST start — günde 1 DENEME (başlangıçta harcanır).
 * `opts.userId`: çağıran route kimliği zaten doğruladıysa (defineRoute) tekrar sorgulanmaz.
 */
export async function handleGameStart(gameType: string, opts: { userId?: string } = {}): Promise<NextResponse> {
  try {
    const game = await getEffectiveMiniGame(gameType);
    if (!game) return json({ error: 'Oyun bulunamadı', canPlay: false }, 404);

    let userId = opts.userId;
    if (!userId) {
      const auth = await requireAuth(['CUSTOMER']);
      if ('error' in auth) return auth.error;
      userId = auth.session.user.id;
    }

    // Portföyden çıkarılan (§7.3), yapım aşamasındaki ya da admin'in kapattığı oyun yeni deneme açamaz.
    if (game.hidden) {
      return json({ error: hiddenMessage(game), canPlay: false }, 403);
    }
    if (!game.enabled) return json({ error: 'Bu oyun şu anda kullanılamıyor', canPlay: false }, 403);
    // Emekli/birleşmiş eski kimlik: arayüzü yok, doğrulayıcısı yok → sıralı deneme açılmaz.
    if (!isLiveGameType(game.gameType)) {
      return json({ error: NO_MODULE_MESSAGE, code: 'GAME_RETIRED', canPlay: false }, 403);
    }

    const r = await resolveStartAttempt(prisma, { userId, game });

    if (r.kind === 'played') {
      return json({
        success: true,
        canPlay: false,
        alreadyPlayed: true,
        outcome: r.outcome,
        session: r.session,
        message: r.expiredNow
          ? 'Bugünkü denemen yarım kaldığı için kullanılmış sayıldı. Yarın yeni hakkın var!'
          : r.outcome === 'won'
            ? 'Bugünün oyununu kazandın. Yarın tekrar gel!'
            : 'Bugünkü denemeni kullandın. Yarın tekrar dene!',
      });
    }

    // Sınıflandırma ailesi: tur tohumdan kurulur, istemciye ETİKETSİZ gider (lib/games/verify).
    const verifier = getVerifierForGameType(gameType);
    const content = rankedContentFor(verifier, r.seed, verifierRules(game));

    return json({
      success: true,
      canPlay: true,
      mode: 'ranked',
      sessionId: r.sessionId,
      attemptToken: r.token,
      seed: r.seed,
      resumed: r.resumed,
      serverStartedAt: r.startedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      config: publicGameConfig(game),
      verification: verifier?.kind ?? 'plausibility',
      ...(content ? { content } : {}),
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[MINIGAME_START]', gameType, error);
    return json({ error: 'Oyun başlatılamadı', canPlay: false }, 500);
  }
}

export interface CompleteBody {
  sessionId: string;
  score: number;
  durationSec: number;
  /** Kozmetik: kazanma kararı sunucunundur. */
  won?: boolean;
  attemptToken?: string | null;
  /** Oyun doğrulayıcısının kanıtı (cevaplar / girdi kaydı / checkpoint izi). Şemayı doğrulayıcı uygular. */
  proof?: unknown;
}

/** POST complete — sunucu doğrular, karar verir, ödülü atomik basar. */
export async function handleGameComplete(
  gameType: string,
  body: CompleteBody,
  opts: { userId?: string } = {}
): Promise<NextResponse> {
  try {
    let resolvedUserId = opts.userId;
    if (!resolvedUserId) {
      const auth = await requireAuth(['CUSTOMER']);
      if ('error' in auth) return auth.error;
      resolvedUserId = auth.session.user.id;
    }
    const userId: string = resolvedUserId;

    // Puan basan karar önbelleksiz config ile (admin "kapat" = derhal ödülsüz).
    const game = await getEffectiveMiniGameFresh(gameType);
    if (!game) return json({ error: 'Oyun bulunamadı' }, 404);

    const verifier = getVerifierForGameType(gameType);
    // Sunucu modülü olmayan eski oyunun (önceden açılmış) denemesi kapanır ama kazanılamaz.
    const hasModule = isLiveGameType(game.gameType);
    const now = new Date();
    // Başarım "önce" temeli BİR kez yüklenir; "sonra" bu denemeden saf olarak türetilir (Y6).
    let basis: AchievementBasis | null = null;
    const result = await finalizeAttempt(prisma, {
      userId,
      game,
      sessionId: body.sessionId,
      clientScore: body.score,
      clientDurationSec: body.durationSec,
      token: body.attemptToken ?? null,
      now,
      // Oyun doğrulayıcısı: tohum DB'den, süre sunucu saatinden; skor sunucunun olur.
      verify: !hasModule
        ? () => NO_MODULE_VERIFICATION
        : verifier
        ? ({ seed, serverElapsedSec }) =>
            runVerifier(verifier, {
              seed: seed ?? '',
              rules: verifierRules(game),
              proof: body.proof,
              clientScore: body.score,
              serverElapsedSec,
            })
        : () => UNWIRED_VERIFICATION,
      onValidated: async () => {
        try {
          basis = await loadAchievementBasis(prisma, userId);
        } catch {
          basis = null; // başarım tespiti kritik değil
        }
      },
    });

    if (result.kind === 'not_found') return json({ error: 'Oturum bulunamadı' }, 404);
    if (result.kind === 'invalid_token') {
      return json(
        { error: 'Oyun oturumu doğrulanamadı. Sayfayı yenileyip tekrar deneyin.', code: 'INVALID_ATTEMPT_TOKEN' },
        400
      );
    }
    if (result.kind === 'already_finished') {
      // İdempotent: aynı deneme için tekrar gönderim kayıtlı sonucu döndürür (409 değil).
      return json({
        success: true,
        alreadyCompleted: true,
        rewarded: result.rewardPoints > 0,
        rewardPoints: result.rewardPoints,
        rewardXp: 0,
        won: result.won,
        score: result.score,
        streak: 0,
        streakBonusXp: 0,
        newAchievements: [],
        tooFast: false,
        capped: false,
        reason: null,
      });
    }

    const { evaluation } = result;

    // Kazanılan deneme liderliği/turnuvayı değiştirir → önbellek düşer (oyuncu sonuç ekranında
    // kendi skorunu bayat görmez). Kaybedilen deneme sıralamaya girmez.
    if (result.status === 'completed' && evaluation.verifiedScore > 0) {
      await invalidateGameRankings(game.gameType, now);
    }

    // Hile sinyali görünürlüğü (F4.1 `|client − verified|`): şüpheli bayraklı denemeler
    // analytics'e yazılır (şema bekleyen MiniGameAttempt.flags yerine). Kritik değil.
    const signals = evaluation.flags.filter((f) => INTEGRITY_SIGNAL_FLAGS.has(f));
    if (signals.length > 0) {
      try {
        await prisma.analyticsEvent.create({
          data: {
            userId,
            event: 'game_attempt_flagged',
            category: 'game_integrity',
            data: {
              gameType,
              sessionId: body.sessionId,
              flags: signals,
              clientScore: evaluation.clientScore,
              verifiedScore: evaluation.verifiedScore,
              serverElapsedSec: Math.round(evaluation.serverElapsedSec),
              verification: verifier?.kind ?? 'plausibility',
            },
          },
        });
      } catch {
        /* sinyal kaydı kritik değil; sonuç yine döner */
      }
    }

    if (result.credited > 0) {
      await prisma.notification
        .create({
          data: {
            userId,
            title: `${game.emoji} ${game.title} Ödülü!`,
            message: `${result.credited} puan + ${result.xpCredited} XP kazandın!`,
            type: 'success',
          },
        })
        .catch(() => undefined);
    }

    let newAchievements: { id: string; title: string; icon: string }[] = [];
    const beforeBasis = basis as AchievementBasis | null;
    if (beforeBasis) {
      try {
        const before = new Set(
          evaluateAchievements(statsFromBasis(beforeBasis))
            .filter((a) => a.unlocked)
            .map((a) => a.id)
        );
        const after = evaluateAchievements(
          statsFromBasis(
            withFinishedAttempt(beforeBasis, {
              gameType: game.gameType,
              status: result.status,
              score: evaluation.verifiedScore,
              dayKey: gameDayKey(now),
            })
          )
        );
        newAchievements = after
          .filter((a) => a.unlocked && !before.has(a.id))
          .map((a) => ({ id: a.id, title: a.title, icon: a.icon }));
        if (newAchievements.length > 0) {
          await prisma.notification.create({
            data: {
              userId,
              title: '🏆 Yeni Başarım!',
              message: newAchievements.map((a) => `${a.icon} ${a.title}`).join(', '),
              type: 'success',
            },
          });
        }
      } catch {
        // Başarım tespiti kritik değil; sessizce geç.
      }
    }

    const capped = result.capped && evaluation.rewardEligible;
    return json({
      success: true,
      rewarded: result.credited > 0,
      rewardPoints: result.credited,
      rewardXp: result.xpCredited,
      won: evaluation.won,
      score: evaluation.verifiedScore,
      streak: result.streak,
      streakBonusXp: result.streakBonusXp,
      newAchievements,
      tooFast: evaluation.flags.includes('too_fast'),
      capped,
      reason: capped && result.credited === 0
        ? 'Bugünkü oyun puanı sınırına ulaştın; XP ve başarımlar işlemeye devam ediyor.'
        : attemptReasonMessage(evaluation, game),
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    if (isEconomyError(error)) {
      return json({ error: error.message, code: error.code }, error.httpStatus);
    }
    console.error('[MINIGAME_COMPLETE]', gameType, error);
    return json({ error: 'Oyun tamamlanamadı' }, 500);
  }
}

/**
 * Pratik turu — sınırsız, ÖDÜLSÜZ, liderliğe ve turnuvaya girmez; DB'ye yazmaz.
 * Tohum her çağrıda yenidir. Sınıflandırma ailesinde PRATİK havuzundan ETİKETLİ tur döner
 * (sıralı havuzdan ayrı: sınırsız pratikle sıralı etiketler kazınamaz).
 */
export type PracticeRoundResult =
  | {
      ok: true;
      data: {
        mode: 'practice';
        seed: string;
        config: ReturnType<typeof publicGameConfig>;
        verification: string;
        content?: unknown[];
        answerKey?: Record<string, string>;
      };
    }
  | { ok: false; status: number; error: string };

export async function buildPracticeRound(gameType: string): Promise<PracticeRoundResult> {
  const game = await getEffectiveMiniGame(gameType);
  if (!game) return { ok: false, status: 404, error: 'Oyun bulunamadı' };
  if (game.hidden) return { ok: false, status: 403, error: hiddenMessage(game) };
  if (!game.enabled) return { ok: false, status: 403, error: 'Bu oyun şu anda kullanılamıyor' };
  if (!isLiveGameType(game.gameType)) return { ok: false, status: 403, error: NO_MODULE_MESSAGE };

  const seed = randomSeed();
  const verifier = getVerifierForGameType(gameType);
  const round = practiceContentFor(verifier, seed, verifierRules(game));
  return {
    ok: true,
    data: {
      mode: 'practice',
      seed,
      config: publicGameConfig(game),
      verification: verifier?.kind ?? 'plausibility',
      ...(round ? { content: round.items, answerKey: round.answerKey } : {}),
    },
  };
}
