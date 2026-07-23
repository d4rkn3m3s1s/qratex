import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

type BootstrapAction =
  | 'quests_defaults'
  | 'assign_ab_cohorts'
  | 'ensure_ai_settings'
  | 'synthesize_ai_signals'
  | 'seed_insights_categories'
  | 'seed_suspicious_activities'
  | 'seed_ai_quality_samples'
  | 'clear_insights_categories'
  | 'clear_suspicious_activities'
  | 'clear_ai_quality_samples'
  | 'seed_achievements'
  | 'seed_demo_cafes';

const BOOTSTRAP_TRACKER_KEY = 'admin_bootstrap_tracker_v1';

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

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '') as BootstrapAction;
  if (
    action !== 'quests_defaults' &&
    action !== 'assign_ab_cohorts' &&
    action !== 'ensure_ai_settings' &&
    action !== 'synthesize_ai_signals' &&
    action !== 'seed_insights_categories' &&
    action !== 'seed_suspicious_activities' &&
    action !== 'seed_ai_quality_samples' &&
    action !== 'clear_insights_categories' &&
    action !== 'clear_suspicious_activities' &&
    action !== 'clear_ai_quality_samples' &&
    action !== 'seed_achievements' &&
    action !== 'seed_demo_cafes'
  ) {
    return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'seed_achievements') {
    const { seedAchievements } = await import('@/lib/achievements');
    await seedAchievements();
    return NextResponse.json({ success: true, action, message: 'Başarım görevleri eklendi.' }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'seed_demo_cafes') {
    const { seedDemoCafes } = await import('@/lib/demo-cafes-seed');
    const result = await seedDemoCafes(auth.session.user.id);
    return NextResponse.json(
      {
        success: true,
        action,
        message: `${result.cafes} demo kafe eklendi (${result.feedbacks} geri bildirim, ${result.consumptions} tüketim).`,
        result,
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  }

  if (action === 'quests_defaults') {
    const existing = await prisma.quest.count({ where: { isActive: true } });
    if (existing >= 3) {
      return NextResponse.json({
        success: true,
        action,
        created: 0,
        message: 'Aktif görevler zaten mevcut.',
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const created = [];
    for (const q of DEFAULT_QUESTS) {
      const found = await prisma.quest.findFirst({ where: { name: q.name } });
      if (found) continue;
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
    return NextResponse.json({
      success: true,
      action,
      created: created.length,
      ids: created,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'assign_ab_cohorts') {
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true, abCohort: true },
      orderBy: { createdAt: 'asc' },
    });
    const cohortCycle = ['A', 'B', 'C'] as const;
    let assigned = 0;
    let idx = 0;
    for (const d of dealers) {
      if (d.abCohort) continue;
      await prisma.user.update({
        where: { id: d.id },
        data: { abCohort: cohortCycle[idx % cohortCycle.length] },
      });
      assigned++;
      idx++;
    }
    return NextResponse.json({
      success: true,
      action,
      assigned,
      totalDealers: dealers.length,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'ensure_ai_settings') {
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true },
    });
    let created = 0;
    for (const d of dealers) {
      const exists = await prisma.aISettings.findUnique({ where: { dealerId: d.id } });
      if (exists) continue;
      await prisma.aISettings.create({
        data: {
          dealerId: d.id,
          isEnabled: true,
          autoAnalyze: true,
          analysisLanguage: 'tr',
        },
      });
      created++;
    }
    return NextResponse.json({
      success: true,
      action,
      created,
      totalDealers: dealers.length,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'seed_insights_categories') {
    const tracker = await getTracker();
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true, businessCategory: true },
      orderBy: { createdAt: 'asc' },
    });
    const categories = ['demo-cafe', 'demo-restaurant', 'demo-bakery', 'demo-market', 'demo-hotel'];
    let updated = 0;
    const addedIds: string[] = [];
    for (const [index, dealer] of dealers.entries()) {
      if (dealer.businessCategory) continue;
      await prisma.user.update({
        where: { id: dealer.id },
        data: { businessCategory: categories[index % categories.length] },
      });
      updated++;
      addedIds.push(dealer.id);
    }
    await saveTracker({
      ...tracker,
      insightsDealerIds: Array.from(new Set([...tracker.insightsDealerIds, ...addedIds])),
    });
    return NextResponse.json({
      success: true,
      action,
      updated,
      totalDealers: dealers.length,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'clear_insights_categories') {
    const tracker = await getTracker();
    const result = await prisma.user.updateMany({
      where: {
        role: 'DEALER',
        businessCategory: { not: null },
      },
      data: { businessCategory: null },
    });
    await saveTracker({ ...tracker, insightsDealerIds: [] });
    return NextResponse.json({ success: true, action, cleared: result.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'seed_suspicious_activities') {
    const tracker = await getTracker();
    const dealers = await prisma.user.findMany({
      where: { role: 'DEALER' },
      select: { id: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true },
      take: 30,
      orderBy: { createdAt: 'desc' },
    });
    if (dealers.length === 0 || customers.length === 0) {
      return NextResponse.json({
        success: true,
        action,
        created: 0,
        message: 'Şüpheli aktivite için en az bir bayi ve müşteri gerekiyor.',
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    let created = 0;
    const suspiciousIds: string[] = [];
    const flaggedUserIds: string[] = [];
    for (let i = 0; i < Math.min(12, customers.length); i++) {
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
              ? 'Kısa sürede çoklu tarama denemesi tespit edildi.'
              : 'Anormal etkileşim paterni gözlemlendi.',
          metadata: {
            source: 'bootstrap',
            reason: 'admin demo data',
          } as object,
        },
      });
      created++;
      suspiciousIds.push(activity.id);
      if (severity === 'HIGH') {
        await prisma.user.update({
          where: { id: user.id },
          data: { fraudStatus: 'flagged', fraudScore: 0.71 },
        });
        flaggedUserIds.push(user.id);
      }
    }
    await saveTracker({
      ...tracker,
      suspiciousIds: Array.from(new Set([...tracker.suspiciousIds, ...suspiciousIds])),
      suspiciousFlaggedUserIds: Array.from(new Set([...tracker.suspiciousFlaggedUserIds, ...flaggedUserIds])),
    });

    return NextResponse.json({
      success: true,
      action,
      created,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'clear_suspicious_activities') {
    const tracker = await getTracker();
    const deleteResult = await prisma.suspiciousActivity.deleteMany({
      where: {
        OR: [
          tracker.suspiciousIds.length > 0 ? { id: { in: tracker.suspiciousIds } } : undefined,
          { metadata: { path: ['source'], equals: 'bootstrap' } },
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
    });

    const resetUsers = await prisma.user.updateMany({
      where: {
        fraudStatus: 'flagged',
        OR: [
          tracker.suspiciousFlaggedUserIds.length > 0 ? { id: { in: tracker.suspiciousFlaggedUserIds } } : undefined,
          { fraudScore: { gte: 0.7, lte: 0.72 } },
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
      data: { fraudStatus: 'clean', fraudScore: 0 },
    });

    await saveTracker({
      ...tracker,
      suspiciousIds: [],
      suspiciousFlaggedUserIds: [],
    });
    return NextResponse.json({
      success: true,
      action,
      cleared: deleteResult.count,
      usersReset: resetUsers.count,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'seed_ai_quality_samples') {
    const tracker = await getTracker();
    const feedbacks = await prisma.feedback.findMany({
      where: { text: { not: null }, aiProcessedAt: { not: null } },
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
    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        action,
        created: 0,
        message: 'Yeni örnek için uygun AI işlenmiş geri bildirim bulunamadı.',
      }, { headers: PRIVATE_NO_STORE_HEADERS });
    }

    const createdRows = await prisma.$transaction(
      candidates.map((item) =>
        prisma.aIQualitySample.create({
          data: {
            feedbackId: item.id,
            status: 'pending',
            notes: '[bootstrap-demo]',
          },
        })
      )
    );
    await saveTracker({
      ...tracker,
      aiQualitySampleIds: Array.from(
        new Set([...tracker.aiQualitySampleIds, ...createdRows.map((row) => row.id)])
      ),
    });
    return NextResponse.json({
      success: true,
      action,
      created: createdRows.length,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  if (action === 'clear_ai_quality_samples') {
    const tracker = await getTracker();
    const result = await prisma.aIQualitySample.deleteMany({
      where: {
        OR: [
          tracker.aiQualitySampleIds.length > 0 ? { id: { in: tracker.aiQualitySampleIds } } : undefined,
          { notes: '[bootstrap-demo]' },
        ].filter(Boolean) as Array<Record<string, unknown>>,
      },
    });
    await saveTracker({
      ...tracker,
      aiQualitySampleIds: [],
    });
    return NextResponse.json({ success: true, action, cleared: result.count }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  const candidates = await prisma.feedback.findMany({
    where: { text: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 250,
    select: {
      id: true,
      rating: true,
      sentiment: true,
      aiProcessedAt: true,
      text: true,
    },
  });

  let updated = 0;
  for (const f of candidates) {
    if (f.aiProcessedAt) continue;
    const sentiment = f.sentiment || inferSentiment(f.rating);
    const urgency = f.rating <= 2 ? 0.78 : f.rating === 3 ? 0.45 : 0.22;
    const churnRisk = f.rating <= 2 ? 0.72 : f.rating === 3 ? 0.48 : 0.2;
    const intent = f.rating <= 2 ? 'complaint' : f.rating >= 4 ? 'praise' : 'general';
    await prisma.feedback.update({
      where: { id: f.id },
      data: {
        sentiment,
        intent,
        urgency,
        churnRisk,
        effortScore: Math.min(1, Math.max(0.1, 1 - f.rating / 6)),
        aiModelUsed: 'bootstrap-heuristic',
        aiVersion: 'bootstrap-v1',
        aiProcessedAt: new Date(),
        aiAnalysis: {
          source: 'bootstrap',
          note: 'Heuristic synthesis for admin dashboards',
          rating: f.rating,
        } as object,
      },
    });
    updated++;
  }

  return NextResponse.json({
    success: true,
    action,
    scanned: candidates.length,
    updated,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
