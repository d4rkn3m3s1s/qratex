import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { MODULE_CATALOG, MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';


export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const [
    settingsRow,
    usersByRole,
    donations,
    referrals,
    squads,
    campaigns,
    quests,
    featureFlags,
    remedyOffers,
    surpriseBoxes,
  ] =
    await Promise.all([
      prisma.settings.findUnique({ where: { key: MODULE_CONTROLS_SETTINGS_KEY }, select: { value: true } }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { _all: true },
      }),
      prisma.donation.count(),
      prisma.referral.count(),
      prisma.squad.count(),
      prisma.campaign.count(),
      prisma.quest.count({ where: { isActive: true } }),
      prisma.featureFlag.count(),
      prisma.remedyOffer.count(),
      prisma.userSurpriseBox.count(),
    ]);

  const controls = normalizeModuleControls(settingsRow?.value);
  const roleCountMap = usersByRole.reduce<Record<string, number>>((acc, row) => {
    acc[row.role] = row._count._all;
    return acc;
  }, {});

  const metrics: Record<string, number> = {
    donations,
    referrals,
    squads,
    campaigns,
    quests,
    feature_flags: featureFlags,
    remedy_offers: remedyOffers,
    surprise_boxes: surpriseBoxes,
  };

  const endpointBindings = [
    { moduleKey: 'donations', endpoint: '/api/customer/donations', methods: ['GET', 'POST'] },
    { moduleKey: 'referrals', endpoint: '/api/referral', methods: ['GET', 'POST'] },
    { moduleKey: 'squads', endpoint: '/api/customer/squads', methods: ['GET', 'POST'] },
    { moduleKey: 'squads', endpoint: '/api/customer/squads/join', methods: ['POST'] },
    { moduleKey: 'squads', endpoint: '/api/customer/squads/[id]/leave', methods: ['POST'] },
    { moduleKey: 'squads', endpoint: '/api/customer/squads/weekly-goal', methods: ['GET'] },
    { moduleKey: 'discovery', endpoint: '/api/customer/discovery', methods: ['GET'] },
    { moduleKey: 'campaigns', endpoint: '/api/dealer/campaigns', methods: ['GET', 'POST'] },
    { moduleKey: 'campaigns', endpoint: '/api/dealer/campaigns/[id]/send', methods: ['POST'] },
    { moduleKey: 'quests', endpoint: '/api/gamification/quests', methods: ['GET', 'POST'] },
    { moduleKey: 'quests', endpoint: '/api/gamification/quests/[id]/claim', methods: ['POST'] },
    { moduleKey: 'vip_lounge', endpoint: '/api/customer/lounge', methods: ['GET'] },
    { moduleKey: 'rewards', endpoint: '/api/leaderboard', methods: ['GET'] },
    { moduleKey: 'rewards', endpoint: '/api/gamification/rewards', methods: ['GET', 'POST', 'PATCH'] },
    { moduleKey: 'rewards', endpoint: '/api/gamification/rewards/[id]', methods: ['GET', 'PATCH', 'DELETE'] },
    { moduleKey: 'surprise_boxes', endpoint: '/api/admin/surprise-box', methods: ['GET'] },
    { moduleKey: 'surprise_boxes', endpoint: '/api/admin/surprise-box/send', methods: ['POST'] },
    { moduleKey: 'remedy_offers', endpoint: '/api/dealer/feedbacks/[id]/remedy', methods: ['POST'] },
    { moduleKey: 'remedy_offers', endpoint: '/api/dealer/consumption-reviews/[id]/remedy', methods: ['POST'] },
  ];

  const modules = MODULE_CATALOG.map((item) => ({
    ...item,
    enabled: controls[item.key] !== false,
    metric: metrics[item.key] ?? null,
  }));

  const endpointCountByModule = endpointBindings.reduce<Record<string, number>>((acc, row) => {
    acc[row.moduleKey] = (acc[row.moduleKey] ?? 0) + 1;
    return acc;
  }, {});

  const blockedEvents = await prisma.analyticsEvent.findMany({
    where: {
      event: 'module_gate_blocked',
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { data: true },
    take: 2000,
    orderBy: { createdAt: 'desc' },
  });

  const blockedCountByModule = blockedEvents.reduce<Record<string, number>>((acc, item) => {
    const moduleKey =
      item.data && typeof item.data === 'object' && !Array.isArray(item.data)
        ? String((item.data as { moduleKey?: unknown }).moduleKey ?? '')
        : '';
    if (!moduleKey) return acc;
    acc[moduleKey] = (acc[moduleKey] ?? 0) + 1;
    return acc;
  }, {});

  const modulesWithMeta = modules.map((item) => ({
    ...item,
    affectedEndpointCount: item.enabled ? 0 : endpointCountByModule[item.key] ?? 0,
    blocked403Last24h: blockedCountByModule[item.key] ?? 0,
  }));

  return NextResponse.json({
    success: true,
    roleCounts: {
      admin: roleCountMap.ADMIN ?? 0,
      dealer: roleCountMap.DEALER ?? 0,
      customer: roleCountMap.CUSTOMER ?? 0,
      staff: roleCountMap.STAFF ?? 0,
    },
    modules: modulesWithMeta,
    endpointBindings,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
