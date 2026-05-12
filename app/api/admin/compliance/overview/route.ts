import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';


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

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('Compliance overview error:', error);
    return NextResponse.json({ error: 'Uyum özeti getirilemedi' }, { status: 500 });
  }
}

