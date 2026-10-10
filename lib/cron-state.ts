/**
 * Günlük cron koşularının kalıcı izi (denetim Y1/Y5: "cron sonuçları kalıcı yazılmıyor").
 *
 * Şema değişikliği gerektirmemek için `Settings` tablosunda tek JSON satırı kullanılır:
 *  - her işin son koşusu, son başarılı koşusu, son hatası, ardışık hata sayısı,
 *  - sürmekte olan koşu (fonksiyon öldürülürse "kesildi" olarak görünür),
 *  - son 14 koşunun özeti.
 * Admin gözlem ekranı `getCronStatus()` ile okuyabilir.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CronState, JobStateEntry, RunSummary } from '@/lib/cron-runner';

export const CRON_STATE_KEY = 'cron_daily_state';
const CATEGORY = 'system';

function normalizeState(raw: unknown): CronState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { jobs: {} };
  const o = raw as Record<string, unknown>;
  const jobs: Record<string, JobStateEntry> =
    o.jobs && typeof o.jobs === 'object' && !Array.isArray(o.jobs) ? (o.jobs as Record<string, JobStateEntry>) : {};
  const currentRun =
    o.currentRun && typeof o.currentRun === 'object' && typeof (o.currentRun as { startedAt?: unknown }).startedAt === 'string'
      ? (o.currentRun as CronState['currentRun'])
      : null;
  const history = Array.isArray(o.history) ? (o.history as RunSummary[]) : [];
  return { jobs, currentRun, history };
}

/** Durumu okur. DB erişilemezse fırlatır (çağıran "durum yok" ile devam etmeyi seçebilir). */
export async function loadCronState(): Promise<CronState> {
  const row = await prisma.settings.findUnique({ where: { key: CRON_STATE_KEY }, select: { value: true } });
  return normalizeState(row?.value);
}

export async function saveCronState(state: CronState): Promise<void> {
  const value = JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
  await prisma.settings.upsert({
    where: { key: CRON_STATE_KEY },
    update: { value, category: CATEGORY },
    create: { key: CRON_STATE_KEY, value, category: CATEGORY },
  });
}

export interface CronStatusView {
  lastRun: RunSummary | null;
  running: { startedAt: string } | null;
  jobs: Array<{ name: string } & JobStateEntry>;
  history: RunSummary[];
}

/** Admin paneli için salt okunur görünüm. DB hatasında boş görünüm döner (sayfa patlamasın). */
export async function getCronStatus(): Promise<CronStatusView> {
  try {
    const s = await loadCronState();
    return {
      lastRun: s.history?.[0] ?? null,
      running: s.currentRun && !s.currentRun.finishedAt ? { startedAt: s.currentRun.startedAt } : null,
      jobs: Object.entries(s.jobs)
        .map(([name, e]) => ({ name, ...e }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      history: s.history ?? [],
    };
  } catch {
    return { lastRun: null, running: null, jobs: [], history: [] };
  }
}
