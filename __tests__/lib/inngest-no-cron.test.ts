/**
 * "Tek uyanış" kuralı (P0-40 · denetim K2).
 *
 * Yeniden üretilen hata: `lib/inngest/functions.ts` içinde ~19 periyodik Inngest cron'u vardı
 * (outbox her 2 dk, savaşlar 10 dk, sentetik izleme 15 dk, 6 saatlik iş…) → ~1.100 tetikleme/gün.
 * Inngest canlıysa Neon compute'u hiç uyuyamıyordu (2026-08 duraklatmasının kök nedeni); değilse
 * ekip bakımı, haftalık özet, analitik saklama gibi işler sessizce ölüydü.
 *
 * Bu test iki yönü de korur: Inngest'te periyodik tetikleyici yok ve gerekli işler günlük
 * orkestratörün kayıt defterinde.
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('Inngest yalnız olay tetiklemeli', () => {
  it('lib/inngest/functions.ts içinde cron tetikleyicisi yok', () => {
    const src = read('lib/inngest/functions.ts');
    expect(src).not.toMatch(/\bcron\s*:/);
    expect(src).toMatch(/event:\s*'feedback\/created'/);
  });

  it('/api/inngest yalnız INNGEST_FUNCTIONS listesini sunar', () => {
    const src = read('app/api/inngest/route.ts');
    expect(src).toMatch(/functions:\s*INNGEST_FUNCTIONS/);
    expect(src).not.toMatch(/outboxProcessFn|syntheticMonitorFn|squadBattlesFinishFn/);
  });

  it('dosyalar bozuk (NUL bayt) değil', () => {
    for (const p of ['lib/inngest/functions.ts', 'app/api/inngest/route.ts', 'app/api/cron/daily/jobs.ts']) {
      expect(readFileSync(path.join(root, p)).includes(0)).toBe(false);
    }
  });
});

describe('günlük kayıt defteri', () => {
  const jobs = read('app/api/cron/daily/jobs.ts');
  const names = Array.from(jobs.matchAll(/name:\s*'([a-z0-9-]+)'/g)).map((m) => m[1]);

  it('eski Inngest işlerinden gerekli olanlar günlük kayıtta', () => {
    for (const n of [
      'team-daily-maintenance',
      'negative-feedback-sla',
      'weekly-digest',
      'team-weekly-reminder',
      'business-of-month',
      'analytics-event-cleanup',
      'feature-flag-cleanup',
      'dealer-flash-offer-expiry',
      'seasonal-concept-activation',
      'calculate-clv',
      'churn-intervention',
      'churn-playbook',
      'ai-quality-sample',
      'customer-reminder-nudges',
      'partner-digest-webhook',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('mevcut günlük işler korunuyor', () => {
    for (const n of ['squad-battles', 'cleanup-counters', 'db-cleanup', 'intern-deadline', 'team-task-due', 'inbox-sync', 'ai-retry']) {
      expect(names).toContain(n);
    }
  });

  it('iş adları tekil', () => {
    expect(new Set(names).size).toBe(names.length);
  });

  it('boş yoklama ve yinelenen işler bilerek taşınmadı', () => {
    expect(names).not.toContain('outbox-process');
    expect(names).not.toContain('synthetic-monitor');
    expect(names).not.toContain('rate-limit-cleanup');
    expect(names).not.toContain('squad-battles-finish');
  });

  it('her iç iş ucu bağlı: ya günlük kayıtta ya Inngest olay işlevinde (sahipsiz uç yok)', () => {
    // Arka plan denetimi (uygulama sonrası): taşınmayan `rate-limit-cleanup` ve
    // `squad-battles-finish` uçları hiçbir tetikleyicisi olmadan yetkili POST'a açık kalmıştı.
    const dirs = readdirSync(path.join(root, 'app/api/internal/inngest'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const fns = read('lib/inngest/functions.ts');
    const orphans = dirs.filter((d) => !names.includes(d) && !fns.includes(`/api/internal/inngest/${d}`));
    expect(orphans).toEqual([]);
  });

  it('vercel.json yalnız günlük orkestratörü tetikler', () => {
    const v = JSON.parse(read('vercel.json')) as { crons?: Array<{ path: string; schedule: string }> };
    const crons = v.crons ?? [];
    expect(crons.map((c) => c.path)).toEqual(['/api/cron/daily']);
  });
});
