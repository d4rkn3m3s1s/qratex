/**
 * Bayiler: bayi başına AI politikası (tek kaynak `AISettings`, okuyucu lib/ai-policy) + adaptif öğrenme profili.
 *
 * - Liste User(role=DEALER) tabanlı: ayar satırı olmayan bayi de görünür ("varsayılan"), sunucu sayfalı + aranır.
 * - Yalnız GERÇEKTEN tüketilen anahtarlar yönetilir (ana anahtar, otomatik analiz, 3 uyarı, haftalık özet,
 *   işletme bağlamı). Hiçbir kodun okumadığı 9 "modül" ve aylık rapor anahtarı sunulmaz.
 * - Admin yazımı: bayinin kendi yazım yoluyla aynı kilit + sürüm (409) + alan bazlı yazım; denetim satırı
 *   ADMIN aktörüyle ve gerekçeyle; politika önbelleği hemen bayatlatılır.
 * - Profil yenileme LLM'i mevcut geçitten çağırır (lib/ai-learning `updateAdaptiveProfile`); sunucu veri eşiği uygulanır.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import type { AuditActor } from '@/lib/data-safety/audit';
import { detectPromptInjection } from '@/lib/prompt-injection';
import { invalidateDealerAiPolicy } from '@/lib/ai-policy';
import { NO_VERSION, lockResource, nextUpdatedAt, versionFromDate } from '@/lib/settings-version';
import { AI_DEFAULTS, AI_SETTINGS_SELECT, toAiView } from '@/lib/dealer-settings/load.server';
import { getLearningRetrainSuggestion, updateAdaptiveProfile } from '@/lib/ai-learning';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import {
  DEALER_PROFILE_MIN_FEEDBACK,
  POLICY_FIELDS,
  type DealerDetail,
  type DealerListPage,
  type DealerListQuery,
  type DealerPolicyPatch,
  type DealerProfileView,
} from './contract';
import { auditData, conflictError, iso, type RequestLike } from './shared.server';

const DEFAULT_SIZE = 20;

export function dealerWhere(q: DealerListQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: 'DEALER' };
  const and: Prisma.UserWhereInput[] = [];
  if (q.q) {
    and.push({
      OR: [
        { businessName: { contains: q.q, mode: 'insensitive' } },
        { name: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
      ],
    });
  }
  switch (q.filter) {
    case 'ai_off':
      and.push({ aiSettings: { is: { isEnabled: false } } });
      break;
    case 'auto_off':
      and.push({ aiSettings: { is: { autoAnalyze: false } } });
      break;
    case 'custom_prompt':
      and.push({ aiSettings: { is: { customPrompt: { not: null } } } });
      break;
    case 'with_profile':
      and.push({ aiLearningProfile: { isNot: null } });
      break;
    case 'no_profile':
      and.push({ aiLearningProfile: { is: null } });
      break;
    default:
      break;
  }
  if (and.length) where.AND = and;
  return where;
}

export async function listDealers(q: DealerListQuery): Promise<DealerListPage> {
  const size = q.size ?? DEFAULT_SIZE;
  const page = q.page ?? 1;
  const where = dealerWhere(q);
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ businessName: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * size,
      take: size,
      select: {
        id: true,
        name: true,
        businessName: true,
        email: true,
        aiSettings: { select: { isEnabled: true, autoAnalyze: true, customPrompt: true } },
        aiLearningProfile: { select: { version: true, status: true, lastTrainedAt: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    size,
    items: users.map((u) => ({
      id: u.id,
      name: u.businessName || u.name || u.email || 'Adsız bayi',
      email: u.email ?? null,
      policy: {
        isEnabled: u.aiSettings?.isEnabled ?? true,
        autoAnalyze: u.aiSettings?.autoAnalyze ?? true,
        isDefault: !u.aiSettings,
        hasCustomPrompt: !!u.aiSettings?.customPrompt,
      },
      profile: u.aiLearningProfile
        ? { version: u.aiLearningProfile.version, status: u.aiLearningProfile.status, lastTrainedAt: iso(u.aiLearningProfile.lastTrainedAt) }
        : null,
    })),
  };
}

function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, max);
}

/** Ham JSON profil → yapılandırılmış görünüm (bilinmeyen alan düşer). */
export function toProfileView(row: {
  version: number;
  status: string;
  lastTrainedAt: Date | null;
  trainingFeedbackCount: number;
  correctionsUsed: number;
  profile: unknown;
}): DealerProfileView {
  const p = (row.profile && typeof row.profile === 'object' ? row.profile : {}) as Record<string, unknown>;
  const bc = (p.businessContext && typeof p.businessContext === 'object' ? p.businessContext : {}) as Record<string, unknown>;
  const g = (p.responseGuidelines && typeof p.responseGuidelines === 'object' ? p.responseGuidelines : {}) as Record<string, unknown>;
  const objs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
  return {
    version: row.version,
    status: row.status,
    lastTrainedAt: iso(row.lastTrainedAt),
    trainingFeedbackCount: row.trainingFeedbackCount,
    correctionsUsed: row.correctionsUsed,
    businessContext: { sector: typeof bc.sector === 'string' ? bc.sector : null, keyTerms: strList(bc.keyTerms, 20) },
    themes: objs(p.learnedThemes)
      .filter((t) => typeof t.theme === 'string')
      .slice(0, 12)
      .map((t) => ({ theme: String(t.theme), priority: typeof t.priority === 'string' ? t.priority : 'medium', note: typeof t.note === 'string' ? t.note : null })),
    entities: objs(p.entityAliases)
      .filter((e) => typeof e.alias === 'string' && typeof e.canonical === 'string')
      .slice(0, 20)
      .map((e) => ({ alias: String(e.alias), canonical: String(e.canonical), type: typeof e.type === 'string' ? e.type : 'other' })),
    risks: objs(p.riskSignals)
      .filter((r) => typeof r.pattern === 'string')
      .slice(0, 10)
      .map((r) => ({ pattern: String(r.pattern), action: typeof r.action === 'string' ? r.action : '' })),
    guidelines: { do: strList(g.do, 10), avoid: strList(g.avoid, 10) },
  };
}

function jsonText(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.slice(0, 200);
  try {
    return JSON.stringify(v).slice(0, 200);
  } catch {
    return '—';
  }
}

export async function getDealerDetail(id: string): Promise<DealerDetail> {
  const user = await prisma.user.findFirst({
    where: { id, role: 'DEALER' },
    select: {
      id: true,
      name: true,
      businessName: true,
      email: true,
      aiSettings: { select: AI_SETTINGS_SELECT },
      aiLearningProfile: { select: { version: true, status: true, lastTrainedAt: true, trainingFeedbackCount: true, correctionsUsed: true, profile: true } },
    },
  });
  if (!user) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [retrain, corrections, usage, failures, feedbackWithText] = await Promise.all([
    getLearningRetrainSuggestion(id),
    prisma.aIFeedbackCorrection.findMany({ where: { dealerId: id }, orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, field: true, oldValue: true, newValue: true, note: true, createdAt: true } }),
    prisma.aIUsageLog.aggregate({ where: { dealerId: id, createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.aIUsageLog.count({ where: { dealerId: id, createdAt: { gte: since }, success: false } }),
    prisma.feedback.count({ where: { deletedAt: null, qrCode: { dealerId: id }, text: { not: null } } }),
  ]);
  return {
    id: user.id,
    name: user.businessName || user.name || user.email || 'Adsız bayi',
    email: user.email ?? null,
    policy: toAiView(user.aiSettings ?? null),
    profile: user.aiLearningProfile ? toProfileView(user.aiLearningProfile) : null,
    retrain,
    corrections: corrections.map((c) => ({ id: c.id, field: c.field, oldValue: jsonText(c.oldValue), newValue: jsonText(c.newValue), note: c.note ?? null, at: c.createdAt.toISOString() })),
    usage7d: { calls: usage._count._all, failures, tokens: (usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0) },
    minFeedbackForProfile: DEALER_PROFILE_MIN_FEEDBACK,
    feedbackWithText,
  };
}

/** Değişen alanlar (yalnız gönderilen ve farklı olanlar). */
export function policyChanges(before: Record<string, unknown>, patch: DealerPolicyPatch): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of POLICY_FIELDS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (JSON.stringify(value ?? null) !== JSON.stringify(before[key] ?? null)) data[key] = value;
  }
  return data;
}

export async function updateDealerPolicy(id: string, patch: DealerPolicyPatch, actor: AuditActor, request?: RequestLike): Promise<DealerDetail> {
  if (typeof patch.customPrompt === 'string' && detectPromptInjection(patch.customPrompt)) {
    throw new ApiError('VALIDATION', 'İşletme bağlamında izin verilmeyen bir ifade var (komut/HTML benzeri).', {
      details: [{ path: 'customPrompt', message: 'Yalnız işletmeyi anlatan düz metin yazın; talimat, kod ya da bağlantı eklemeyin.' }],
    });
  }
  const dealer = await prisma.user.findFirst({ where: { id, role: 'DEALER' }, select: { id: true } });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');

  await prisma.$transaction(async (tx) => {
    await lockResource(tx, `ai-settings:${id}`);
    const current = await tx.aISettings.findUnique({ where: { dealerId: id }, select: AI_SETTINGS_SELECT });
    const currentVersion = current ? versionFromDate(current.updatedAt) : NO_VERSION;
    if (currentVersion !== patch.baseVersion) throw conflictError(currentVersion);
    const before = (current ?? { ...AI_DEFAULTS }) as Record<string, unknown>;
    const data = policyChanges(before, patch);
    const changed = Object.keys(data);
    if (changed.length === 0) return;
    if (current) {
      await tx.aISettings.update({ where: { dealerId: id }, data: { ...data, updatedAt: nextUpdatedAt(current.updatedAt) } });
    } else {
      await tx.aISettings.create({ data: { dealerId: id, analysisLanguage: 'tr', ...AI_DEFAULTS, ...data } });
    }
    const oldData: Record<string, unknown> = {};
    const newData: Record<string, unknown> = { reason: patch.reason, byAdmin: true };
    for (const k of changed) {
      // Serbest metnin kendisi değil uzunluğu denetime yazılır (bayi ayarı yoluyla aynı ilke).
      oldData[k] = k === 'customPrompt' ? ((before[k] as string | null)?.length ?? 0) : before[k];
      newData[k] = k === 'customPrompt' ? ((data[k] as string | null)?.length ?? 0) : data[k];
    }
    await tx.auditLog.create({ data: auditData(actor, { action: 'ADMIN_UPDATE_AI_SETTINGS', entity: 'AISettings', entityId: id, oldData, newData }, request) });
  });
  invalidateDealerAiPolicy(id);
  return getDealerDetail(id);
}

export async function refreshDealerProfile(id: string, actor: AuditActor, request?: RequestLike): Promise<DealerDetail> {
  const dealer = await prisma.user.findFirst({ where: { id, role: 'DEALER' }, select: { id: true } });
  if (!dealer) throw new ApiError('NOT_FOUND', 'Bayi bulunamadı.');
  const feedbackWithText = await prisma.feedback.count({ where: { deletedAt: null, qrCode: { dealerId: id }, text: { not: null } } });
  if (feedbackWithText < DEALER_PROFILE_MIN_FEEDBACK) {
    throw new ApiError('INSUFFICIENT_DATA', `Profil için en az ${DEALER_PROFILE_MIN_FEEDBACK} metinli geri bildirim gerekir (şu an ${feedbackWithText}).`, { status: 422 });
  }
  const before = await prisma.aIDealerLearningProfile.findUnique({ where: { dealerId: id }, select: { version: true } });
  try {
    const row = await updateAdaptiveProfile(id);
    await prisma.auditLog.create({
      data: auditData(actor, { action: 'AI_DEALER_PROFILE_REFRESH', entity: 'AIDealerLearningProfile', entityId: id, oldData: { version: before?.version ?? null }, newData: { version: row.version } }, request),
    });
  } catch (err) {
    if (isAiGuardError(err)) throw new ApiError('RATE_LIMITED', err.message, { status: 429, retryable: true });
    throw new ApiError('SERVICE_UNAVAILABLE', 'Profil yenilenemedi: AI sağlayıcısı yanıt vermedi.', { status: 503, retryable: true });
  }
  return getDealerDetail(id);
}
