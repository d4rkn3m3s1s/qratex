import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { demoSeedGate } from '@/lib/data-safety/demo-guard';
import { actorFromSession, auditEntry } from '@/lib/data-safety/audit';


export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/bootstrap — yönetici kurulum ve DEMO araçları.
 *
 * P0-27: bu uç önceden canlı veriye onaysız, audit'siz ve ortam koruması olmadan yazıyordu:
 *  - `synthesize_ai_signals` GERÇEK feedback'lere sahte AI sinyali + `aiProcessedAt` yazıp
 *    gerçek analiz kuyruğunu kalıcı boşaltıyordu,
 *  - `clear_insights_categories` BÜTÜN bayilerin kategorisini null yapıyordu,
 *  - `seed_suspicious_activities` GERÇEK müşterileri `flagged` işaretliyor, temizleme
 *    0.70–0.72 skorlu gerçek bayrakları da aklayabiliyordu.
 *
 * Şimdi:
 *  - Demo eylemleri üretimde `ALLOW_DEMO_SEED=true` yoksa 403 (lib/data-safety/demo-guard).
 *  - Demo eylemleri YALNIZ `User.isDemo=true` sentetik bayi/müşterilere ve onların
 *    geri bildirimlerine yazar; temizlik yalnız demo izlerini (demo-* kategori, bootstrap
 *    kaynaklı kayıt, bootstrap'in yazdığı 0.71 skoru, incelenmemiş örnek) geri alır.
 *  - `dryRun: true` → hiçbir şey yazmadan etkilenecek kayıt sayıları.
 *  - Her yürütme `AuditLog` (ADMIN_BOOTSTRAP) yazar.
 */

const CONFIG_ACTIONS = ['quests_defaults', 'assign_ab_cohorts', 'ensure_ai_settings', 'seed_achievements'] as const;
const DEMO_ACTIONS = [
  'synthesize_ai_signals',
  'clear_synthetic_ai_signals',
  'seed_insights_categories',
  'seed_suspicious_activities',
  'seed_ai_quality_samples',
  'clear_insights_categories',
  'clear_suspicious_activities',
  'clear_ai_quality_samples',
  'seed_demo_cafes',
] as const;

type ConfigAction = (typeof CONFIG_ACTIONS)[number];
type DemoAction = (typeof DEMO_ACTIONS)[number];
type BootstrapAction = ConfigAction | DemoAction;

function isBootstrapAction(v: string): v is BootstrapAction {
  return (CONFIG_ACTIONS as readonly string[]).includes(v) || (DEMO_ACTIONS as readonly string[]).includes(v);
}
function isDemoAction(v: BootstrapAction): v is DemoAction {
  return (DEMO_ACTIONS as readonly string[]).includes(v);
}

const BOOTSTRAP_TRACKER_KEY = 'admin_bootstrap_tracker_v1';

/** Bootstrap'in sahte "yüksek risk" işaretinde yazdığı TAM skor (temizlik yalnız bunu geri alır). */
const BOOTSTRAP_FRAUD_SCORE = 0.71;
const BOOTSTRAP_AI_MODEL = 'bootstrap-heuristic';
const BOOTSTRAP_SAMPLE_NOTE = '[bootstrap-demo]';

type BootstrapTracker = {
  insightsDealerIds: string[];
  suspiciousIds: string[];
  suspiciousFlaggedUserIds: string[];
  aiQualitySampleIds: string[];
};

const EMPTY_TRACKER: BootstrapTracker = {
  insightsDealerIds: [],
  suspiciousIds: [],
  suspiciousFlaggedUserIds: [],
  aiQualitySampleIds: [],
};

async function getTracker(): Promise<BootstrapTracker> {
  const row = await prisma.settings.findUnique({
    where: { key: BOOTSTRAP_TRACKER_KEY },
    select: { value: true },
  });
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return EMPTY_TRACKER;
  }
  const src = row.value as Partial<BootstrapTracker>;
  return {
    insightsDealerIds: Array.isArray(src.insightsDealerIds) ? src.insightsDealerIds.map(String) : [],
    suspiciousIds: Array.isArray(src.suspiciousIds) ? src.suspiciousIds.map(String) : [],
    suspiciousFlaggedUserIds: Array.isArray(src.suspiciousFlaggedUserIds)
      ? src.suspiciousFlaggedUserIds.map(String)
      : [],
    aiQualitySampleIds: Array.isArray(src.aiQualitySampleIds) ? src.aiQualitySampleIds.map(String) : [],
  };
}

async function saveTracker(tracker: BootstrapTracker) {
  await prisma.settings.upsert({
    where: { key: BOOTSTRAP_TRACKER_KEY },
    create: {
      key: BOOTSTRAP_TRACKER_KEY,
      category: 'admin',
      value: tracker as object,
    },
    update: {
      value: tracker as object,
    },
  });
}

const DEFAULT_QUESTS = [
  {
    name: 'Haftanın İlk Geri Bildirimi',
    description: 'Bu hafta en az 1 geri bildirim tamamla.',
    icon: '📝',
    type: 'weekly',
    requirement: { type: 'give_feedback', count: 1 },
    reward: { points: 80, xp: 40 },
  },
  {
    name: 'Düzenli Katkı',
    description: 'Bu hafta 3 geri bildirim tamamla.',
    icon: '🎯',
    type: 'weekly',
    requirement: { type: 'give_feedback', count: 3 },
    reward: { points: 180, xp: 90 },
  },
  {
    name: 'Topluluğa Destek',
    description: 'Bu hafta 5 geri bildirim ile topluluğa katkı yap.',
    icon: '🌟',
    type: 'weekly',
    requirement: { type: 'give_feedback', count: 5 },
    reward: { points: 300, xp: 140 },
  },
];

function inferSentiment(rating: number) {
  if (rating >= 4) return 'positive';
  if (rating <= 2) return 'negative';
  return 'neutral';
}

/** Yalnız demo (sentetik) bayilerin geri bildirimleri. */
const DEMO_FEEDBACK_SCOPE: Prisma.FeedbackWhereInput = {
  deletedAt: null,
  qrCode: { dealer: { isDemo: true } },
};

type Result = Record<string, unknown>;

async function runConfigAction(action: ConfigAction, dryRun: boolean, adminId: string): Promise<Result> {
  if (action === 'seed_achievements') {
    if (dryRun) return { dryRun: true, message: 'Başarım görevleri eksikse eklenir (idempotent).' };
    const { seedAchievements } = await import('@/lib/achievements');
    await seedAchievements();
    return { message: 'Başarım görevleri eklendi.' };
  }

  if (action === 'quests_defaults') {
    const existing = await prisma.quest.count({ where: { isActive: true, archivedAt: null } });
    if (existing >= 3) {
      return { created: 0, message: 'Aktif görevler zaten mevcut.' };
    }
    const missing = [];
    for (const q of DEFAULT_QUESTS) {
      const found = await prisma.quest.findFirst({ where: { name: q.name } });
      if (!found) missing.push(q);
    }
    if (dryRun) return { dryRun: true, wouldCreate: missing.length };
    const created: string[] = [];
    for (const q of missing) {
      const row = await prisma.quest.create({
        data: {
          name: q.name,
          description: q.description,
          icon: q.icon,
          type: q.type,
          requirement: q.requirement as object,
          reward: q.reward as object,
          isActive: true,
        },
      });
      created.push(row.id);
    }
    return { created: created.length, ids: created };
  }

  if (action === 'assign_ab_cohorts') {
    // Demo bayiler deneye girmez (deney verisini kirletmesinler).
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER', isDemo: false, anonymizedAt: null },
      select: { id: true, abCohort: true },
      orderBy: { createdAt: 'asc' },
    });
    const unassigned = dealers.filter((d) => !d.abCohort);
    if (dryRun) return { dryRun: true, wouldAssign: unassigned.length, totalDealers: dealers.length };
    // Mevcut dağılımdan devam et (her çağrıda A'dan başlayıp dengesizlik üretmesin).
    const cohortCycle = ['A', 'B', 'C'] as const;
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const d of dealers) if (d.abCohort && d.abCohort in counts) counts[d.abCohort] += 1;
    let assigned = 0;
    for (const d of unassigned) {
      const next = [...cohortCycle].sort((a, b) => counts[a] - counts[b])[0];
      const w = await prisma.user.updateMany({ where: { id: d.id, abCohort: null }, data: { abCohort: next } });
      if (w.count > 0) {
        counts[next] += 1;
        assigned++;
      }
    }
    return { assigned, totalDealers: dealers.length, distribution: counts };
  }

  // ensure_ai_settings
  const dealers = await prisma.user.findMany({
    where: { role: 'DEALER', anonymizedAt: null, aiSettings: { is: null } },
    select: { id: true },
  });
  if (dryRun) return { dryRun: true, wouldCreate: dealers.length };
  let created = 0;
  for (const d of dealers) {
    const res = await prisma.aISettings.createMany({
      data: [{ dealerId: d.id, isEnabled: true, autoAnalyze: true, analysisLanguage: 'tr' }],
      skipDuplicates: true,
    });
    created += res.count;
  }
  void adminId;
  return { created };
}

async function runDemoAction(action: DemoAction, dryRun: boolean, adminId: string): Promise<Result> {
  if (action === 'seed_demo_cafes') {
    if (dryRun) return { dryRun: true, message: '3 demo kafe (isDemo) ve demo müşterileri oluşturulur/güncellenir.' };
    const { seedDemoCafes } = await import('@/lib/demo-cafes-seed');
    const result = await seedDemoCafes(adminId);
    return {
      message: `${result.cafes} demo kafe eklendi (${result.feedbacks} geri bildirim, ${result.consumptions} tüketim).`,
      result,
    };
  }

  if (action === 'seed_insights_categories') {
    const tracker = await getTracker();
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER', isDemo: true, businessCategory: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (dryRun) return { dryRun: true, wouldUpdate: dealers.length };
    const categories = ['demo-cafe', 'demo-restaurant', 'demo-bakery', 'demo-market', 'demo-hotel'];
    const addedIds: string[] = [];
    for (const [index, dealer] of dealers.entries()) {
      const w = await prisma.user.updateMany({
        where: { id: dealer.id, isDemo: true, businessCategory: null },
        data: { businessCategory: categories[index % categories.length] },
      });
      if (w.count > 0) addedIds.push(dealer.id);
    }
    await saveTracker({
      ...tracker,
      insightsDealerIds: Array.from(new Set([...tracker.insightsDealerIds, ...addedIds])),
    });
    return { updated: addedIds.length };
  }

  if (action === 'clear_insights_categories') {
    // Yalnız demo kategorileri ("demo-" önekli değerler) temizlenir. Elle girilmiş gerçek
    // kategorilere dokunulmaz. (Eski sürümün gerçek bayilere yazdığı demo-* değerleri de
    // böylece geri alınır.)
    const where: Prisma.UserWhereInput = { role: 'DEALER', businessCategory: { startsWith: 'demo-' } };
    if (dryRun) return { dryRun: true, wouldClear: await prisma.user.count({ where }) };
    const tracker = await getTracker();
    const result = await prisma.user.updateMany({ where, data: { businessCategory: null } });
    await saveTracker({ ...tracker, insightsDealerIds: [] });
    return { cleared: result.count };
  }

  if (action === 'seed_suspicious_activities') {
    const [dealers, customers] = await Promise.all([
      prisma.user.findMany({ where: { role: 'DEALER', isDemo: true }, select: { id: true }, take: 20, orderBy: { createdAt: 'desc' } }),
      prisma.user.findMany({ where: { role: 'CUSTOMER', isDemo: true }, select: { id: true }, take: 30, orderBy: { createdAt: 'desc' } }),
    ]);
    if (dealers.length === 0 || customers.length === 0) {
      return {
        created: 0,
        message: 'Şüpheli aktivite demosu için en az bir demo bayi ve demo müşteri gerekiyor. Önce "Demo kafeleri ekle" çalıştırın.',
      };
    }
    const planned = Math.min(12, customers.length);
    if (dryRun) return { dryRun: true, wouldCreate: planned };

    const tracker = await getTracker();
    const suspiciousIds: string[] = [];
    const flaggedUserIds: string[] = [];
    for (let i = 0; i < planned; i++) {
      const user = customers[i];
      const dealer = dealers[i % dealers.length];
      const severity = i % 4 === 0 ? 'HIGH' : i % 3 === 0 ? 'MEDIUM' : 'LOW';
      const activity = await prisma.suspiciousActivity.create({
        data: {
          userId: user.id,
          dealerId: dealer.id,
          type: i % 2 === 0 ? 'RAPID_SCAN' : 'UNUSUAL_AMOUNT',
          severity,
          description:
            severity === 'HIGH'
              ? 'Kısa sürede çoklu tarama denemesi tespit edildi. (demo)'
              : 'Anormal etkileşim paterni gözlemlendi. (demo)',
          metadata: { source: 'bootstrap', reason: 'admin demo data' } as object,
        },
      });
      suspiciousIds.push(activity.id);
      if (severity === 'HIGH') {
        // Yalnız temiz durumdaki DEMO müşteri işaretlenir.
        const w = await prisma.user.updateMany({
          where: { id: user.id, isDemo: true, fraudStatus: 'clean' },
          data: { fraudStatus: 'flagged', fraudScore: BOOTSTRAP_FRAUD_SCORE },
        });
        if (w.count > 0) flaggedUserIds.push(user.id);
      }
    }
    await saveTracker({
      ...tracker,
      suspiciousIds: Array.from(new Set([...tracker.suspiciousIds, ...suspiciousIds])),
      suspiciousFlaggedUserIds: Array.from(new Set([...tracker.suspiciousFlaggedUserIds, ...flaggedUserIds])),
    });
    return { created: suspiciousIds.length, flagged: flaggedUserIds.length };
  }

  if (action === 'clear_suspicious_activities') {
    const tracker = await getTracker();
    const activityWhere: Prisma.SuspiciousActivityWhereInput = {
      OR: [
        ...(tracker.suspiciousIds.length > 0 ? [{ id: { in: tracker.suspiciousIds } }] : []),
        { metadata: { path: ['source'], equals: 'bootstrap' } },
      ],
    };
    // Yalnız bootstrap'in işaretlediği kullanıcılar ve yalnız bootstrap'in yazdığı TAM skorla
    // hâlâ duruyorlarsa: gerçek fraud motorunun bayrakları aklanmaz.
    const userWhere: Prisma.UserWhereInput | null =
      tracker.suspiciousFlaggedUserIds.length > 0
        ? { id: { in: tracker.suspiciousFlaggedUserIds }, fraudStatus: 'flagged', fraudScore: BOOTSTRAP_FRAUD_SCORE }
        : null;
    if (dryRun) {
      return {
        dryRun: true,
        wouldDelete: await prisma.suspiciousActivity.count({ where: activityWhere }),
        wouldReset: userWhere ? await prisma.user.count({ where: userWhere }) : 0,
      };
    }
    const deleteResult = await prisma.suspiciousActivity.deleteMany({ where: activityWhere });
    const resetUsers = userWhere
      ? await prisma.user.updateMany({ where: userWhere, data: { fraudStatus: 'clean', fraudScore: 0 } })
      : { count: 0 };
    await saveTracker({ ...tracker, suspiciousIds: [], suspiciousFlaggedUserIds: [] });
    return { cleared: deleteResult.count, usersReset: resetUsers.count };
  }

  if (action === 'seed_ai_quality_samples') {
    const feedbacks = await prisma.feedback.findMany({
      where: { ...DEMO_FEEDBACK_SCOPE, text: { not: null }, aiProcessedAt: { not: null } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const existing = await prisma.aIQualitySample.findMany({
      where: { feedbackId: { in: feedbacks.map((f) => f.id) } },
      select: { feedbackId: true },
    });
    const existingSet = new Set(existing.map((x) => x.feedbackId));
    const candidates = feedbacks.filter((f) => !existingSet.has(f.id)).slice(0, 80);
    if (dryRun) return { dryRun: true, wouldCreate: candidates.length };
    if (candidates.length === 0) {
      return { created: 0, message: 'Yeni örnek için uygun, AI işlenmiş demo geri bildirimi bulunamadı.' };
    }
    const tracker = await getTracker();
    const createdRows = await prisma.$transaction(
      candidates.map((item) =>
        prisma.aIQualitySample.create({
          data: { feedbackId: item.id, status: 'pending', notes: BOOTSTRAP_SAMPLE_NOTE },
        })
      )
    );
    await saveTracker({
      ...tracker,
      aiQualitySampleIds: Array.from(new Set([...tracker.aiQualitySampleIds, ...createdRows.map((row) => row.id)])),
    });
    return { created: createdRows.length };
  }

  if (action === 'clear_ai_quality_samples') {
    const tracker = await getTracker();
    // İnsanın skorladığı (reviewed) örnekler silinmez.
    const where: Prisma.AIQualitySampleWhereInput = {
      status: 'pending',
      OR: [
        ...(tracker.aiQualitySampleIds.length > 0 ? [{ id: { in: tracker.aiQualitySampleIds } }] : []),
        { notes: BOOTSTRAP_SAMPLE_NOTE },
      ],
    };
    if (dryRun) return { dryRun: true, wouldClear: await prisma.aIQualitySample.count({ where }) };
    const result = await prisma.aIQualitySample.deleteMany({ where });
    await saveTracker({ ...tracker, aiQualitySampleIds: [] });
    return { cleared: result.count };
  }

  if (action === 'clear_synthetic_ai_signals') {
    // Eski sürümün GERÇEK geri bildirimlere yazdığı sezgisel sinyalleri geri alır:
    // AI alanları boşaltılır → gerçek analiz kuyruğu (ai-retry) bu kayıtları yeniden işler.
    const where: Prisma.FeedbackWhereInput = { aiModelUsed: BOOTSTRAP_AI_MODEL };
    if (dryRun) return { dryRun: true, wouldReset: await prisma.feedback.count({ where }) };
    const res = await prisma.feedback.updateMany({
      where,
      data: {
        intent: null,
        urgency: null,
        churnRisk: null,
        effortScore: null,
        aiModelUsed: null,
        aiVersion: null,
        aiProcessedAt: null,
        aiAnalysis: Prisma.DbNull,
      },
    });
    return { reset: res.count };
  }

  // synthesize_ai_signals — YALNIZ demo bayilerin geri bildirimleri.
  const candidates = await prisma.feedback.findMany({
    where: { ...DEMO_FEEDBACK_SCOPE, text: { not: null }, aiProcessedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 250,
    select: { id: true, rating: true, sentiment: true },
  });
  if (dryRun) return { dryRun: true, wouldUpdate: candidates.length };

  let updated = 0;
  for (const f of candidates) {
    const sentiment = f.sentiment || inferSentiment(f.rating);
    const w = await prisma.feedback.updateMany({
      where: { id: f.id, aiProcessedAt: null, ...DEMO_FEEDBACK_SCOPE },
      data: {
        sentiment,
        intent: f.rating <= 2 ? 'complaint' : f.rating >= 4 ? 'praise' : 'general',
        urgency: f.rating <= 2 ? 0.78 : f.rating === 3 ? 0.45 : 0.22,
        churnRisk: f.rating <= 2 ? 0.72 : f.rating === 3 ? 0.48 : 0.2,
        effortScore: Math.min(1, Math.max(0.1, 1 - f.rating / 6)),
        aiModelUsed: BOOTSTRAP_AI_MODEL,
        aiVersion: 'bootstrap-v1',
        aiProcessedAt: new Date(),
        aiAnalysis: {
          source: 'bootstrap',
          note: 'Demo bayi için sezgisel sentez (gerçek AI analizi değildir)',
          rating: f.rating,
        } as object,
      },
    });
    updated += w.count;
  }
  return { scanned: candidates.length, updated };
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; dryRun?: unknown } | null;
  const action = String(body?.action || '');
  const dryRun = body?.dryRun === true;
  if (!isBootstrapAction(action)) {
    return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (isDemoAction(action)) {
    const gate = demoSeedGate();
    if (gate) return gate;
  }

  try {
    const result = isDemoAction(action)
      ? await runDemoAction(action, dryRun, session.user.id)
      : await runConfigAction(action, dryRun, session.user.id);

    if (!dryRun) {
      await prisma.auditLog
        .create({
          data: auditEntry(
            actorFromSession(session),
            { action: 'ADMIN_BOOTSTRAP', entity: 'Bootstrap', entityId: action, newData: { action, demo: isDemoAction(action), result } },
            request
          ),
        })
        .catch((e) => console.error('[bootstrap] audit failed:', e));
    }

    return NextResponse.json({ success: true, action, ...result }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('[bootstrap] action failed:', action, error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json({ error: 'İşlem tamamlanamadı' }, { status: 500, headers: PRIVATE_NO_STORE_HEADERS });
  }
}
