import { handleGameStart } from '@/lib/game-routes';

export const dynamic = 'force-dynamic';

/**
 * POST — Generic mini oyun denemesi başlatır. Günde 1 DENEME (P0-17): deneme başlangıçta
 * harcanır; sunucu tohum + nonce + başlangıç saati + son geçerlilik üretir ve HMAC imzalı
 * `attemptToken` döner. Bugünün denemesi bittiyse (kazanıldı / kaybedildi / yarım
 * bırakıldı) `canPlay:false, alreadyPlayed:true, outcome`. Ayrıntı: lib/game-session.ts
 */
export async function POST(_req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  return handleGameStart(game);
}
