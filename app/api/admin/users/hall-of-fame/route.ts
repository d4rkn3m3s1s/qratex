import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/** Hiçbir handler ham User satırı döndürmemeli — yalnızca bu güvenli alanlar. */
const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  isHallOfFame: true,
} as const;

export async function GET() {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const users = await prisma.user.findMany({
      where: { isHallOfFame: true },
      select: {
        id: true,
        name: true,
        email: true,
        level: true,
        xp: true,
        biography: true,
      },
    });

    return NextResponse.json({ success: true, users }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: 'Kullanıcılar getirilemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

const patchSchema = z.object({
  userId: z.string().min(1),
  isHallOfFame: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const { userId, isHallOfFame } = parsed.data;

    // Açık select: ham User satırı (password hash, twoFactorSecret, stripe* ,
    // fraud/trust internals) ASLA yanıta sızmamalı.
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isHallOfFame },
      select: PUBLIC_USER_SELECT,
    });

    return NextResponse.json({ success: true, user: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: 'Kullanıcı güncellenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
