/**
 * Kampanya merkezi — ortak sunucu yardımcıları: modül/menü kapısı, sahiplik, DTO, hata.
 *
 * Kapı: `defineRoute({ module })` rol vermeden çağırır; kampanya modülünün kapsamı `dealer`
 * olduğu için orada yalnız GLOBAL kapatma yakalanır. Denetim (Bulgu 6) bayi ROLÜ için kapatma
 * ve menü gizleme de dahil BÜTÜN uçlarda aynı kapıyı istiyor → her uç `assertCampaignsAvailable`.
 */
import type { Campaign } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';
import { getPlaybookById } from '@/lib/growth-playbooks';
import { normalizeSegment, normalizeStatus } from '../domain';
import type { CampaignDto } from '../types';

export const CAMPAIGNS_ROUTE_KEY = '/dealer/campaigns';

type HeaderSource = { headers: { get(name: string): string | null } };

/** Kampanyalar bu bayi için açık mı? Kapalıysa `ApiError('MODULE_DISABLED')` fırlatır. */
export async function assertCampaignsAvailable(opts: { userId: string; request?: HeaderSource }): Promise<void> {
  const menu = await assertMenuItemVisible('campaigns', 'dealer', {
    userId: opts.userId,
    request: opts.request,
    routeKey: CAMPAIGNS_ROUTE_KEY,
  });
  if (menu) throw new ApiError('MODULE_DISABLED', 'Kampanyalar yönetici tarafından geçici olarak gizlendi.');
  const mod = await assertModuleEnabled('campaigns', {
    role: 'dealer',
    userId: opts.userId,
    request: opts.request,
    routeKey: CAMPAIGNS_ROUTE_KEY,
  });
  if (mod) throw new ApiError('MODULE_DISABLED');
}

/** Sayfa (sunucu bileşeni) için: fırlatmadan durum döner. */
export async function campaignsAvailable(userId: string): Promise<boolean> {
  try {
    await assertCampaignsAvailable({ userId });
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'MODULE_DISABLED') return false;
    throw err;
  }
}

/** Yalnız bu bayinin kampanyası; yabancı ya da olmayan kayıt → 404 (varlık sızdırılmaz). */
export async function loadOwnedCampaign(dealerId: string, id: string): Promise<Campaign> {
  const c = await prisma.campaign.findFirst({ where: { id, dealerId } });
  if (!c) throw new ApiError('NOT_FOUND', 'Kampanya bulunamadı.');
  return c;
}

export function toCampaignDto(c: Campaign): CampaignDto {
  return {
    id: c.id,
    title: c.title,
    message: c.message,
    segment: normalizeSegment(c.targetSegment),
    status: normalizeStatus(c.status),
    sentAt: c.sentAt ? c.sentAt.toISOString() : null,
    sentCount: c.sentCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    fromPlaybook: Boolean(c.playbookSourceId),
    playbookTitle: c.playbookSourceId ? (getPlaybookById(c.playbookSourceId)?.title ?? null) : null,
  };
}

/** Kampanya alan hataları (kodlu). Uçlar bunu `ApiError`'a çevirir. */
export type CampaignErrorCode =
  | 'NOT_SENDABLE'
  | 'NOT_EDITABLE'
  | 'NOT_DELETABLE'
  | 'SEGMENT_INVALID'
  | 'CHANNEL_UNSUPPORTED'
  | 'NO_RECIPIENTS'
  | 'STATE_CHANGED'
  | 'SCHEDULE_INVALID';

const STATUS_OF: Record<CampaignErrorCode, number> = {
  NOT_SENDABLE: 409,
  NOT_EDITABLE: 409,
  NOT_DELETABLE: 409,
  SEGMENT_INVALID: 400,
  CHANNEL_UNSUPPORTED: 400,
  NO_RECIPIENTS: 409,
  STATE_CHANGED: 409,
  SCHEDULE_INVALID: 400,
};

export class CampaignError extends Error {
  readonly code: CampaignErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: CampaignErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CampaignError';
    this.code = code;
    this.details = details;
  }
}

/** Alan hatasını zarf v2 hatasına çevirir; diğerlerini olduğu gibi fırlatır. */
export function rethrowCampaignError(err: unknown): never {
  if (err instanceof CampaignError) {
    throw new ApiError(err.code, err.message, { status: STATUS_OF[err.code], details: err.details });
  }
  throw err;
}

/** Bir dizi kimliği parçalara böler (büyük `IN` listeleri için). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
