import 'server-only';

/**
 * Tasarım Sistemi → Temalar: sunucu mantığı.
 *
 *  - Tek yazma yolu: üç tema satırı (`activeTheme`, `customColors`, `defaultMode`) TEK transaction'da,
 *    iyimser kilitle (satır başına `updatedAt` koşullu güncelleme; uyuşmazlık → 409) ve TEK denetim
 *    kaydıyla yazılır (Bulgu 4). Denetim kaydı TAM önce/sonra anlık görüntüsü taşır → geçmiş ve
 *    tek tıkla geri alma doğru çalışır (Bulgu 5); genel `/admin/settings` geri alma listesine
 *    karışmaz (entity `ThemeSettings`).
 *  - Önbellek: `revalidateTag(..., { expire: 0 })` → kayıttan sonraki ilk okuma eski satırı almaz
 *    (Bulgu 2). Yanıt yeni satırları döndürür; istemci sağlayıcıyı ikinci okuma yapmadan günceller.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { revalidatePublicThemeSettings } from '@/lib/revalidate-public-theme';
import { THEME_SETTINGS_CATEGORY, THEME_SETTINGS_KEYS, type ThemeSettingRow } from '@/lib/theme-settings-keys';
import { readValidSeasonalCache, resolveSeasonalConcept, ACTIVE_SEASONAL_CONCEPT_KEY } from '@/lib/seasonal-concept-core';
import {
  findFamily,
  isValidActiveTheme,
  snapshotFromRows,
  type ThemeDraft,
  type ThemeSnapshot,
  type PublishThemeInput,
} from './theme-model';

export const THEME_AUDIT_ENTITY = 'ThemeSettings';
export const THEME_AUDIT_ACTIONS = { publish: 'theme.publish', rollback: 'theme.rollback' } as const;

const KEYS = [THEME_SETTINGS_KEYS.activeTheme, THEME_SETTINGS_KEYS.customColors, THEME_SETTINGS_KEYS.defaultMode] as const;

export type ActionCtx = {
  actor: { id: string; email?: string | null; role?: string | null; name?: string | null };
  request?: { headers: { get(name: string): string | null } } | null;
};

export type ThemeActor = { name: string | null };

export type ThemeOverview = {
  snapshot: ThemeSnapshot;
  /** Saklı değer seçilebilir bir tema mı (eski `'light'`/`''` → false). */
  valid: boolean;
  version: string | null;
  lastPublished: { at: string; actor: string | null } | null;
  seasonal: { name: string; themePresetId: string | null; familyName: string | null; endDate: string } | null;
  /** Mevsimsel konsept okunamadıysa true (bant "bilinmiyor" der, sessizce yok saymaz). */
  seasonalUnknown: boolean;
};

export type ThemeHistoryItem = {
  id: string;
  at: string;
  action: 'publish' | 'rollback';
  actor: string | null;
  note: string | null;
  before: ThemeSnapshot | null;
  after: ThemeSnapshot | null;
};

type Row = { key: string; value: Prisma.JsonValue; updatedAt: Date };

/** Satırların sürümü: en yeni `updatedAt` (ISO). Hiç satır yoksa null. */
export function versionOf(rows: ReadonlyArray<Pick<Row, 'updatedAt'>>): string | null {
  if (!rows.length) return null;
  return new Date(Math.max(...rows.map((r) => r.updatedAt.getTime()))).toISOString();
}

async function readRows(client: Pick<typeof prisma, 'settings'> = prisma): Promise<Row[]> {
  return client.settings.findMany({
    where: { key: { in: [...KEYS] } },
    select: { key: true, value: true, updatedAt: true },
  });
}

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function actorName(r: { actorSnapshot: Prisma.JsonValue; user: { name: string | null; email: string | null } | null }): string | null {
  const s = asObj(r.actorSnapshot);
  return r.user?.name || r.user?.email || (typeof s.name === 'string' && s.name) || (typeof s.email === 'string' && s.email) || null;
}

function snapshotFromAudit(v: unknown): ThemeSnapshot | null {
  const o = asObj(v);
  if (!('activeTheme' in o) && !('customColors' in o) && !('defaultMode' in o)) return null;
  return snapshotFromRows(KEYS.map((k) => ({ key: k, value: o[k] })));
}

async function readSeasonal(): Promise<{ seasonal: ThemeOverview['seasonal']; unknown: boolean }> {
  try {
    const now = new Date();
    const row = await prisma.settings.findUnique({ where: { key: ACTIVE_SEASONAL_CONCEPT_KEY }, select: { value: true } });
    const cached = readValidSeasonalCache(row?.value, now);
    const concept = cached ? cached.concept : (await resolveSeasonalConcept(now)).concept;
    if (!concept || !concept.themePresetId) return { seasonal: null, unknown: false };
    const family = findFamily(concept.themePresetId.replace(/Light$/, ''));
    return {
      seasonal: { name: concept.name, themePresetId: concept.themePresetId, familyName: family?.name ?? null, endDate: concept.endDate },
      unknown: false,
    };
  } catch {
    return { seasonal: null, unknown: true };
  }
}

export async function getThemeOverview(): Promise<ThemeOverview> {
  const [rows, last, seasonal] = await Promise.all([
    readRows(),
    prisma.auditLog.findFirst({
      where: { entity: THEME_AUDIT_ENTITY },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, actorSnapshot: true, user: { select: { name: true, email: true } } },
    }),
    readSeasonal(),
  ]);
  const snapshot = snapshotFromRows(rows);
  return {
    snapshot,
    valid: isValidActiveTheme(snapshot),
    version: versionOf(rows),
    lastPublished: last ? { at: last.createdAt.toISOString(), actor: actorName(last) } : null,
    seasonal: seasonal.seasonal,
    seasonalUnknown: seasonal.unknown,
  };
}

export async function listThemeHistory(q: { page: number; size: number }): Promise<{ items: ThemeHistoryItem[]; total: number; page: number; size: number }> {
  const where = { entity: THEME_AUDIT_ENTITY };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.size,
      take: q.size,
      select: {
        id: true,
        action: true,
        createdAt: true,
        oldData: true,
        newData: true,
        actorSnapshot: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    total,
    page: q.page,
    size: q.size,
    items: rows.map((r) => {
      const nd = asObj(r.newData);
      return {
        id: r.id,
        at: r.createdAt.toISOString(),
        action: r.action === THEME_AUDIT_ACTIONS.rollback ? 'rollback' : 'publish',
        actor: actorName(r),
        note: typeof nd.note === 'string' && nd.note ? nd.note : null,
        before: snapshotFromAudit(r.oldData),
        after: snapshotFromAudit(nd.snapshot ?? r.newData),
      };
    }),
  };
}

function reqMeta(ctx: ActionCtx) {
  const h = ctx.request?.headers;
  const fwd = h?.get('x-forwarded-for')?.split(',')[0]?.trim() || h?.get('x-real-ip') || null;
  return { ipAddress: fwd, userAgent: h?.get('user-agent')?.slice(0, 300) ?? null };
}

function valuesFor(draft: ThemeDraft): Record<(typeof KEYS)[number], Prisma.InputJsonValue | null> {
  return {
    activeTheme: draft.activeTheme,
    // Preset seçiliyken de son özel renkler korunur (özel sekmeye dönünce kaybolmasın).
    customColors: (draft.customColors ?? null) as Prisma.InputJsonValue | null,
    defaultMode: draft.defaultMode,
  };
}

const CONFLICT_MSG = 'Tema bu arada başka bir yönetici tarafından değiştirildi. Güncel hâli yükleyip tekrar deneyin.';

async function writeDraft(
  ctx: ActionCtx,
  draft: ThemeDraft,
  baseVersion: string | null,
  audit: { action: string; note?: string | null; rollbackOf?: string }
): Promise<{ entries: ThemeSettingRow[]; version: string | null; snapshot: ThemeSnapshot }> {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await readRows(tx);
    if (versionOf(rows) !== baseVersion) throw new ApiError('CONFLICT', CONFLICT_MSG);
    const before = snapshotFromRows(rows);
    const intended: ThemeSnapshot = {
      activeTheme: draft.activeTheme,
      customColors: draft.customColors ?? before.customColors,
      defaultMode: draft.defaultMode,
    };
    if (JSON.stringify(intended) === JSON.stringify(before)) {
      throw new ApiError('BAD_REQUEST', 'Değişiklik yok: bu tema zaten yayında.');
    }
    const values = valuesFor(draft);

    for (const key of KEYS) {
      const value = values[key];
      const existing = rows.find((r) => r.key === key);
      if (value === null) {
        // customColors hiç ayarlanmadıysa satır oluşturulmaz; varsa korunur (silme yok).
        continue;
      }
      if (existing) {
        const res = await tx.settings.updateMany({
          where: { key, updatedAt: existing.updatedAt },
          data: { value, category: THEME_SETTINGS_CATEGORY },
        });
        if (res.count !== 1) throw new ApiError('CONFLICT', CONFLICT_MSG);
      } else {
        await tx.settings.create({ data: { key, value, category: THEME_SETTINGS_CATEGORY } });
      }
    }

    const after = await readRows(tx);
    const snapshot = snapshotFromRows(after);
    await tx.auditLog.create({
      data: {
        userId: ctx.actor.id,
        actorType: 'user',
        actorSnapshot: { email: ctx.actor.email ?? null, role: ctx.actor.role ?? null, name: ctx.actor.name ?? null },
        action: audit.action,
        entity: THEME_AUDIT_ENTITY,
        entityId: 'theme',
        oldData: before as unknown as Prisma.InputJsonValue,
        newData: {
          snapshot,
          note: audit.note ?? null,
          ...(audit.rollbackOf ? { rollbackOf: audit.rollbackOf } : {}),
        } as unknown as Prisma.InputJsonValue,
        ...reqMeta(ctx),
      },
    });
    return { after, snapshot };
  });

  revalidatePublicThemeSettings();
  return {
    entries: result.after.map((r) => ({ key: r.key, value: r.value })),
    version: versionOf(result.after),
    snapshot: result.snapshot,
  };
}

export async function publishTheme(ctx: ActionCtx, input: PublishThemeInput) {
  return writeDraft(ctx, input.draft, input.baseVersion, { action: THEME_AUDIT_ACTIONS.publish, note: input.note ?? null });
}

/** Bir geçmiş kaydının ÖNCEKİ hâline döner (o yayından önceki tema). */
export async function rollbackTheme(ctx: ActionCtx, input: { auditId: string; baseVersion: string | null }) {
  const row = await prisma.auditLog.findUnique({
    where: { id: input.auditId },
    select: { id: true, entity: true, oldData: true },
  });
  if (!row || row.entity !== THEME_AUDIT_ENTITY) throw new ApiError('NOT_FOUND', 'Geçmiş kaydı bulunamadı.');
  const before = snapshotFromAudit(row.oldData);
  if (!before || !isValidActiveTheme(before)) {
    throw new ApiError('BAD_REQUEST', 'Bu kayıttan önceki tema geçerli bir seçim değil (eski/boş değer); geri alınamaz.');
  }
  const draft: ThemeDraft = {
    activeTheme: before.activeTheme as string,
    customColors: before.customColors,
    defaultMode: before.defaultMode,
  };
  return writeDraft(ctx, draft, input.baseVersion, {
    action: THEME_AUDIT_ACTIONS.rollback,
    note: 'Geçmişten geri alındı',
    rollbackOf: row.id,
  });
}
