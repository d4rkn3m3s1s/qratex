import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { z } from 'zod';
import { Prisma } from '@prisma/client';


export const dynamic = 'force-dynamic';

const schema = z.object({
  auditLogId: z.string().min(1),
});

type SettingsMap = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;
    const raw = await request.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 });
    }

    const entry = await prisma.auditLog.findUnique({
      where: { id: parsed.data.auditLogId },
      select: { id: true, entity: true, oldData: true, newData: true },
    });
    if (!entry || entry.entity !== 'settings') {
      return NextResponse.json({ error: 'Audit kaydı bulunamadı' }, { status: 404 });
    }

    const oldData = entry.oldData;
    if (!oldData || typeof oldData !== 'object' || Array.isArray(oldData)) {
      return NextResponse.json({ error: 'Bu kayıt rollback için uygun değil' }, { status: 400 });
    }

    const map = oldData as SettingsMap;
    const keys = Object.keys(map);
    if (keys.length === 0) {
      return NextResponse.json({ error: 'Rollback edilecek ayar bulunamadı' }, { status: 400 });
    }

    const existing = await prisma.settings.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const currentMap = existing.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    await prisma.$transaction(
      keys.map((key) =>
        prisma.settings.upsert({
          where: { key },
          update: { value: map[key] as Prisma.InputJsonValue },
          create: {
            key,
            category: 'general',
            value: map[key] as Prisma.InputJsonValue,
          },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'rollback',
        entity: 'settings',
        oldData: currentMap as Prisma.InputJsonValue,
        newData: map as Prisma.InputJsonValue,
        ...getAuditRequestMeta(request),
      },
    });

    return NextResponse.json({ success: true, restoredKeys: keys });
  } catch (error) {
    console.error('Settings rollback error:', error);
    return NextResponse.json({ error: 'Rollback başarısız' }, { status: 500 });
  }
}
