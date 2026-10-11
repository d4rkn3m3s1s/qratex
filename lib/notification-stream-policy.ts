/**
 * Bildirim akışı (SSE, `/api/dealer/notifications/stream`) politika sabitleri — saf modül.
 *
 * guvenlik-bayi-api O5: eskiden kullanıcı başına bağlantı sınırı yoktu; tek hesap yüzlerce
 * paralel EventSource açıp fonksiyon süresi faturasını büyütebilir ve Prisma bağlantı havuzunu
 * tüketebilirdi. Her akış en fazla `STREAM_LIFETIME_MS` yaşar; kullanıcı başına dakikada
 * `STREAM_OPENS_PER_MINUTE` açılış izni verildiğinde aynı anda açık akış sayısı da pratikte bu
 * sayıyla sınırlanır (sayaç Redis/DB'de, sunucusuz örnekler arasında ortak). Meşru kullanım:
 * sekme başına dakikada ~1 açılış.
 */

// 6 → 20 (kalite kapısı rate-limit-429): sayaç AÇILIŞ sayar; tam sayfa yüklemeyle gezinen bayi
// (yeni sekme, yenileme, panel dışından dönüş) her yüklemede yeni akış açar ve dakikada 6'yı
// meşru kullanımda aşıp 429 alıyordu. Akış 55 sn yaşadığından eşzamanlı açık akış yine ≤ 20.
export const STREAM_OPENS_PER_MINUTE = 20;
/** Sunucu akışı bu süre sonunda kendisi kapatır (maxDuration'dan önce, düzenli yeniden bağlanma). */
export const STREAM_LIFETIME_MS = 55_000;
/** `since` imleci en fazla bu kadar geriye gidebilir (eski imleçle geniş tarama olmasın). */
export const MAX_CURSOR_AGE_MS = 24 * 60 * 60 * 1000;

/** İstemci imlecini [şimdi − 24 sa, şimdi] aralığına kırpar; geçersizse şimdi. */
export function clampStreamCursor(raw: string | null | undefined, now: Date = new Date()): Date {
  const parsed = raw ? new Date(raw) : now;
  if (Number.isNaN(parsed.getTime())) return now;
  const min = now.getTime() - MAX_CURSOR_AGE_MS;
  return new Date(Math.min(now.getTime(), Math.max(min, parsed.getTime())));
}

/** İstemci yeniden bağlanma gecikmesi: 3 sn'den başlar, her başarısız denemede ikiye katlanır, 60 sn tavan. */
export function nextReconnectDelayMs(failures: number): number {
  const n = Math.max(0, Math.floor(failures));
  return Math.min(60_000, 3_000 * 2 ** Math.min(n, 5));
}
