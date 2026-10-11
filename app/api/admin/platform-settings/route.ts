/**
 * /api/admin/platform-settings — Platform ayarları BFF (kayıt defteri; defineRoute: ADMIN +
 * kapı + rate limit). GET: değerler + sürümler + bağlam. PATCH: yalnız değişen anahtarlar,
 * anahtar başına zod, iyimser kilit 409, anahtar başına standart denetim kaydı.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { platformSettingsPatchSchema } from '@/lib/platform-settings/registry';
import { getPlatformSettingsState, savePlatformSettings } from '@/lib/platform-settings/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.platformSettings.get', roles: ['ADMIN'], rateLimit: 'read' },
  async () => ok({ state: await getPlatformSettingsState() })
);

export const PATCH = defineRoute(
  { name: 'admin.platformSettings.save', roles: ['ADMIN'], schema: platformSettingsPatchSchema, rateLimit: 'mutation', maxBodyBytes: 20_000 },
  async ({ body, session, request }) =>
    ok({ state: await savePlatformSettings({ actor: actorFromSession(session), request }, body) })
);
