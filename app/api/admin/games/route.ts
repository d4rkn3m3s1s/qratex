import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { checkAdminRateLimit } from '@/lib/rate-limit';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { ALL_GAME_DEFS, getGameDef, visibleMiniGames, type MiniGameDef } from '@/lib/minigame-config';
import {
  MINIGAME_CONFIG_TAG,
  OVERRIDE_LIMITS,
  mergeGameConfig,
  type OverrideRow,
} from '@/lib/minigame-config-effective';
import { gameDayKey } from '@/lib/game-session';
import { featuredGameTypeForWeek, TOURNAMENT_MIN_PARTICIPANTS } from '@/lib/game-tournament';
import { isoWeekKey } from '@/lib/tournament-core';

export const dynamic = 'force-dynamic';

/**
 * Admin mini oyun kontrol paneli API'si.
 * GET    → her oyun (registry + pacman) için: varsayılan + ham override + etkin değerler
 *          (tek birleştirme: `mergeGameConfig`) + deneme hunisi istatistikleri (başlatılan /
 *          kazanılan / kaybedilen / ödüllenen, bugün ve son 30 gün) + portföy (gizli) bilgisi
 *          + haftanın öne çıkan turnuva oyunu.
 * PATCH  → tek bir oyunun override'ını upsert eder. YALNIZ gönderilen alanlar yazılır
 *          (form "kirli" alanları gönderir; `enabled` formdan gönderilmez → admin B2).
 *          Ekonomi sınırları (OVERRIDE_LIMITS), eşik ≤ etkin maks. skor (mevcut override ∪
 *          gelen ∪ varsayılan), Türkçe alan adlı hatalar, iyimser eşzamanlılık
 *          (`expectedUpdatedAt` → 409), audit'te oldData + newData, anında önbellek düşürme.
 * DELETE → `?gameType=` override'ları varsayılana sıfırlar (açık/kapalı durumu korunur).
 */

const DAY = 24 * 60 * 60 * 1000;

const OVERRIDE_FIELDS = [
  'title',
  'description',
  'emoji',
  'accent',
  'maxScore',
  'rewardThreshold',
  'rewardPoints',
  'rewardXp',
  'minDurationSec',
] as const;
type OverrideField = (typeof OVERRIDE_FIELDS)[number];

const FIELD_LABELS: Record<OverrideField | 'enabled' | 'gameType' | 'expectedUpdatedAt', string> = {
  gameType: 'Oyun',
  enabled: 'Aktiflik',
  title: 'Başlık',
  description: 'Açıklama',
  emoji: 'Emoji',
  accent: 'Renk',
  maxScore: 'Maks. skor',
  rewardThreshold: 'Ödül eşiği',
  rewardPoints: 'Ödül puanı',
  rewardXp: 'Ödül XP',
  minDurationSec: 'Min. süre',
  expectedUpdatedAt: 'Sürüm',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

type StatusCounts = { started: number; won: number; lost: number; active: number };
const emptyCounts = (): StatusCounts => ({ started: 0, won: 0, lost: 0, active: 0 });

function addStatus(c: StatusCounts, status: string, n: number) {
  c.started += n;
  if (status === 'completed') c.won += n;
  else if (status === 'failed' || status === 'abandoned') c.lost += n;
  else c.active += n;
}

function toOverrideRow(o: {
  gameType: string;
  enabled: boolean;
  rewardPoints: number | null;
  rewardXp: number | null;
  rewardThreshold: number | null;
  minDurationSec: number | null;
  maxScore: number | null;
  title: string | null;
  description: string | null;
  emoji: string | null;
  accent: string | null;
}): OverrideRow {
  return {
    gameType: o.gameType,
    enabled: o.enabled,
    rewardPoints: o.rewardPoints,
    rewardXp: o.rewardXp,
    rewardThreshold: o.rewardThreshold,
    minDurationSec: o.minDurationSec,
    maxScore: o.maxScore,
    title: o.title,
    description: o.description,
    emoji: o.emoji,
    accent: o.accent,
  };
}

/** Etkin değeri varsayılandan farklı olan alanlar ("özelleştirilmiş" rozeti — admin B7). */
function customizedFields(def: MiniGameDef, ov: OverrideRow | null): OverrideField[] {
  if (!ov) return [];
  const eff = mergeGameConfig(def, ov);
  return OVERRIDE_FIELDS.filter((k) => eff[k] !== def[k]);
}

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const now = new Date();
    const today = gameDayKey(now);
    const since30 = new Date(now.getTime() - 30 * DAY);

    const [overrides, byStatusToday, byStatus30, rewarded30] = await Promise.all([
      prisma.miniGameConfig.findMany(),
      prisma.miniGameSession.groupBy({
        by: ['gameType', 'status'],
        where: { dayKey: today },
        _count: { _all: true },
      }),
      prisma.miniGameSession.groupBy({
        by: ['gameType', 'status'],
        where: { startedAt: { gte: since30 } },
        _count: { _all: true },
      }),
      prisma.miniGameSession.groupBy({
        by: ['gameType'],
        where: { completedAt: { gte: since30 }, rewardPoints: { gt: 0 } },
        _count: { _all: true },
        _sum: { rewardPoints: true },
      }),
    ]);

    const ovMap = new Map(overrides.map((o) => [o.gameType, o]));
    const todayMap = new Map<string, StatusCounts>();
    for (const g of byStatusToday) {
      const c = todayMap.get(g.gameType) ?? emptyCounts();
      addStatus(c, g.status, g._count._all);
      todayMap.set(g.gameType, c);
    }
    const m30Map = new Map<string, StatusCounts>();
    for (const g of byStatus30) {
      const c = m30Map.get(g.gameType) ?? emptyCounts();
      addStatus(c, g.status, g._count._all);
      m30Map.set(g.gameType, c);
    }
    const rewardMap = new Map(
      rewarded30.map((g) => [g.gameType, { count: g._count._all, points: g._sum.rewardPoints ?? 0 }])
    );

    const featuredGameType = featuredGameTypeForWeek(
      isoWeekKey(now),
      visibleMiniGames().map((g) => g.gameType)
    );

    const games = ALL_GAME_DEFS.map((def) => {
      const raw = ovMap.get(def.gameType);
      const ov = raw ? toOverrideRow(raw) : null;
      const eff = mergeGameConfig(def, ov);
      const t = todayMap.get(def.gameType) ?? emptyCounts();
      const m = m30Map.get(def.gameType) ?? emptyCounts();
      const rw = rewardMap.get(def.gameType);
      const finished30 = m.won + m.lost;
      return {
        gameType: def.gameType,
        legacy: def.gameType === 'pacman',
        hidden: !!def.hidden,
        hiddenReason: def.hiddenReason ?? null,
        featured: def.gameType === featuredGameType,
        updatedAt: raw?.updatedAt ? raw.updatedAt.toISOString() : null,
        customizedFields: customizedFields(def, ov),
        // Registry varsayılanları ("sıfırla" referansı)
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
        // Etkin (effective) değerler — sunucunun gerçekte uyguladığı
        effective: {
          enabled: eff.enabled,
          title: eff.title,
          description: eff.description,
          emoji: eff.emoji,
          accent: eff.accent,
          maxScore: eff.maxScore,
          rewardThreshold: eff.rewardThreshold,
          rewardPoints: eff.rewardPoints,
          rewardXp: eff.rewardXp,
          minDurationSec: eff.minDurationSec,
          maxScorePerSec: def.maxScorePerSec ?? null,
          maxDurationSec: eff.maxDurationSec,
        },
        stats: {
          // Geriye uyumlu alanlar: "oynanma" artık başlatılan deneme (kazanılan değil).
          playedToday: t.started,
          played30d: m.started,
          rewarded30d: rw?.count ?? 0,
          pointsAwarded30d: rw?.points ?? 0,
          // Huni (admin B5)
          today: t,
          last30d: m,
          winRate30d: finished30 > 0 ? Math.round((m.won / finished30) * 100) : null,
          rewardRate30d: m.started > 0 ? Math.round(((rw?.count ?? 0) / m.started) * 100) : null,
        },
      };
    });

    return json({
      success: true,
      games,
      limits: OVERRIDE_LIMITS,
      tournament: { featuredGameType, minParticipants: TOURNAMENT_MIN_PARTICIPANTS },
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[ADMIN_GAMES_GET]', error);
    return json({ error: 'Oyun ayarları getirilemedi' }, 500);
  }
}

/** null/'' → override'ı kaldır (varsayılana dön). */
function intOverride(lim: { min: number; max: number }, label: string) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : typeof v === 'string' ? Number(v) : v),
    z
      .number({ invalid_type_error: `${label} bir sayı olmalı.` })
      .int(`${label} tam sayı olmalı.`)
      .min(lim.min, `${label} en az ${lim.min} olabilir.`)
      .max(lim.max, `${label} en fazla ${lim.max.toLocaleString('tr-TR')} olabilir.`)
      .nullable()
  );
}
function strOverride(max: number, label: string) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(max, `${label} en fazla ${max} karakter olabilir.`).nullable()
  );
}

function graphemeCount(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (Seg) return [...new Seg('tr', { granularity: 'grapheme' }).segment(s)].length;
  return [...s].length;
}

const patchSchema = z.object({
  gameType: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  title: strOverride(OVERRIDE_LIMITS.titleMax, 'Başlık').optional(),
  description: strOverride(OVERRIDE_LIMITS.descriptionMax, 'Açıklama').optional(),
  emoji: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z
        .string()
        .trim()
        .max(32)
        .refine((s) => graphemeCount(s) === 1, 'Emoji tek bir simge olmalı.')
        .nullable()
    )
    .optional(),
  accent: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı (ör. #22d3ee).')
        .nullable()
    )
    .optional(),
  maxScore: intOverride(OVERRIDE_LIMITS.maxScore, 'Maks. skor').optional(),
  rewardThreshold: intOverride(OVERRIDE_LIMITS.rewardThreshold, 'Ödül eşiği').optional(),
  rewardPoints: intOverride(OVERRIDE_LIMITS.rewardPoints, 'Ödül puanı').optional(),
  rewardXp: intOverride(OVERRIDE_LIMITS.rewardXp, 'Ödül XP').optional(),
  minDurationSec: intOverride(OVERRIDE_LIMITS.minDurationSec, 'Min. süre').optional(),
  /** İyimser eşzamanlılık: GET'teki updatedAt. Uyuşmazsa 409 (iki admin çakışması). */
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});

function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Geçersiz istek.';
  const key = String(issue.path[0] ?? '') as keyof typeof FIELD_LABELS;
  const label = FIELD_LABELS[key];
  // Özel (Türkçe) mesajlar zaten alan adını içeriyor; varsayılan zod mesajlarını sarmala.
  if (issue.message && /[ğüşıöçĞÜŞİÖÇ]|olmalı|olabilir/.test(issue.message)) return issue.message;
  return label ? `${label}: geçersiz değer.` : 'Geçersiz istek.';
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const rl = checkAdminRateLimit(auth.session.user.id);
    if (!rl.ok) return json({ error: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, 429);

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return json(
        { error: zodMessage(parsed.error), fields: parsed.error.issues.map((i) => String(i.path[0] ?? '')) },
        400
      );
    }
    const { gameType, expectedUpdatedAt, ...fields } = parsed.data;

    // Yalnızca tanımlı oyunlar (registry + pacman) yönetilebilir.
    const def = getGameDef(gameType);
    if (!def) return json({ error: 'Oyun bulunamadı' }, 404);

    const data: Record<string, unknown> = {};
    for (const k of ['enabled', ...OVERRIDE_FIELDS] as const) {
      if (fields[k] !== undefined) data[k] = fields[k];
    }
    if (Object.keys(data).length === 0) return json({ error: 'Değiştirilecek alan yok.' }, 400);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.miniGameConfig.findUnique({ where: { gameType } });

      if (expectedUpdatedAt !== undefined) {
        const current = existing?.updatedAt ? existing.updatedAt.toISOString() : null;
        if (current !== expectedUpdatedAt) return { kind: 'conflict' as const };
      }

      // Tutarlılık: eşik ≤ maks. skor — etkin değerler üzerinden (mevcut override ∪ gelen ∪ varsayılan).
      const pick = (k: 'maxScore' | 'rewardThreshold'): number => {
        if (fields[k] !== undefined) return fields[k] ?? def[k];
        return existing?.[k] ?? def[k];
      };
      const resolvedMax = pick('maxScore');
      const resolvedThreshold = pick('rewardThreshold');
      if (resolvedThreshold > resolvedMax) {
        return { kind: 'invalid' as const, error: `Ödül eşiği (${resolvedThreshold}) maksimum skoru (${resolvedMax}) aşamaz.` };
      }

      // Önceki değerler upsert'ten ÖNCE alınır (neyden → neye; admin B9).
      const oldData = existing
        ? Object.fromEntries(Object.keys(data).map((k) => [k, (existing as Record<string, unknown>)[k] ?? null]))
        : null;

      const saved = await tx.miniGameConfig.upsert({
        where: { gameType },
        update: data,
        create: { gameType, ...data },
      });
      await tx.auditLog.create({
        data: {
          userId: auth.session.user.id,
          action: 'minigame_config_update',
          entity: 'MiniGameConfig',
          entityId: gameType,
          oldData: (oldData ?? undefined) as object | undefined,
          newData: data as object,
          ...getAuditRequestMeta(request),
        },
      });
      return { kind: 'ok' as const, saved };
    });

    if (result.kind === 'conflict') {
      return json(
        { error: 'Bu oyunun ayarları siz düzenlerken değişti. Sayfayı yenileyip tekrar deneyin.', code: 'CONFLICT' },
        409
      );
    }
    if (result.kind === 'invalid') return json({ error: result.error }, 400);

    // Önbelleği ANINDA düşür (stale-while-revalidate değil). Puan basan complete zaten önbelleksiz.
    revalidateTag(MINIGAME_CONFIG_TAG, { expire: 0 });

    return json({
      success: true,
      config: result.saved,
      updatedAt: result.saved.updatedAt ? result.saved.updatedAt.toISOString() : null,
    });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[ADMIN_GAMES_PATCH]', error);
    return json({ error: 'Oyun ayarı kaydedilemedi' }, 500);
  }
}

/** DELETE ?gameType= — tüm override alanlarını varsayılana döndürür; açık/kapalı korunur. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const rl = checkAdminRateLimit(auth.session.user.id);
    if (!rl.ok) return json({ error: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, 429);

    const gameType = new URL(request.url).searchParams.get('gameType') ?? '';
    if (!getGameDef(gameType)) return json({ error: 'Oyun bulunamadı' }, 404);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.miniGameConfig.findUnique({ where: { gameType } });
      if (!existing) return;
      const cleared = Object.fromEntries(OVERRIDE_FIELDS.map((k) => [k, null]));
      if (existing.enabled) {
        await tx.miniGameConfig.delete({ where: { gameType } });
      } else {
        // Kapalı oyunun kill-switch'i sıfırlamayla açılmasın.
        await tx.miniGameConfig.update({ where: { gameType }, data: cleared });
      }
      await tx.auditLog.create({
        data: {
          userId: auth.session.user.id,
          action: 'minigame_config_reset',
          entity: 'MiniGameConfig',
          entityId: gameType,
          oldData: toOverrideRow(existing) as unknown as object,
          newData: { enabled: existing.enabled, ...cleared } as object,
          ...getAuditRequestMeta(request),
        },
      });
    });

    revalidateTag(MINIGAME_CONFIG_TAG, { expire: 0 });
    return json({ success: true });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('[ADMIN_GAMES_DELETE]', error);
    return json({ error: 'Oyun ayarı sıfırlanamadı' }, 500);
  }
}
