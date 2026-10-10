import { ApiError, defineRoute } from '@/lib/http/define-route';
import { loadWalletCard, WalletUserNotFoundError } from '@/lib/wallet-card/load';

export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/wallet/card — Cüzdan → Kartım BFF'i.
 * Kartlar (tam token yalnız sahibine), statü (lig + gerçekten atanmış VIP), doğum günü anı,
 * yorum bekleyen tüketimler, son işlemler ve cüzdan uygunluğu tek yanıtta (`lib/wallet-card`).
 * Sayfanın sunucu ilk render'ı aynı yükleyiciyi doğrudan çağırır; bu uç istemci yenilemesi içindir.
 */
export const GET = defineRoute(
  { name: 'customer.wallet.card', roles: ['CUSTOMER'], rateLimit: 'read' },
  async ({ user }) => {
    try {
      return await loadWalletCard(user.id);
    } catch (error) {
      if (error instanceof WalletUserNotFoundError) throw new ApiError('NOT_FOUND', 'Kullanıcı bulunamadı.');
      throw error;
    }
  }
);
