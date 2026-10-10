import { defineRoute, ok } from '@/lib/http/define-route';
import { PreferencesPatchSchema } from '@/lib/customer-settings/preferences';
import { writeCustomerPreferences } from '@/lib/customer-settings/write.server';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/customer/me/settings/preferences — alan bazlı tercih yazımı (autosave).
 * Gövde: { language? | showLeaderboard? | highContrast? | reduceAnimations? | colorblindMode? | textScale? }
 * Tek geçersiz alan diğerlerini düşürmez çünkü istemci her anahtarı ayrı gönderir; yine de
 * bilinmeyen alan 400 VALIDATION döner (sessizce yutulmaz).
 */
export const PATCH = defineRoute(
  {
    name: 'customer.me.settings.preferences',
    roles: ['CUSTOMER'],
    schema: PreferencesPatchSchema,
    rateLimit: 'mutation',
  },
  async ({ user, body }) => {
    const { preferences } = await writeCustomerPreferences(user.id, { preferences: body });
    return ok({ preferences });
  },
);
