import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { requireAuth } from '@/lib/api-auth';
import {
  getInnovationPlatformConfig,
  saveInnovationPlatformConfig,
  type InnovationPlatformConfig,
} from '@/lib/innovation-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const config = await getInnovationPlatformConfig();
  const auditSample = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, action: true, createdAt: true, userId: true },
  });

  return NextResponse.json({
    config,
    complianceCenter: {
      retentionDaysPersonalData: config.compliance.retentionDaysPersonalData,
      deletionRequestContactEmail: config.compliance.deletionRequestContactEmail,
      auditLogPath: config.compliance.auditLogUrl ?? '/admin/audit',
      recentAuditEntries: auditSample,
    },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as Partial<InnovationPlatformConfig>;
  const next = await saveInnovationPlatformConfig(body);
  return NextResponse.json({ success: true, config: next }, { headers: PRIVATE_NO_STORE_HEADERS });
}
