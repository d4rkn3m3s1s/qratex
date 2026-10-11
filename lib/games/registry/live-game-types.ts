/**
 * Sıralı (ödüllü) denemeye açık sunucu anahtarları (`gameType`) — kayıt defterindeki canlı v2
 * oyunlar (`GAMES`, Yıldız Avı'nın anahtarı tarihsel olarak 'pacman'). Saf veri: route
 * paketine bileşen yükleyicisi ya da etiketli içerik çekmez.
 *
 * Neden: emekli/birleşmiş eski kimlikler (truth-vs-fake, memory-match, combo-tap, …)
 * `lib/minigame-config`'te turnuva rotasyonu kaymasın diye hâlâ `hidden` değil; arayüzleri
 * yok, doğrulayıcıları yok → doğrudan API ile açılan denemede istemcinin beyan ettiği skora
 * puan basılıyordu. `lib/game-routes` bu listede olmayan oyunda start/pratiği reddeder,
 * complete'i kazanılamaz kapatır. Kayıt defteriyle hizası jest'te denetlenir.
 */
export const LIVE_GAME_TYPES: ReadonlySet<string> = new Set([
  'fake-hunter',
  'mind-thief',
  'core-defense',
  'frost-catcher',
  'pacman',
  'data-snake',
  'review-stack',
  'spam-breaker',
  'trust-merge',
  'signal-pipe',
  'daily-word',
  'match-three',
  'venue-quiz',
]);

export function isLiveGameType(gameType: string): boolean {
  return LIVE_GAME_TYPES.has(gameType);
}
