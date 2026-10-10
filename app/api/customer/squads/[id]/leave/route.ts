/**
 * POST — klandan ayrıl (P0-20 + customer_squads.md Bulgu 1/6).
 * Lider ayrılırsa klan SİLİNMEZ: liderlik en eski uygun üyeye devredilir. Klan yalnız son üye
 * ayrıldığında kapanır; açık savaşları önce iadeli iptal edilir (escrow kaybolmaz).
 * Aktif savaş varken ayrılan üye o savaşın ödül payından vazgeçer (kadrodan çıkar).
 */
import { z } from 'zod';
import { defineRoute, ok, ApiError } from '@/lib/http/define-route';
import { leaveSquad, SquadLifecycleError } from '@/lib/squad-battle-service';
import { squadError } from '@/lib/squads/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    name: 'customer.squads.leave',
    roles: ['CUSTOMER'],
    module: 'squads',
    rateLimit: 'mutation',
    params: z.object({ id: z.string().min(1).max(64) }),
  },
  async ({ user, params }) => {
    let result;
    try {
      result = await leaveSquad({ squadId: params.id, userId: user.id });
    } catch (err) {
      if (err instanceof SquadLifecycleError) throw new ApiError('CONFLICT', err.message);
      throw err;
    }
    if (result.kind === 'not_member') throw squadError('NOT_SQUAD_MEMBER');

    const message =
      result.kind === 'ownership_transferred'
        ? 'Klandan ayrıldın; liderlik en eski üyeye devredildi.'
        : result.kind === 'dissolved'
          ? result.refunded > 0
            ? `Son üye olarak ayrıldın; klan kapandı ve açık savaşlar iptal edilerek ${result.refunded.toLocaleString('tr-TR')} puan iade edildi.`
            : 'Son üye olarak ayrıldın; klan kapandı.'
          : 'Klandan ayrıldın.';
    return ok({ result: result.kind, message }, { legacySpread: true });
  }
);
