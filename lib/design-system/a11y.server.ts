import 'server-only';

/**
 * Tasarım Sistemi → Erişilebilirlik: sunucu mantığı.
 *  - Tercih benimsenmesi: `Settings.user_settings_<id>.preferences` (yüksek kontrast, animasyon
 *    azaltma, renk körü modu, büyük yazı) rol kırılımıyla TEK sorguda sayılır; 10 dk Redis.
 *    Yalnız hesaba kaydedilmiş tercihler görünür (cihazda kalanlar değil) — ekranda açıkça yazılır.
 *  - El ile doğrulama listesi: `Settings.a11y_checklist_v1` JSON; madde başına durum + not,
 *    iyimser kilit (409) ve aynı transaction'da denetim kaydı.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cachedJson } from '@/lib/redis';
import { ApiError } from '@/lib/http/define-route';
import {
  A11Y_CHECKLIST,
  A11Y_CHECKLIST_SETTINGS_KEY,
  readChecklistState,
  type ChecklistState,
  type PatchChecklistInput,
} from './a11y-checklist';
import type { ActionCtx } from './theme.server';

export type PrefRoleRow = {
  role: string;
  users: number;
  saved: number;
  highContrast: number;
  reduceAnimations: number;
  colorblindMode: number;
  largeText: number;
};

export type PrefsSummary = {
  rows: PrefRoleRow[];
  totals: Omit<PrefRoleRow, 'role'>;
  generatedAt: string;
};

type RawPrefRow = {
  role: string;
  saved: number;
  high_contrast: number;
  reduce_animations: number;
  colorblind: number;
  large_text: number;
};

export function buildPrefsSummary(prefRows: RawPrefRow[], userRows: Array<{ role: string; n: number }>, now: Date): PrefsSummary {
  const roles = new Set<string>([...userRows.map((r) => r.role), ...prefRows.map((r) => r.role)]);
  const rows: PrefRoleRow[] = [...roles]
    .map((role) => {
      const p = prefRows.find((r) => r.role === role);
      return {
        role,
        users: Number(userRows.find((r) => r.role === role)?.n ?? 0),
        saved: Number(p?.saved ?? 0),
        highContrast: Number(p?.high_contrast ?? 0),
        reduceAnimations: Number(p?.reduce_animations ?? 0),
        colorblindMode: Number(p?.colorblind ?? 0),
        largeText: Number(p?.large_text ?? 0),
      };
    })
    .sort((a, b) => b.users - a.users);
  const totals = rows.reduce(
    (acc, r) => ({
      users: acc.users + r.users,
      saved: acc.saved + r.saved,
      highContrast: acc.highContrast + r.highContrast,
      reduceAnimations: acc.reduceAnimations + r.reduceAnimations,
      colorblindMode: acc.colorblindMode + r.colorblindMode,
      largeText: acc.largeText + r.largeText,
    }),
    { users: 0, saved: 0, highContrast: 0, reduceAnimations: 0, colorblindMode: 0, largeText: 0 }
  );
  return { rows, totals, generatedAt: now.toISOString() };
}

async function loadPrefsSummary(): Promise<PrefsSummary> {
  const [prefRows, userRows] = await Promise.all([
    prisma.$queryRaw<RawPrefRow[]>(Prisma.sql`
      SELECT u."role"::text AS role,
        COUNT(*) FILTER (WHERE (s."value"->'preferences') ?| array['highContrast','reduceAnimations','colorblindMode','textScale'])::int AS saved,
        COUNT(*) FILTER (WHERE s."value"->'preferences'->>'highContrast' = 'true')::int AS high_contrast,
        COUNT(*) FILTER (WHERE s."value"->'preferences'->>'reduceAnimations' = 'true')::int AS reduce_animations,
        COUNT(*) FILTER (WHERE s."value"->'preferences'->>'colorblindMode' = 'true')::int AS colorblind,
        COUNT(*) FILTER (WHERE s."value"->'preferences'->>'textScale' IN ('lg','xl'))::int AS large_text
      FROM "Settings" s
      JOIN "User" u ON s."key" = 'user_settings_' || u."id"
      WHERE s."key" LIKE 'user\\_settings\\_%'
      GROUP BY u."role"
    `),
    prisma.$queryRaw<Array<{ role: string; n: number }>>(Prisma.sql`SELECT "role"::text AS role, COUNT(*)::int AS n FROM "User" GROUP BY "role"`),
  ]);
  return buildPrefsSummary(prefRows, userRows, new Date());
}

/** Hata YUKARI fırlar (ekran "veri yok" değil hata gösterir). */
export async function getPrefsSummary(): Promise<PrefsSummary> {
  return cachedJson('admin:design-system:a11y-prefs:v1', 600, loadPrefsSummary);
}

export type ChecklistData = { state: ChecklistState; version: string | null };

export async function getChecklist(): Promise<ChecklistData> {
  const row = await prisma.settings.findUnique({ where: { key: A11Y_CHECKLIST_SETTINGS_KEY }, select: { value: true, updatedAt: true } });
  return { state: readChecklistState(row?.value), version: row ? row.updatedAt.toISOString() : null };
}

const CONFLICT_MSG = 'Liste bu arada başka bir yönetici tarafından güncellendi. Yenileyip tekrar deneyin.';

export async function patchChecklistItem(ctx: ActionCtx, input: PatchChecklistInput): Promise<ChecklistData> {
  const item = A11Y_CHECKLIST.find((i) => i.id === input.id);
  if (!item) throw new ApiError('NOT_FOUND', 'Kriter bulunamadı.');
  const by = ctx.actor.name || ctx.actor.email || null;

  return prisma.$transaction(async (tx) => {
    const row = await tx.settings.findUnique({ where: { key: A11Y_CHECKLIST_SETTINGS_KEY }, select: { value: true, updatedAt: true } });
    const current = row ? row.updatedAt.toISOString() : null;
    if (current !== input.baseVersion) throw new ApiError('CONFLICT', CONFLICT_MSG);
    const state = readChecklistState(row?.value);
    const before = state[item.id] ?? { status: 'untested', note: null, by: null, at: null };
    const note = input.note ? input.note : null;
    if (before.status === input.status && before.note === note) throw new ApiError('BAD_REQUEST', 'Değişiklik yok.');
    const next: ChecklistState = { ...state, [item.id]: { status: input.status, note, by, at: new Date().toISOString() } };

    let updatedAt: Date;
    if (row) {
      const res = await tx.settings.updateMany({
        where: { key: A11Y_CHECKLIST_SETTINGS_KEY, updatedAt: row.updatedAt },
        data: { value: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count !== 1) throw new ApiError('CONFLICT', CONFLICT_MSG);
      updatedAt = (await tx.settings.findUniqueOrThrow({ where: { key: A11Y_CHECKLIST_SETTINGS_KEY }, select: { updatedAt: true } })).updatedAt;
    } else {
      updatedAt = (
        await tx.settings.create({
          data: { key: A11Y_CHECKLIST_SETTINGS_KEY, category: 'design-system', value: next as unknown as Prisma.InputJsonValue },
          select: { updatedAt: true },
        })
      ).updatedAt;
    }
    await tx.auditLog.create({
      data: {
        userId: ctx.actor.id,
        actorType: 'user',
        actorSnapshot: { email: ctx.actor.email ?? null, role: ctx.actor.role ?? null, name: ctx.actor.name ?? null },
        action: 'a11y.checklist.update',
        entity: 'A11yChecklist',
        entityId: item.id,
        oldData: { status: before.status, note: before.note } as Prisma.InputJsonValue,
        newData: { status: input.status, note, sc: item.sc } as Prisma.InputJsonValue,
      },
    });
    return { state: next, version: updatedAt.toISOString() };
  });
}
