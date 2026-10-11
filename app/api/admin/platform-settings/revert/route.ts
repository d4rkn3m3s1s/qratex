/**
 * POST /api/admin/platform-settings/revert — tek bir ayar değişikliğini geri alır.
 * `dryRun: true` → yalnız önizleme (şimdiki / geri yüklenecek değer + sürüm). Gerçek geri alma
 * önizlemedeki sürümle yapılır (araya giren kayıt 409). Yalnız standart kayıtlar kabul edilir (B3).
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { actorFromSession } from '@/lib/data-safety/audit';
import { platformRevertSchema } from '@/lib/platform-settings/registry';
import { revertPlatformSetting } from '@/lib/platform-settings/server';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  { name: 'admin.platformSettings.revert', roles: ['ADMIN'], schema: platformRevertSchema, rateLimit: 'mutation' },
  async ({ body, session, request }) => ok(await revertPlatformSetting({ actor: actorFromSession(session), request }, body))
);
