import { after } from 'next/server';

/**
 * Yanıttan sonra çalışacak yan etki (analitik, push). İstek kapsamı dışında (cron alt işi,
 * test) `after` atarsa iş bekletilmeden başlatılır; hata yutulur ama loglanır.
 */
export function runAfter(label: string, task: () => Promise<unknown>): void {
  const guarded = () =>
    task().catch((err) => {
      console.error(`[dealer-queues] ${label} başarısız:`, err);
    });
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
