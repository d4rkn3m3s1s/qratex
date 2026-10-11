/**
 * Üsluplar: otomatik yanıt kurallarının (`AutoReplyRule.tone`) AI üslup kataloğu.
 *
 * - Yerleşik 4 aile (kodda) + DB kayıtları birleşik listelenir (`source: builtin|override|custom`).
 * - Bayi seçicisi YALNIZ aktif DB kayıtlarını görür (lib/dealer-automation `assertTone`); bu yüzden
 *   yerleşik bir aile "etkinleştir" ile DB kaydına dönüşmeden bayiye sunulmaz — ekranda dürüstçe söylenir.
 * - Anahtar (slug) oluşturulduktan sonra DEĞİŞMEZ (kurallar slug'a bağlı, FK yok).
 * - Silme yok: arşiv (isActive=false) + kullanım etkisi; her yazım denetimli (önce/sonra tam metin → geri yükleme).
 * - İyimser kilit: `expectedVersion` (= updatedAt sürümü) → 409.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import type { AuditActor } from '@/lib/data-safety/audit';
import { versionFromDate } from '@/lib/settings-version';
import { buildAutoReplySystemPrompt, isAIConfigured, runChatCompletion } from '@/lib/ai-engine';
import { wrapUntrusted } from '@/lib/ai-prompt-safety';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import {
  BUILTIN_TONES,
  type ToneHistoryEntry,
  type ToneRow,
  type TonePreviewResult,
  type TonesState,
  toneCreateSchema,
  tonePreviewSchema,
  toneStatusSchema,
  toneUpdateSchema,
} from './contract';
import { actorFromSnapshot, auditData, conflictError, iso, type RequestLike } from './shared.server';
import type { z } from 'zod';

type ToneDb = { id: string; slug: string; name: string; systemPrompt: string; isActive: boolean; updatedAt: Date };

export function mergeTones(
  rows: ToneDb[],
  usage: Map<string, { rules: number; activeRules: number; dealers: number }>
): ToneRow[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const zero = { rules: 0, activeRules: 0, dealers: 0 };
  const out: ToneRow[] = BUILTIN_TONES.map((b) => {
    const r = bySlug.get(b.slug);
    return {
      id: r?.id ?? null,
      slug: b.slug,
      name: r?.name ?? b.name,
      systemPrompt: r?.systemPrompt ?? null,
      isActive: r ? r.isActive : false,
      source: r ? 'override' : 'builtin',
      descriptor: b.descriptor,
      usage: usage.get(b.slug) ?? zero,
      updatedAt: iso(r?.updatedAt),
      version: r ? versionFromDate(r.updatedAt) : null,
    };
  });
  for (const r of rows) {
    if (BUILTIN_TONES.some((b) => b.slug === r.slug)) continue;
    out.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      systemPrompt: r.systemPrompt,
      isActive: r.isActive,
      source: 'custom',
      descriptor: null,
      usage: usage.get(r.slug) ?? zero,
      updatedAt: iso(r.updatedAt),
      version: versionFromDate(r.updatedAt),
    });
  }
  return out;
}

async function toneUsage(): Promise<Map<string, { rules: number; activeRules: number; dealers: number }>> {
  const groups = await prisma.autoReplyRule.groupBy({
    by: ['tone', 'dealerId', 'isActive'],
    where: { tone: { not: null }, action: 'reply' },
    _count: { _all: true },
  });
  const map = new Map<string, { rules: number; activeRules: number; dealers: Set<string> }>();
  for (const g of groups) {
    if (!g.tone) continue;
    const e = map.get(g.tone) ?? { rules: 0, activeRules: 0, dealers: new Set<string>() };
    e.rules += g._count._all;
    if (g.isActive) e.activeRules += g._count._all;
    e.dealers.add(g.dealerId);
    map.set(g.tone, e);
  }
  return new Map(Array.from(map.entries()).map(([k, v]) => [k, { rules: v.rules, activeRules: v.activeRules, dealers: v.dealers.size }]));
}

export async function getTonesState(): Promise<TonesState> {
  const [rows, usage] = await Promise.all([
    prisma.aITone.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, slug: true, name: true, systemPrompt: true, isActive: true, updatedAt: true } }),
    toneUsage(),
  ]);
  const tones = mergeTones(rows, usage);
  const activeSlugs = new Set(rows.filter((r) => r.isActive).map((r) => r.slug));
  const orphanSlugs = Array.from(usage.entries())
    .filter(([slug]) => !activeSlugs.has(slug))
    .map(([slug, u]) => ({ slug, rules: u.rules }));
  return { tones, orphanSlugs };
}

function snapshot(r: { name: string; systemPrompt: string; isActive: boolean }) {
  return { name: r.name, systemPrompt: r.systemPrompt, isActive: r.isActive };
}

export async function createTone(input: z.output<typeof toneCreateSchema>, actor: AuditActor, request?: RequestLike): Promise<TonesState> {
  const existing = await prisma.aITone.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (existing) throw new ApiError('CONFLICT', 'Bu anahtarla bir üslup zaten var.', { details: [{ path: 'slug', message: 'Bu anahtar kullanılıyor' }] });
  await prisma.$transaction(async (tx) => {
    const row = await tx.aITone.create({ data: { slug: input.slug, name: input.name, systemPrompt: input.systemPrompt, isActive: true } });
    await tx.auditLog.create({
      data: auditData(actor, { action: 'AI_TONE_CREATE', entity: 'AITone', entityId: row.id, newData: { slug: row.slug, ...snapshot(row), reason: input.reason } }, request),
    });
  });
  return getTonesState();
}

export async function updateTone(id: string, input: z.output<typeof toneUpdateSchema>, actor: AuditActor, request?: RequestLike): Promise<TonesState> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.aITone.findUnique({ where: { id } });
    if (!current) throw new ApiError('NOT_FOUND', 'Üslup bulunamadı.');
    if (versionFromDate(current.updatedAt) !== input.expectedVersion) throw conflictError(versionFromDate(current.updatedAt));
    const data: Prisma.AIToneUpdateInput = {};
    if (input.name !== undefined && input.name !== current.name) data.name = input.name;
    if (input.systemPrompt !== undefined && input.systemPrompt !== current.systemPrompt) data.systemPrompt = input.systemPrompt;
    if (Object.keys(data).length === 0) return;
    const res = await tx.aITone.updateMany({ where: { id, updatedAt: current.updatedAt }, data: data as Prisma.AIToneUpdateManyMutationInput });
    if (res.count === 0) throw conflictError(versionFromDate(current.updatedAt));
    const after = { ...snapshot(current), ...(data as { name?: string; systemPrompt?: string }) };
    await tx.auditLog.create({
      data: auditData(actor, { action: 'AI_TONE_UPDATE', entity: 'AITone', entityId: id, oldData: { slug: current.slug, ...snapshot(current) }, newData: { slug: current.slug, ...after, reason: input.reason } }, request),
    });
  });
  return getTonesState();
}

export async function setToneActive(id: string, input: z.output<typeof toneStatusSchema>, actor: AuditActor, request?: RequestLike): Promise<TonesState> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.aITone.findUnique({ where: { id } });
    if (!current) throw new ApiError('NOT_FOUND', 'Üslup bulunamadı.');
    if (versionFromDate(current.updatedAt) !== input.expectedVersion) throw conflictError(versionFromDate(current.updatedAt));
    if (current.isActive === input.active) return;
    const res = await tx.aITone.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { isActive: input.active } });
    if (res.count === 0) throw conflictError(versionFromDate(current.updatedAt));
    await tx.auditLog.create({
      data: auditData(
        actor,
        { action: input.active ? 'AI_TONE_RESTORE' : 'AI_TONE_ARCHIVE', entity: 'AITone', entityId: id, oldData: { slug: current.slug, isActive: current.isActive }, newData: { slug: current.slug, isActive: input.active, reason: input.reason } },
        request
      ),
    });
  });
  return getTonesState();
}

function pickTone(v: unknown): ToneHistoryEntry['before'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out: NonNullable<ToneHistoryEntry['before']> = {};
  if (typeof o.name === 'string') out.name = o.name;
  if (typeof o.systemPrompt === 'string') out.systemPrompt = o.systemPrompt;
  if (typeof o.isActive === 'boolean') out.isActive = o.isActive;
  return out;
}

export async function getToneHistory(id: string): Promise<ToneHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: 'AITone', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, createdAt: true, userId: true, actorSnapshot: true, oldData: true, newData: true, user: { select: { name: true, email: true } } },
  });
  return rows.map((r) => {
    const nd = (r.newData && typeof r.newData === 'object' ? r.newData : {}) as Record<string, unknown>;
    return {
      id: r.id,
      action: r.action,
      at: r.createdAt.toISOString(),
      actor: actorFromSnapshot(r.userId, r.actorSnapshot, r.user),
      reason: typeof nd.reason === 'string' ? nd.reason : null,
      before: pickTone(r.oldData),
      after: pickTone(r.newData),
    };
  });
}

/**
 * Önizleme: kaydetmeden, taslak üslup talimatıyla GERÇEK otomatik yanıt sistem mesajı derlenir ve
 * mevcut geçitten (runChatCompletion → limit + günlük tavan + kullanım kaydı) model çağrılır.
 * Sağlayıcı yoksa yanıt üretilmez (sahte metin yok), derlenen sistem mesajı yine gösterilir.
 */
export async function previewTone(input: z.output<typeof tonePreviewSchema>, actorKey: string): Promise<TonePreviewResult> {
  const systemPrompt = buildAutoReplySystemPrompt(input.slug, input.systemPrompt);
  if (!isAIConfigured()) return { reply: null, systemPrompt, model: null, reason: 'unconfigured' };
  const user = `Müşteri Puanı: ${input.rating}/5\nMüşteri Yorumu:\n${wrapUntrusted('musteri_yorumu', input.text, 1_500)}\n\nBu geri bildirime uygun bir yanıt üret.`;
  try {
    const res = await runChatCompletion({ system: systemPrompt, user, temperature: 0.7, maxTokens: 300, task: 'auto_reply', actorKey: `ai-studio:${actorKey}` });
    if (!res) return { reply: null, systemPrompt, model: null, reason: 'blocked' };
    return { reply: res.content.trim() || null, systemPrompt, model: res.modelUsed, reason: null };
  } catch (err) {
    if (isAiGuardError(err)) throw new ApiError('RATE_LIMITED', err.message, { status: 429, retryable: true });
    throw new ApiError('SERVICE_UNAVAILABLE', 'AI sağlayıcısı yanıt vermedi; tekrar deneyin.', { status: 503, retryable: true });
  }
}
