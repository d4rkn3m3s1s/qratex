/**
 * Güven Birleştir — kayıt defteri girdisi (istemci güvenli).
 *
 * KORU (§7.3 #14): skor birimi (karo değeri) başarımlar için normalize edilecek.
 *
 * OYUN AJANI: v2'ye taşırken `component`'i `{ contract: 'v2', load }` yap, doğrulayıcıyı
 * `./trust-merge.server.ts`'e yaz. Sözleşme: lib/games/README.md
 */
import { defineGame } from './types';

export const trustMergeGame = defineGame({
  id: 'trust-merge',
  gameType: 'trust-merge',
  title: 'Güven Birleştir',
  tagline:
    'Aynı güven rozetlerini kaydırıp birleştir: 2 → 4 → 8… en yükseğe taşı.',
  emoji: '🔢',
  accent: '#f59e0b',
  status: 'live',
  role: 'puzzle',
  verification: 'deterministic',
  // Eski sözleşmeli bileşen pratik modunu bilmiyor; v2'ye taşınınca true.
  modes: { practice: false, ranked: { attemptsPerDay: 1 } },
  component: {
    contract: 'legacy',
    load: () => import('@/components/customer/games/trust-merge-game').then((m) => m.TrustMergeGame),
  },
  controls: 'Ok tuşları / WASD ya da kaydırma.',
});
