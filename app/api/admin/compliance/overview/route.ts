import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';


export const dynamic = 'force-dynamic';

const kvkkInventory = [
  {
    category: 'Kimlik ve hesap',
    models: ['User', 'Account', 'Session'],
    fields: ['name', 'email', 'role', 'image'],
    purpose: 'Kimlik doğrulama, hesap yönetimi ve yetkilendirme',
    legalBasis: 'Sözleşmenin ifası / meşru menfaat',
    retention: 'Hesap aktif olduğu sürece + yasal saklama süresi',
  },
  {
    category: 'Müşteri deneyimi',
    models: ['Feedback', 'ConsumptionReview', 'AIConversation'],
    fields: ['rating', 'text', 'topics', 'sentiment'],
    purpose: 'Hizmet kalitesi ölçümü, raporlama ve AI analiz',
    legalBasis: 'Meşru menfaat / açık rıza (gerekli alanlarda)',
    retention: '24 ay (önerilen), anonimleştirme opsiyonu',
  },
  {
    category: 'Davranış ve oyunlaştırma',
    models: ['UserBadge', 'UserQuest', 'UserReward', 'AnalyticsEvent'],
    fields: ['points', 'level', 'event', 'category'],
    purpose: 'Liderlik, rozet, ödül ve kullanım analitiği',
    legalBasis: 'Meşru menfaat',
    retention: '24 ay',
  },
  {
    category: 'Güvenlik ve denetim',
    models: ['AuditLog', 'CardAuditLog', 'SuspiciousActivity'],
    fields: ['action', 'entity', 'ipAddress', 'userAgent'],
    purpose: '5651 uyumluluğu, güvenlik izleme, olay inceleme',
    legalBasis: 'Hukuki yükümlülük',
    retention: '5651 politikasına göre saklama',
  },
];

function ratio(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    // REDIS CACHE: 11 ayrı COUNT (audit/card-audit/suspicious taramaları dahil,
    // canlı logda ~18sn). Uyum özeti — 60s tazelik yeterli. Redis yoksa DB'ye düşer.
    const { redisGetJson, redisSetJson } = await import('@/lib/redis');
    const cacheKey = 'admin:compliance-overview';
    const cachedOverview = await redisGetJson<object>(cacheKey);
    if (cachedOverview) return NextResponse.json(cachedOverview, { headers: PRIVATE_NO_STORE_HEADERS });

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      totalUsers,
      totalFeedbacks,
      totalConsumptions,
      totalAuditLogs,
      auditWithIp,
      auditWithUserAgent,
      totalCardAuditLogs,
      cardAuditWithIp,
      unresolvedSuspicious,
      activeSuspiciousLast30d,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.feedback.count(),
      prisma.consumptionReview.count(),
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { ipAddress: { not: null } } }),
      prisma.auditLog.count({ where: { userAgent: { not: null } } }),
      prisma.cardAuditLog.count(),
      prisma.cardAuditLog.count({ where: { ipAddress: { not: null } } }),
      prisma.suspiciousActivity.count({ where: { isResolved: false } }),
      prisma.suspiciousActivity.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    const auditCoverage = {
      withIpPercent: ratio(auditWithIp, totalAuditLogs),
      withUserAgentPercent: ratio(auditWithUserAgent, totalAuditLogs),
      totalAuditLogs,
    };

    const cardAuditCoverage = {
      withIpPercent: ratio(cardAuditWithIp, totalCardAuditLogs),
      totalCardAuditLogs,
    };

    const payload = {
      success: true,
      data: {
        summary: {
          totalUsers,
          totalFeedbacks,
          totalConsumptions,
          unresolvedSuspicious,
          activeSuspiciousLast30d,
        },
        logging: {
          auditCoverage,
          cardAuditCoverage,
          note: '5651 için kritik olaylarda IP, User-Agent, zaman damgası ve aksiyon birlikteliğini koruyun.',
        },
        kvkkInventory,
        legalChecklist: [
          'Aydınlatma metni ve açık rıza metinleri (konum, pazarlama, AI işleme)',
          'Saklama-imha politikası ve sürelerin sistemde uygulanması',
          'Veri sahibi başvuru süreci (erişim, düzeltme, silme, aktarım)',
          '5651 log bütünlüğü, erişim kontrolü ve saklama süreci',
        ],
      },
    };
    await redisSetJson(cacheKey, payload, 60); // Redis yoksa sessizce geçer
    return NextResponse.json(payload, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Compliance overview error:', error);
    return NextResponse.json({ error: 'Uyum özeti getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

