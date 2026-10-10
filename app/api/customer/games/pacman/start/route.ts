import { handleGameStart } from '@/lib/game-routes';
import { MINIGAME } from '@/lib/minigame-config';

export const dynamic = 'force-dynamic';

/**
 * POST — Pacman ("Yıldız Avı") günün denemesini başlatır. Generic oyunlarla AYNI kurallar
 * (lib/game-session.ts): deneme başlangıçta harcanır, kaybedilen/yarım bırakılan deneme
 * oynandı sayılır, admin aç/kapat override'ı geçerli.
 */
export async function POST() {
  return handleGameStart(MINIGAME.gameType);
}
