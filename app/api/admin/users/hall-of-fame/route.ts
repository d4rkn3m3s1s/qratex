import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createApiRoute, jsonOk, jsonError } from '@/lib/api-route';

export const dynamic = 'force-dynamic';

/** Hiçbir handler ham User satırı döndürmemeli — yalnızca bu güvenli alanlar. */
const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  isHallOfFame: true,
} as const;

export const GET = createApiRoute(['ADMIN'], async () => {
  const users = await prisma.user.findMany({
    where: { isHallOfFame: true },
    select: { id: true, name: true, email: true, level: true, xp: true, biography: true },
  });
  return jsonOk({ success: true, users });
});

const patchSchema = z.object({
  userId: z.string().min(1),
  isHallOfFame: z.boolean(),
});

export const PATCH = createApiRoute(['ADMIN'], async ({ request }) => {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.errors[0].message, 400);
  const { userId, isHallOfFame } = parsed.data;

  // Açık select: ham User satırı (password hash, twoFactorSecret, stripe*,
  // fraud/trust internals) ASLA yanıta sızmamalı.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isHallOfFame },
    select: PUBLIC_USER_SELECT,
  });
  return jsonOk({ success: true, user: updated });
});
