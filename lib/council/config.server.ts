/**
 * Konsey ayarları — Settings['agent_council_config']. Yalnız motorun GERÇEKTEN okuduğu
 * parametreler: tur sayısı, açık uzmanlar, veri paketi, kurum talimatı.
 * (Eski "ajan ağırlıkları" hiçbir yerde okunmuyordu; kaldırıldı.)
 * Varsayılan sunucudan; bozuk kayıt varsayılana düşer ve `recovered` ile bildirilir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import { auditEntry, type AuditActor } from '@/lib/data-safety/audit';
import { getAIProviderStatus } from '@/lib/ai-engine';
import {
  COUNCIL_CONFIG_KEY,
  DEFAULT_COUNCIL_CONFIG,
  councilConfigSchema,
  type CouncilConfig,
  type CouncilConfigHistoryItem,
  type CouncilConfigState,
  type CouncilSettingsPayload,
} from '@/lib/council/contract';

export const CONFIG_AUDIT_ACTION = 'agent_council.config.update';

export function readConfigValue(value: unknown): { config: CouncilConfig; recovered: boolean } {
  if (value == null) return { config: DEFAULT_COUNCIL_CONFIG, recovered: false };
  const parsed = councilConfigSchema.safeParse(value);
  return parsed.success ? { config: parsed.data, recovered: false } : { config: DEFAULT_COUNCIL_CONFIG, recovered: true };
}

export async function getCouncilConfigState(): Promise<CouncilConfigState> {
  const row = await prisma.settings.findUnique({ where: { key: COUNCIL_CONFIG_KEY }, select: { value: true, updatedAt: true } });
  const { config, recovered } = readConfigValue(row?.value ?? null);
  return { config, recovered, updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function updateCouncilConfig(
  input: { config: CouncilConfig; expectedUpdatedAt: string | null },
  actor: AuditActor,
  request?: { headers: { get(name: string): string | null } } | null
): Promise<CouncilConfigState> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.settings.findUnique({ where: { key: COUNCIL_CONFIG_KEY }, select: { value: true, updatedAt: true } });
    const current = row?.updatedAt.toISOString() ?? null;
    if (current !== input.expectedUpdatedAt) {
      throw new ApiError('CONFLICT', 'Ayarlar siz düzenlerken başka biri tarafından değiştirildi. Güncel hâli yükleyip tekrar deneyin.', {
        status: 409,
      });
    }
    const before = row ? readConfigValue(row.value).config : null;
    const value = input.config as unknown as Prisma.InputJsonValue;
    const saved = await tx.settings.upsert({
      where: { key: COUNCIL_CONFIG_KEY },
      create: { key: COUNCIL_CONFIG_KEY, value, category: 'ai' },
      update: { value, category: 'ai' },
      select: { updatedAt: true },
    });
    await tx.auditLog.create({
      data: auditEntry(actor, { action: CONFIG_AUDIT_ACTION, entity: 'Settings', entityId: COUNCIL_CONFIG_KEY, oldData: before, newData: input.config }, request),
    });
    return { config: input.config, recovered: false, updatedAt: saved.updatedAt.toISOString() };
  });
}

function snapshotName(v: unknown): string | null {
  if (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string') return (v as { name: string }).name;
  if (v && typeof v === 'object' && typeof (v as { email?: unknown }).email === 'string') return (v as { email: string }).email;
  return null;
}

export async function getCouncilSettings(now = new Date()): Promise<CouncilSettingsPayload> {
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [state, audits, winners, completed90d] = await Promise.all([
    getCouncilConfigState(),
    prisma.auditLog.findMany({
      where: { action: CONFIG_AUDIT_ACTION, entityId: COUNCIL_CONFIG_KEY },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, createdAt: true, actorSnapshot: true, oldData: true, newData: true },
    }),
    prisma.agentRun.groupBy({
      by: ['winnerAgent'],
      where: { createdAt: { gte: since }, winnerAgent: { not: null }, status: { in: ['completed', 'archived'] } },
      _count: { _all: true },
    }),
    prisma.agentRun.count({ where: { createdAt: { gte: since }, status: 'completed' } }),
  ]);
  const history: CouncilConfigHistoryItem[] = audits.map((a) => ({
    id: a.id,
    at: a.createdAt.toISOString(),
    actorName: snapshotName(a.actorSnapshot),
    before: a.oldData == null ? null : readConfigValue(a.oldData).config,
    after: a.newData == null ? null : readConfigValue(a.newData).config,
  }));
  return {
    ...state,
    ai: getAIProviderStatus(),
    history,
    winners: winners
      .filter((w) => w.winnerAgent)
      .map((w) => ({ agent: w.winnerAgent as string, count: w._count._all }))
      .sort((a, b) => b.count - a.count),
    completed90d,
  };
}
