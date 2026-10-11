/**
 * GET/POST /api/user/ui-seen — onboarding / karşılama videosu "görüldü" bayrakları (sunucu kopyası).
 * Saklama: Settings.user_settings_<id>.uiSeen (bkz. lib/ui-seen.ts). Yazım atomik jsonb birleştirme;
 * diğer ayar anahtarları (notifications/preferences) korunur. İlk görülme zamanı ezilmez.
 */
import { z } from 'zod';
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { userSettingsKey } from '@/lib/customer-settings/preferences';
import { UI_SEEN_FLAGS, readUiSeen } from '@/lib/ui-seen';

export const dynamic = 'force-dynamic';

const ROLES = ['CUSTOMER', 'DEALER', 'STAFF', 'ADMIN'] as const;

export const GET = defineRoute(
  { name: 'user.ui_seen.get', roles: ROLES },
  async ({ user }) => {
    const row = await prisma.settings.findUnique({ where: { key: userSettingsKey(user.id) }, select: { value: true } });
    return ok({ seen: readUiSeen(row?.value) });
  },
);

export const POST = defineRoute(
  {
    name: 'user.ui_seen.mark',
    roles: ROLES,
    schema: z.object({ flag: z.enum(UI_SEEN_FLAGS) }),
    rateLimit: { max: 20, windowMs: 60_000, by: 'user' },
    maxBodyBytes: 1_000,
  },
  async ({ user, body }) => {
    const key = userSettingsKey(user.id);
    const patch = JSON.stringify({ [body.flag]: new Date().toISOString() });
    // Mevcut uiSeen değeri SAĞDA → ilk görülme zamanı korunur.
    await prisma.$executeRaw`
      INSERT INTO "Settings" ("id", "key", "value", "category", "updatedAt")
      VALUES (${`uiseen_${user.id}`}, ${key}, jsonb_build_object('uiSeen', ${patch}::jsonb), 'user', NOW())
      ON CONFLICT ("key") DO UPDATE SET
        "value" = CASE WHEN jsonb_typeof("Settings"."value") = 'object' THEN "Settings"."value" ELSE '{}'::jsonb END
          || jsonb_build_object('uiSeen',
               ${patch}::jsonb
               || CASE WHEN jsonb_typeof("Settings"."value"->'uiSeen') = 'object' THEN "Settings"."value"->'uiSeen' ELSE '{}'::jsonb END),
        "updatedAt" = NOW()`;
    return ok({ flag: body.flag });
  },
);
