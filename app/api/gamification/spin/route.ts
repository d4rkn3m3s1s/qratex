/**
 * Günlük çark — sunucu otoriter (yalnız CUSTOMER).
 *
 *   GET  → { enabled, dailyLimit, remaining, prizes (ağırlıksız), resetAt }
 *   POST → hak varsa sunucuda ağırlıklı çekiliş + `mintPoints`; yanıtta gerçekten
 *          kredilenen puan/XP, yeni bakiye ve kalan hak. `Idempotency-Key` desteklenir
 *          (aynı anahtarla tekrar gönderim ikinci kez çevirmez).
 *
 * Gün sınırı Europe/Istanbul; mantık `lib/customer-home/spin.ts`'te (Ana Sayfa BFF'i de kullanır).
 */
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getSpinStatus, performSpin } from '@/lib/customer-home/spin';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'gamification.spin.status', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    const status = await getSpinStatus(user.id);
    if (!status) {
      return ok({ enabled: false, canSpin: false, dailyLimit: 0, remaining: 0, remainingToday: 0, prizes: [], resetAt: null }, { legacySpread: true });
    }
    return ok(
      { enabled: true, canSpin: status.remaining > 0, ...status, remainingToday: status.remaining },
      { legacySpread: true }
    );
  }
);

export const POST = defineRoute(
  { name: 'gamification.spin', roles: ['CUSTOMER'], rateLimit: { max: 10, windowMs: 60_000, by: 'user' }, idempotent: true },
  async ({ user }) => {
    const outcome = await performSpin(user.id);
    if (outcome.kind === 'disabled') {
      throw new ApiError('MODULE_DISABLED', 'Günlük çark şu an kapalı.');
    }
    if (outcome.kind === 'limit') {
      throw new ApiError('CONFLICT', 'Bugünkü çevirme hakkını kullandın. Yarın yeni hakkın açılır.', {
        details: { reason: 'DAILY_LIMIT' },
      });
    }
    return ok(
      {
        prize: outcome.prize,
        credited: outcome.credited,
        balance: outcome.balance,
        level: outcome.level,
        isLevelUp: outcome.isLevelUp,
        remaining: outcome.remaining,
        remainingToday: outcome.remaining,
        dailyLimit: outcome.dailyLimit,
        resetAt: outcome.resetAt,
        canSpin: outcome.remaining > 0,
      },
      { legacySpread: true }
    );
  }
);
