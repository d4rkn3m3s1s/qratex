/**
 * Kademeli açılış (FeatureFlag) — sunucu mantığı (/admin/features "Kademeli açılış").
 *
 * Kapatılan rapor bulguları (admin_features.md):
 *  1  bayrağın tüketicisi yok → bayrak = katalog modülünün açılış kuralı; modül kapısı okur
 *  2  onaysız kalıcı silme → silme yok; yetim kayıt gerekçeyle ARŞİVLENİR (metadata.archivedAt)
 *  3  açık doğan bayrak → yeni kural yalnız açıkça "etkin" seçilirse etkin
 *  6  mutasyon + denetim aynı işlemde; iyimser kilit (updatedAt) → 409
 *  7  kontrol-sonra-yaz yarışı → upsert + P2002 → 409 (defineRoute)
 *  9  süre sonu, sahip, not arayüzde; süre çalışma zamanında karşılaştırılır (cron'a bağlı değil)
 */
import type { Prisma } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { MODULE_CATALOG, MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import { isRuleLive, parseRolloutMeta } from './rollout';
import { ROLLOUT_CACHE_TAG } from './rollout.server';
import { actorSnapshot, bindingsFor, enforcementOf, type ActionCtx } from './modules.server';
import type { OrphanFlag, RolloutRow, RolloutsState, UpsertRolloutInput } from './contract';

const CATALOG = new Map(MODULE_CATALOG.map((m) => [m.key, m]));

function reqMeta(ctx: ActionCtx) {
  const h = ctx.request?.headers;
  return {
    ipAddress: h?.get('x-forwarded-for')?.split(',')[0]?.trim() || h?.get('x-real-ip') || null,
    userAgent: h?.get('user-agent')?.slice(0, 300) ?? null,
  };
}

export async function getRolloutsState(): Promise<RolloutsState> {
  const [flags, controlsRow] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 }),
    prisma.settings.findUnique({ where: { key: MODULE_CONTROLS_SETTINGS_KEY }, select: { value: true } }),
  ]);
  const controls = normalizeModuleControls(controlsRow?.value);
  const ownerIds = [...new Set(flags.map((f) => f.ownerId).filter((x): x is string => !!x))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name || o.email || o.id]));
  const now = new Date();

  const rollouts: RolloutRow[] = [];
  const orphans: OrphanFlag[] = [];
  for (const f of flags) {
    const meta = parseRolloutMeta(f.metadata);
    const mod = CATALOG.get(f.key);
    if (mod && meta.kind === 'module_rollout' && !meta.archivedAt) {
      rollouts.push({
        id: f.id,
        key: f.key,
        label: mod.label,
        scope: mod.scope,
        active: f.isEnabled,
        percent: meta.percent,
        allowUserIds: meta.allowUserIds,
        expiresAt: f.expiresAt ? f.expiresAt.toISOString() : null,
        expired: f.isEnabled && !isRuleLive({ active: true, expiresAt: f.expiresAt }, now),
        note: meta.note,
        owner: f.ownerId ? (ownerName.get(f.ownerId) ?? null) : null,
        updatedAt: f.updatedAt.toISOString(),
        moduleEnabled: controls[f.key] !== false,
        enforcement: enforcementOf(bindingsFor(f.key)),
      });
    } else {
      orphans.push({
        id: f.id,
        key: f.key,
        name: f.name,
        description: f.description,
        isEnabled: f.isEnabled,
        updatedAt: f.updatedAt.toISOString(),
        archivedAt: meta.archivedAt,
      });
    }
  }

  const taken = new Set(rollouts.map((r) => r.key));
  const candidates = MODULE_CATALOG.filter((m) => !taken.has(m.key))
    .map((m) => ({ key: m.key, label: m.label, scope: m.scope, enforcement: enforcementOf(bindingsFor(m.key)) }))
    // Yalnız kullanıcı başına kapı uygulanan (API/sayfa) modüller kademeli açılabilir.
    .filter((c) => c.enforcement === 'api' || c.enforcement === 'page');

  return { rollouts, orphans, killSwitchOn: controls.feature_flags !== false, candidates };
}

export async function upsertRollout(ctx: ActionCtx, key: string, input: UpsertRolloutInput): Promise<RolloutRow['id']> {
  const mod = CATALOG.get(key);
  if (!mod) throw new ApiError('NOT_FOUND', 'Kademeli açılış yalnız katalogdaki modüller için tanımlanabilir.');
  const enforcement = enforcementOf(bindingsFor(key));
  if (enforcement !== 'api' && enforcement !== 'page') {
    throw new ApiError('CONFLICT', 'Bu modülde kullanıcı başına kapı yok (yalnız menü ya da etkisiz); kademeli açılış uygulanamaz.', { status: 409 });
  }
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
    throw new ApiError('VALIDATION', 'Bitiş tarihi gelecekte olmalı.', { details: [{ path: 'expiresAt', message: 'past' }] });
  }
  const allow = [...new Set(input.allowUserIds)];
  if (allow.length) {
    const found = await prisma.user.count({ where: { id: { in: allow } } });
    if (found !== allow.length) {
      throw new ApiError('VALIDATION', 'Allowlist’teki bazı kullanıcı kimlikleri bulunamadı.', { details: [{ path: 'allowUserIds', message: 'unknown_user' }] });
    }
  }

  const id = await prisma.$transaction(async (tx) => {
    const existing = await tx.featureFlag.findUnique({ where: { key } });
    const metadata = { kind: 'module_rollout', percent: input.percent, allowUserIds: allow, note: input.note ?? null } as Prisma.InputJsonValue;
    let flagId: string;
    let action: string;
    if (existing) {
      const meta = parseRolloutMeta(existing.metadata);
      if (meta.kind !== 'module_rollout' && !meta.archivedAt) {
        throw new ApiError('CONFLICT', 'Bu anahtarda eski (yetim) bir bayrak kaydı var. Önce arşivleyin.');
      }
      // Arşivli eski kayıt (aynı anahtar) yeni kural olarak devralınır: istemci "yeni" gönderir (null).
      const expectedBase = meta.kind === 'module_rollout' ? existing.updatedAt.toISOString() : null;
      if (input.baseUpdatedAt !== expectedBase) {
        throw new ApiError('CONFLICT', 'Kural bu arada değişti. Yenileyip tekrar deneyin.');
      }
      const res = await tx.featureFlag.updateMany({
        where: { id: existing.id, updatedAt: existing.updatedAt },
        data: {
          isEnabled: input.active,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          metadata,
          name: mod.label,
          description: `Kademeli açılış: ${mod.label}`,
          ownerId: ctx.actor.id,
        },
      });
      if (res.count === 0) throw new ApiError('CONFLICT', 'Kural bu arada değişti. Yenileyip tekrar deneyin.');
      flagId = existing.id;
      action = input.active ? 'rollout.update' : 'rollout.stop';
      await tx.auditLog.create({
        data: {
          userId: ctx.actor.id,
          actorType: 'user',
          actorSnapshot: actorSnapshot(ctx),
          action,
          entity: 'FeatureFlag',
          entityId: key,
          oldData: { key, active: existing.isEnabled, percent: meta.percent, allowCount: meta.allowUserIds.length, expiresAt: existing.expiresAt?.toISOString() ?? null } as Prisma.InputJsonValue,
          newData: { key, active: input.active, percent: input.percent, allowCount: allow.length, expiresAt: input.expiresAt, reason: input.reason } as Prisma.InputJsonValue,
          ...reqMeta(ctx),
        },
      });
    } else {
      if (input.baseUpdatedAt !== null) throw new ApiError('CONFLICT', 'Kural bu arada silinmiş ya da değişmiş. Yenileyin.');
      const created = await tx.featureFlag.create({
        data: {
          key,
          name: mod.label,
          description: `Kademeli açılış: ${mod.label}`,
          isEnabled: input.active,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          ownerId: ctx.actor.id,
          metadata,
        },
        select: { id: true },
      });
      flagId = created.id;
      action = 'rollout.create';
      await tx.auditLog.create({
        data: {
          userId: ctx.actor.id,
          actorType: 'user',
          actorSnapshot: actorSnapshot(ctx),
          action,
          entity: 'FeatureFlag',
          entityId: key,
          newData: { key, active: input.active, percent: input.percent, allowCount: allow.length, expiresAt: input.expiresAt, reason: input.reason } as Prisma.InputJsonValue,
          ...reqMeta(ctx),
        },
      });
    }
    return flagId;
  });

  revalidateTag(ROLLOUT_CACHE_TAG, { expire: 0 });
  return id;
}

/** Yetim (kodda okunmayan) bayrağı arşivler — kalıcı silme yok. */
export async function archiveOrphan(ctx: ActionCtx, id: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const flag = await tx.featureFlag.findUnique({ where: { id } });
    if (!flag) throw new ApiError('NOT_FOUND', 'Bayrak bulunamadı.');
    const meta = parseRolloutMeta(flag.metadata);
    if (meta.archivedAt) throw new ApiError('CONFLICT', 'Bu bayrak zaten arşivli.');
    if (CATALOG.has(flag.key) && meta.kind === 'module_rollout') {
      throw new ApiError('CONFLICT', 'Bu bir kademeli açılış kuralı; arşivlemek yerine durdurun.');
    }
    const base = flag.metadata && typeof flag.metadata === 'object' && !Array.isArray(flag.metadata) ? (flag.metadata as Record<string, unknown>) : {};
    const res = await tx.featureFlag.updateMany({
      where: { id, updatedAt: flag.updatedAt },
      data: { isEnabled: false, metadata: { ...base, archivedAt: new Date().toISOString(), archivedBy: ctx.actor.id } as Prisma.InputJsonValue },
    });
    if (res.count === 0) throw new ApiError('CONFLICT', 'Bayrak bu arada değişti. Yenileyip tekrar deneyin.');
    await tx.auditLog.create({
      data: {
        userId: ctx.actor.id,
        actorType: 'user',
        actorSnapshot: actorSnapshot(ctx),
        action: 'flag.archive',
        entity: 'FeatureFlag',
        entityId: flag.key,
        oldData: { key: flag.key, name: flag.name, isEnabled: flag.isEnabled, description: flag.description } as Prisma.InputJsonValue,
        newData: { key: flag.key, archived: true, reason } as Prisma.InputJsonValue,
        ...reqMeta(ctx),
      },
    });
  });
  revalidateTag(ROLLOUT_CACHE_TAG, { expire: 0 });
}
