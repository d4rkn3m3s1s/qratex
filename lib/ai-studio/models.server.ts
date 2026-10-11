/**
 * Modeller: görev sınıfı başına model seçimi (Settings `ai.model-routing`, katalog denetimli) +
 * son 7 gün gerçek kullanım (AIUsageLog). Seçim çalışma zamanında lib/ai-studio/model-routing
 * üzerinden lib/ai-engine ve lib/ai-learning'e uygulanır (en geç 60 sn).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import type { AuditActor } from '@/lib/data-safety/audit';
import { versionFromDate, writeVersionedSetting } from '@/lib/settings-version';
import { getVolumeModelEnvDefault } from '@/lib/ai-engine';
import { LEARNING_MODEL, SYSTEM_LEARNING_MODEL } from '@/lib/ai-learning';
import {
  MODEL_CATALOG,
  MODEL_SLOTS,
  isAllowedModel,
  modelRoutingSchema,
  type ModelSlot,
  type ModelSlotState,
  type ModelsState,
  type ModelUsageRow,
} from './contract';
import { MODEL_ROUTING_KEY, currentAiProvider, parseModelRouting, setAiModelRoutingCache } from './model-routing';
import { auditData, mapVersionConflict, type RequestLike } from './shared.server';
import type { z } from 'zod';

function envDefault(slot: ModelSlot): string {
  if (slot === 'volume') return getVolumeModelEnvDefault();
  if (slot === 'dealerLearning') return LEARNING_MODEL;
  return SYSTEM_LEARNING_MODEL;
}

function hasEnvOverride(slot: ModelSlot): boolean {
  if (slot === 'volume') return !!process.env.AI_MODEL;
  if (slot === 'dealerLearning') return !!(process.env.AI_LEARNING_MODEL || process.env.OPENAI_LEARNING_MODEL);
  return !!(process.env.AI_SYSTEM_LEARNING_MODEL || process.env.AI_LEARNING_MODEL || process.env.OPENAI_LEARNING_MODEL);
}

export function slotStates(routing: ReturnType<typeof parseModelRouting>, provider = currentAiProvider()): ModelSlotState[] {
  return MODEL_SLOTS.map((slot) => {
    const override = routing[slot] ?? null;
    const valid = !!override && isAllowedModel(provider, override);
    const env = provider === 'none' ? null : envDefault(slot);
    return {
      slot,
      override,
      overrideIgnored: !!override && !valid,
      envDefault: env,
      effective: provider === 'none' ? null : valid ? override : env,
      source: provider === 'none' ? 'none' : valid ? 'override' : hasEnvOverride(slot) ? 'env' : 'default',
    };
  });
}

/** Model etiketi "groq/llama…" ya da düz "llama…" olabilir → sağlayıcı öneki atılır. */
export function normalizeModelLabel(model: string): string {
  return model.replace(/^(groq|openai|none)\//, '');
}

export async function getModelsState(): Promise<ModelsState> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [row, groups, failures] = await Promise.all([
    prisma.settings.findUnique({ where: { key: MODEL_ROUTING_KEY }, select: { value: true, updatedAt: true } }),
    prisma.aIUsageLog.groupBy({
      by: ['model'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
      _avg: { latencyMs: true },
    }),
    prisma.aIUsageLog.groupBy({ by: ['model'], where: { createdAt: { gte: since }, success: false }, _count: { _all: true } }),
  ]);
  const failMap = new Map<string, number>();
  for (const f of failures) {
    const k = normalizeModelLabel(f.model);
    failMap.set(k, (failMap.get(k) ?? 0) + f._count._all);
  }
  const merged = new Map<string, ModelUsageRow>();
  for (const g of groups) {
    const model = normalizeModelLabel(g.model);
    const e = merged.get(model) ?? { model, calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: null };
    const prevCalls = e.calls;
    e.calls += g._count._all;
    e.inputTokens += g._sum.inputTokens ?? 0;
    e.outputTokens += g._sum.outputTokens ?? 0;
    const lat = g._avg.latencyMs;
    if (lat != null) e.avgLatencyMs = e.avgLatencyMs == null ? Math.round(lat) : Math.round((e.avgLatencyMs * prevCalls + lat * g._count._all) / Math.max(1, e.calls));
    merged.set(model, e);
  }
  for (const e of merged.values()) e.failures = Math.min(failMap.get(e.model) ?? 0, e.calls);

  const provider = currentAiProvider();
  return {
    provider,
    slots: slotStates(parseModelRouting(row?.value ?? null), provider),
    catalog: provider === 'none' ? [] : MODEL_CATALOG[provider],
    usage7d: Array.from(merged.values()).sort((a, b) => b.calls - a.calls),
    version: versionFromDate(row?.updatedAt),
  };
}

export async function updateModelRouting(input: z.output<typeof modelRoutingSchema>, actor: AuditActor, request?: RequestLike): Promise<ModelsState> {
  const provider = currentAiProvider();
  if (provider === 'none') throw new ApiError('SERVICE_UNAVAILABLE', 'AI sağlayıcısı yapılandırılmamış; model seçilemez.', { status: 503 });
  for (const slot of MODEL_SLOTS) {
    const v = input.routing[slot];
    if (typeof v === 'string' && v && !isAllowedModel(provider, v)) {
      throw new ApiError('VALIDATION', 'Bu model etkin sağlayıcının kataloğunda yok.', { details: [{ path: `routing.${slot}`, message: 'Katalog dışı model' }] });
    }
  }
  let nextRouting = {};
  await mapVersionConflict(() =>
    prisma.$transaction(async (tx) => {
      const res = await writeVersionedSetting(tx, {
        key: MODEL_ROUTING_KEY,
        category: 'ai',
        baseVersion: input.baseVersion,
        value: (prev) => {
          const cur = parseModelRouting(prev);
          for (const slot of MODEL_SLOTS) {
            const v = input.routing[slot];
            if (v === undefined) continue;
            if (v === null || v === '') delete cur[slot];
            else cur[slot] = v;
          }
          nextRouting = cur;
          return cur as Prisma.InputJsonValue;
        },
      });
      await tx.auditLog.create({
        data: auditData(actor, { action: 'AI_MODEL_ROUTING_UPDATE', entity: 'AIModelRouting', entityId: res.id, oldData: res.previous, newData: { routing: res.value, reason: input.reason } }, request),
      });
    })
  );
  setAiModelRoutingCache(nextRouting);
  return getModelsState();
}
