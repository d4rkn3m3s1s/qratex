import { after } from 'next/server';

/**
 * Yanıttan SONRA çalışacak yan etki (e-posta, push, analitik) — tek yardımcı (denetim O4).
 *
 * Neden: `void send().catch(...)` ile ateşle-unut, sunucusuz ortamda yanıt gönderildikten
 * sonra fonksiyon dondurulunca yarıda kalabilir (mail/push hiç gitmez, iz de kalmaz).
 * `after()` işi platformun yaşam döngüsüne bağlar: Vercel yanıtı döndükten sonra işin
 * bitmesini bekler.
 *
 * İstek kapsamı DIŞINDA (test, betik) `after` fırlatır; o zaman iş bekletilmeden başlatılır.
 * Hata yutulur ama `label` ile loglanır — yan etki ana akışı asla bozmaz.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
  const guarded = () =>
    task().catch((err) => {
      console.error(`[after] ${label} başarısız:`, err instanceof Error ? err.message : err);
    });
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
