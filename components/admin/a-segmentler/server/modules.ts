/**
 * İnovasyon modül yapılandırması (`Settings.innovationPlatform`) — eski /admin/innovation'dan
 * kalan GERÇEKTEN uygulanan ayarlar: 8 modül anahtarı, davet limitleri, partner özet webhook'u.
 *
 * Düzeltilenler (rapor Bulgu 4/5/10): şemasız PUT → bölüm bazlı katı zod; iyimser kilit
 * (`Settings.updatedAt`); her değişiklik önce/sonra farkıyla AuditLog'a; webhook gizli değeri
 * ASLA dönmez (yalnız var mı + son 4), sunucuda üretilip bir kez gösterilir; webhook adresi
 * yalnız herkese açık https. A/B deney yapılandırması (`campaignAb`) burada gösterilmez,
 * dokunulmadan korunur (Özellik ve Deney Kontrolü alanına taşınıyor).
 */
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import {
  INNOVATION_PLATFORM_SETTINGS_KEY,
  getInnovationPlatformConfig,
  type InnovationPlatformConfig,
} from '@/lib/innovation-config';
import { MODULE_FEATURE_KEYS, diffFlags, isPublicHttpsUrl, maskSecret, type ModuleFeatureKey, type ModulesState } from '../domain';

export interface ModulesActor {
  id: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function toState(cfg: InnovationPlatformConfig, version: Date | null): ModulesState {
  const features = Object.fromEntries(
    MODULE_FEATURE_KEYS.map((k) => [k, cfg.features?.[k] !== false])
  ) as Record<ModuleFeatureKey, boolean>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    version: version ? version.toISOString() : null,
    features,
    referral: {
      maxInvitesPerReferrerLifetime: num(cfg.referral?.maxInvitesPerReferrerLifetime, 100),
      maxRedemptionsPerReferralCodePerMonth: num(cfg.referral?.maxRedemptionsPerReferralCodePerMonth, 30),
    },
    partnerDigest: {
      enabled: cfg.partnerDigest?.webhookEnabled === true,
      url: typeof cfg.partnerDigest?.webhookUrl === 'string' ? cfg.partnerDigest.webhookUrl : '',
      ...maskSecret(cfg.partnerDigest?.webhookSecret),
    },
  };
}

async function readRaw(): Promise<{ cfg: InnovationPlatformConfig; version: Date | null }> {
  const [cfg, row] = await Promise.all([
    getInnovationPlatformConfig(),
    prisma.settings.findUnique({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } }),
  ]);
  return { cfg, version: row?.updatedAt ?? null };
}

export async function getModules(): Promise<ModulesState> {
  const { cfg, version } = await readRaw();
  return toState(cfg, version);
}

/** Eski /api/admin/innovation/config GET'i için: gizli değer maskelenmiş tam yapılandırma. */
export async function getMaskedConfig(): Promise<Omit<InnovationPlatformConfig, 'partnerDigest'> & { partnerDigest: { webhookUrl: string; webhookEnabled: boolean; hasSecret: boolean; secretLast4: string | null } }> {
  const cfg = await getInnovationPlatformConfig();
  return {
    ...cfg,
    partnerDigest: {
      webhookUrl: cfg.partnerDigest?.webhookUrl ?? '',
      webhookEnabled: cfg.partnerDigest?.webhookEnabled === true,
      ...maskSecret(cfg.partnerDigest?.webhookSecret),
    },
  };
}

export type ModulesPatch =
  | { section: 'features'; features: Partial<Record<ModuleFeatureKey, boolean>> }
  | { section: 'referral'; referral: { maxInvitesPerReferrerLifetime: number; maxRedemptionsPerReferralCodePerMonth: number } }
  | { section: 'partnerDigest'; partnerDigest: { enabled: boolean; url: string } };

/**
 * Yapılandırmayı iyimser kilitle yazar. `expectedVersion` gelen sürümle uyuşmazsa 409.
 * `mutate` yalnız ilgili bölümü değiştirir; diğer bölümler (A/B dahil) olduğu gibi kalır.
 */
async function writeConfig(
  expectedVersion: string | null,
  actor: ModulesActor,
  action: string,
  mutate: (cfg: InnovationPlatformConfig) => { next: InnovationPlatformConfig; oldData: unknown; newData: unknown }
): Promise<{ cfg: InnovationPlatformConfig; version: Date }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.settings.findUnique({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } });
    const current = row?.updatedAt ? row.updatedAt.toISOString() : null;
    if (current !== expectedVersion) {
      throw new ApiError('CONFLICT', 'Ayarlar bu arada başka bir yönetici tarafından değiştirildi. Güncel hâli yüklendi; değişikliğinizi yeniden yapın.', { messageEn: 'Another admin changed the settings meanwhile. The latest state is loaded; make your change again.' });
    }
    const cfg = await getInnovationPlatformConfig();
    const { next, oldData, newData } = mutate(cfg);
    let saved: { updatedAt: Date };
    if (row) {
      const res = await tx.settings.updateMany({
        where: { key: INNOVATION_PLATFORM_SETTINGS_KEY, updatedAt: row.updatedAt },
        data: { value: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 0) throw new ApiError('CONFLICT', 'Ayarlar bu arada değişti. Lütfen yeniden deneyin.', { messageEn: 'The settings changed meanwhile. Please try again.' });
      saved = await tx.settings.findUniqueOrThrow({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } });
    } else {
      saved = await tx.settings.create({
        data: { key: INNOVATION_PLATFORM_SETTINGS_KEY, category: 'admin', value: next as unknown as Prisma.InputJsonValue },
        select: { updatedAt: true },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        actorType: 'user',
        actorSnapshot: { role: actor.role } as Prisma.InputJsonValue,
        action,
        entity: 'InnovationPlatformConfig',
        entityId: INNOVATION_PLATFORM_SETTINGS_KEY,
        oldData: oldData as Prisma.InputJsonValue,
        newData: newData as Prisma.InputJsonValue,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
    });
    return { cfg: next, version: saved.updatedAt };
  });
}

export async function patchModules(patch: ModulesPatch, expectedVersion: string | null, actor: ModulesActor): Promise<ModulesState> {
  if (patch.section === 'partnerDigest') {
    const url = patch.partnerDigest.url.trim();
    if (url && !isPublicHttpsUrl(url)) {
      throw new ApiError('VALIDATION', 'Webhook adresi herkese açık bir https adresi olmalı (iç ağ / localhost kabul edilmez).', {
        messageEn: 'The webhook URL must be a public https address (internal network / localhost isn’t accepted).',
        details: [{ path: 'partnerDigest.url', message: 'public_https' }],
      });
    }
    if (patch.partnerDigest.enabled && !url) {
      throw new ApiError('VALIDATION', 'Webhook’u açmak için önce adres girin.', { messageEn: 'Enter a URL before turning the webhook on.', details: [{ path: 'partnerDigest.url', message: 'required' }] });
    }
  }

  const { cfg, version } = await writeConfig(expectedVersion, actor, `innovation_config.${patch.section}`, (cur) => {
    if (patch.section === 'features') {
      const before = Object.fromEntries(MODULE_FEATURE_KEYS.map((k) => [k, cur.features?.[k] !== false])) as Record<string, boolean>;
      const after = { ...before };
      for (const k of MODULE_FEATURE_KEYS) if (typeof patch.features[k] === 'boolean') after[k] = patch.features[k] as boolean;
      const changes = diffFlags(before, after);
      if (!changes.length) throw new ApiError('BAD_REQUEST', 'Değişiklik yok.', { messageEn: 'No changes.' });
      return {
        next: { ...cur, features: { ...cur.features, ...after } as InnovationPlatformConfig['features'] },
        oldData: { features: Object.fromEntries(changes.map((c) => [c.key, c.from])) },
        newData: { features: Object.fromEntries(changes.map((c) => [c.key, c.to])) },
      };
    }
    if (patch.section === 'referral') {
      return {
        next: { ...cur, referral: { ...patch.referral } },
        oldData: { referral: cur.referral },
        newData: { referral: patch.referral },
      };
    }
    const prev = cur.partnerDigest ?? {};
    return {
      next: { ...cur, partnerDigest: { ...prev, webhookUrl: patch.partnerDigest.url.trim(), webhookEnabled: patch.partnerDigest.enabled } },
      oldData: { partnerDigest: { url: prev.webhookUrl ?? '', enabled: prev.webhookEnabled === true } },
      newData: { partnerDigest: { url: patch.partnerDigest.url.trim(), enabled: patch.partnerDigest.enabled } },
    };
  });
  return toState(cfg, version);
}

/** Geçerli sürüm (eski, sürüm göndermeyen istemciler için). */
export async function currentModulesVersion(): Promise<string | null> {
  const row = await prisma.settings.findUnique({ where: { key: INNOVATION_PLATFORM_SETTINGS_KEY }, select: { updatedAt: true } });
  return row?.updatedAt ? row.updatedAt.toISOString() : null;
}

/** A/B deney yapılandırması — yalnız doğrulanmış tam nesne (eski config PUT uyumluluğu; deney arayüzü Özellik ve Deney alanında). */
export async function patchCampaignAb(campaignAb: InnovationPlatformConfig['campaignAb'], expectedVersion: string | null, actor: ModulesActor): Promise<void> {
  await writeConfig(expectedVersion, actor, 'innovation_config.campaign_ab', (cur) => ({
    next: { ...cur, campaignAb },
    oldData: { experiments: (cur.campaignAb?.experiments ?? []).map((e) => ({ id: e.id, active: e.active })), defaultSplitPercentForB: cur.campaignAb?.defaultSplitPercentForB },
    newData: { experiments: campaignAb.experiments.map((e) => ({ id: e.id, active: e.active })), defaultSplitPercentForB: campaignAb.defaultSplitPercentForB },
  }));
}

/** Webhook gizli değerini sunucuda üretir; düz metin YALNIZ bu yanıtta bir kez döner. Denetime değer yazılmaz. */
export async function rotateWebhookSecret(expectedVersion: string | null, actor: ModulesActor): Promise<{ secret: string; state: ModulesState }> {
  const secret = randomBytes(32).toString('hex');
  const { cfg, version } = await writeConfig(expectedVersion, actor, 'innovation_config.partner_secret_rotate', (cur) => ({
    next: { ...cur, partnerDigest: { ...(cur.partnerDigest ?? {}), webhookSecret: secret } },
    oldData: { hadSecret: maskSecret(cur.partnerDigest?.webhookSecret).hasSecret },
    newData: { secretLast4: secret.slice(-4) },
  }));
  return { secret, state: toState(cfg, version) };
}
