import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { SEO_SETTINGS_KEY } from '@/lib/seo-settings';


export const dynamic = 'force-dynamic';

/** Son SEO ayar değişikliklerini (audit log) döner. */
export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const seoSetting = await prisma.settings.findUnique({
      where: { key: SEO_SETTINGS_KEY },
      select: { id: true },
    });
    if (!seoSetting) return NextResponse.json({ entries: [] });

    const entries = await prisma.auditLog.findMany({
      where: { entity: 'settings', entityId: seoSetting.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        action: true,
        oldData: true,
        newData: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    });
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('SEO audit GET error:', e);
    return NextResponse.json({ error: 'Geçmiş getirilemedi' }, { status: 500 });
  }
}
