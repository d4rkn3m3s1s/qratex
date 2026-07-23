import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { MINI_GAMES, getMiniGame } from '@/lib/minigame-config';
import { MINIGAME_CONFIG_TAG } from '@/lib/minigame-config-effective';

export const dynamic = 'force-dynamic';

/**
 * Admin mini oyun kontrol paneli API'si.
 * GET  → her registry oyunu için: varsayılan + override + effective değerler +
 *        oynanma istatistikleri (bugün / son 30 gün / ödül verilen).
 * PATCH → tek bir oyunun override'ını upsert eder (enabled/ödül/eşik/görsel).
 *         null/boş alan = override'ı kaldır (registry varsayılanına dön).
 * Ödül DAİMA sunucuda effective değerlerden hesaplanır; bu panel onları yönetir.
 */

const DAY = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const today = new Date().toISOString().slice(0, 10);
    const since30 = new Date(Date.now() - 30 * DAY);

    const [overrides, playedToday, played30, rewarded30] = await Promise.all([
      prisma.miniGameConfig.findMany(),
      prisma.miniGameSession.groupBy({
        by: ['gameType'],
        where: { dayKey: today, status: 'completed' },
        _count: { _all: true },
      }),
      prisma.miniGameSession.groupBy({
        by: ['gameType'],
        where: { completedAt: { gte: since30 }, status: 'completed' },
        _count: { _all: true },
      }),
      prisma.miniGameSession.groupBy({
        by: ['gameType'],
        where: { completedAt: { gte: since30 }, status: 'completed', rewardPoints: { gt: 0 } },
        _count: { _all: true },
        _sum: { rewardPoints: true },
      }),
    ]);

    const ovMap = new Map(overrides.map((o) => [o.gameType, o]));
    const todayMap = new Map(playedToday.map((g) => [g.gameType, g._count._all]));
    const m30Map = new Map(played30.map((g) => [g.gameType, g._count._all]));
    const rewardMap = new Map(rewarded30.map((g) => [g.gameType, { count: g._count._all, points: g._sum.rewardPoints ?? 0 }]));

    const games = MINI_GAMES.map((def) => {
      const ov = ovMap.get(def.gameType);
      const num = (o: number | null | undefined, d: number) => (o != null && o >= 0 ? o : d);
      const str = (o: string | null | undefined, d: string) => (o != null && o.trim().length > 0 ? o : d);
      const rw = rewardMap.get(def.gameType);
      return {
        gameType: def.gameType,
        // Registry varsayılanları (admin "sıfırla" referansı)
        defaults: {
          title: def.title,
          description: def.description,
          emoji: def.emoji,
          accent: def.accent,
          maxScore: def.maxScore,
          rewardThreshold: def.rewardThreshold,
          rewardPoints: def.rewardPoints,
          rewardXp: def.rewardXp,
          minDurationSec: def.minDurationSec,
        },
        // Ham override (null = varsayılan kullan) — form bunu düzenler
        override: ov
          ? {
              enabled: ov.enabled,
              title: ov.title,
              description: ov.description,
              emoji: ov.emoji,
              accent: ov.accent,
              maxScore: ov.maxScore,
              rewardThreshold: ov.rewardThreshold,
              rewardPoints: ov.rewardPoints,
              rewardXp: ov.rewardXp,
              minDurationSec: ov.minDurationSec,
            }
          : null,
        // Etkin (effective) değerler — gerçekte uygulanan
        effective: {
          enabled: ov?.enabled ?? true,
          title: str(ov?.title, def.title),
          description: str(ov?.description, def.description),
          emoji: str(ov?.emoji, def.emoji),
          accent: str(ov?.accent, def.accent),
          maxScore: num(ov?.maxScore, def.maxScore),
          rewardThreshold: num(ov?.rewardThreshold, def.rewardThreshold),
          rewardPoints: num(ov?.rewardPoints, def.rewardPoints),
          rewardXp: num(ov?.rewardXp, def.rewardXp),
          minDurationSec: num(ov?.minDurationSec, def.minDurationSec),
        },
        stats: {
          playedToday: todayMap.get(def.gameType) ?? 0,
          played30d: m30Map.get(def.gameType) ?? 0,
          rewarded30d: rw?.count ?? 0,
          pointsAwarded30d: rw?.points ?? 0,
        },
      };
    });

    return NextResponse.json({ success: true, games }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[ADMIN_GAMES_GET]', error);
    return NextResponse.json(
      { error: 'Oyun ayarları getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

/** null/'' → override'ı kaldır (varsayılana dön). Sayılar 0..1_000_000 arası. */
const intOverride = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.number().int().min(0).max(1_000_000).nullable()
);
const strOverride = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(400).nullable()
);

const patchSchema = z.object({
  gameType: z.string().min(1),
  enabled: z.boolean().optional(),
  title: strOverride.optional(),
  description: strOverride.optional(),
  emoji: strOverride.optional(),
  accent: strOverride.optional(),
  maxScore: intOverride.optional(),
  rewardThreshold: intOverride.optional(),
  rewardPoints: intOverride.optional(),
  rewardXp: intOverride.optional(),
  minDurationSec: intOverride.optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const rl = checkAdminRateLimit(auth.session.user.id);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Çok fazla istek' },
        { status: 429, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { gameType, ...fields } = parsed.data;

    // Yalnızca registry'de tanımlı oyunlar yönetilebilir (rastgele satır engellenir).
    const def = getMiniGame(gameType);
    if (!def) {
      return NextResponse.json(
        { error: 'Oyun bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Tutarlılık: eşik, maxScore'u aşamaz (effective değerlere göre kontrol et).
    const effThreshold = fields.rewardThreshold ?? null;
    const effMax = fields.maxScore ?? null;
    const resolvedMax = effMax ?? def.maxScore;
    const resolvedThreshold = effThreshold ?? def.rewardThreshold;
    if (resolvedThreshold > resolvedMax) {
      return NextResponse.json(
        { error: `Ödül eşiği (${resolvedThreshold}) maksimum skoru (${resolvedMax}) aşamaz.` },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Sadece gönderilen alanları yaz (undefined = dokunma). enabled default true.
    const data: Record<string, unknown> = {};
    for (const k of ['enabled', 'title', 'description', 'emoji', 'accent', 'maxScore', 'rewardThreshold', 'rewardPoints', 'rewardXp', 'minDurationSec'] as const) {
      if (fields[k] !== undefined) data[k] = fields[k];
    }

    const saved = await prisma.miniGameConfig.upsert({
      where: { gameType },
      update: data,
      create: { gameType, ...data },
    });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.user.id,
        action: 'minigame_config_update',
        entity: 'MiniGameConfig',
        entityId: gameType,
        newData: data as object,
        ...getAuditRequestMeta(request),
      },
    });

    // Effective-config cache'ini bayatlat → değişiklik hemen yürürlüğe girer.
    revalidateTag(MINIGAME_CONFIG_TAG, 'max');

    return NextResponse.json({ success: true, config: saved }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[ADMIN_GAMES_PATCH]', error);
    return NextResponse.json(
      { error: 'Oyun ayarı kaydedilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
