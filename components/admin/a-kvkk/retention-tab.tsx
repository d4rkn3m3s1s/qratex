'use client';

/**
 * Saklama ve imha — süresi OTOMATİK uygulanan kurallar (günlük temizlik), her birinde süresi dolmuş
 * ve bir sonraki çalışmada silinecek satır sayısı; yalnız politika olarak yazılı süreler ayrıca
 * listelenir (dürüstlük: "uygulanıyor" ile "yazılı" karışmaz). Temizlik işlerinin son durumu
 * günlük orkestratörün kalıcı izinden okunur.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { InlineError, QueryState, TONE_CHIP, type Tone } from '@/components/states';
import { cn } from '@/lib/utils';
import type { CronJobView } from '@/lib/admin-privacy/contract';
import { fetchRetention } from './api';
import { formatDateTime, formatDays, formatNumber, relativeFromNow } from './format';

function jobTone(j: CronJobView): { tone: Tone; label: string; Icon: typeof CheckCircle2 } {
  if (!j.lastRunAt) return { tone: 'neutral', label: 'Kayıt yok', Icon: HelpCircle };
  if (j.lastStatus === 'ok' && !j.consecutiveFailures) return { tone: 'success', label: 'Başarılı', Icon: CheckCircle2 };
  return { tone: 'danger', label: 'Hatalı', Icon: AlertTriangle };
}

export function RetentionTab() {
  const query = useQuery({ queryKey: ['admin-privacy', 'retention'], queryFn: fetchRetention, staleTime: 60_000 });

  return (
    <QueryState query={query} skeleton="table" error={{ title: 'Saklama bilgisi yüklenemedi' }}>
      {(d) => (
        <div className="flex flex-col gap-6">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin motion-reduce:animate-none')} aria-hidden />
              Yenile
            </Button>
          </div>
          {d.errors.length > 0 ? (
            <InlineError variant="banner">Bazı sayılar okunamadı: {d.errors.join(' · ')}</InlineError>
          ) : null}

          <SectionCard title="Temizlik işleri" description="Günlük orkestratörün son çalışmaları (Europe/Istanbul)." density="flush">
            {d.jobs.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-fg-muted">İş durumu okunamadı.</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.jobs.map((j) => {
                  const t = jobTone(j);
                  return (
                    <li key={j.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-fg">{j.label}</span>
                        <code className="ml-2 font-mono text-xs text-fg-subtle">{j.name}</code>
                        {j.lastError ? <span className="mt-1 block text-xs text-danger">{j.lastError}</span> : null}
                      </span>
                      <span className="text-xs text-fg-muted">
                        Son başarılı: {j.lastOkAt ? `${formatDateTime(j.lastOkAt)} (${relativeFromNow(j.lastOkAt)})` : '—'}
                      </span>
                      <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONE_CHIP[t.tone])}>
                        <t.Icon className="h-3 w-3" aria-hidden />
                        {t.label}
                        {j.consecutiveFailures ? ` · ${j.consecutiveFailures} ardışık hata` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Otomatik uygulanan saklama süreleri"
            description="Süresi dolan satırlar her gün silinir. “Bekleyen” sütunu şu an süresi dolmuş ve bir sonraki çalışmada silinecek satır sayısıdır; sürekli büyüyorsa iş çalışmıyordur."
            density="flush"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Otomatik saklama kuralları</caption>
                <thead className="border-y border-border bg-surface-muted/50 text-left text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">Kayıt</th>
                    <th scope="col" className="px-4 py-2 font-medium">Süre</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Bekleyen</th>
                    <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">Hukuki sebep</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.rules.map((r) => (
                    <tr key={r.key}>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <code className="font-mono text-xs text-fg">{r.model}</code>
                        <span className="block text-[11px] text-fg-subtle">alan: {r.field}</span>
                      </th>
                      <td className="px-4 py-3 text-fg">{formatDays(r.days)}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums', r.pending ? 'text-warning' : 'text-fg')}>
                        {r.pending == null ? 'sayılamadı' : formatNumber(r.pending)}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-fg-muted sm:table-cell">{r.legalBasis}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <code className="font-mono text-xs text-fg">AnalyticsEvent</code>
                      <span className="block text-[11px] text-fg-subtle">analitik ve erişim engeli olayları</span>
                    </th>
                    <td className="px-4 py-3 text-fg">{formatDays(d.analytics.days)}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', d.analytics.pending ? 'text-warning' : 'text-fg')}>
                      {d.analytics.pending == null ? 'sayılamadı' : formatNumber(d.analytics.pending)}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-fg-muted sm:table-cell">Meşru menfaat (m.5/2-f)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Yalnız politika olarak yazılı süreler"
            description="Bu kayıtların süresi envanterde yazılı ama otomatik silme yok; süre sonunda imha elle ya da ilgili akışla yapılır."
            density="flush"
          >
            {d.policies.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-fg-muted">Politika-yalnız süre yok; bütün süreler otomatik uygulanıyor.</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.policies.map((p) => (
                  <li key={p.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                    <code className="font-mono text-xs text-fg sm:w-56">{p.key}</code>
                    <span className="text-sm text-fg sm:w-24">{formatDays(p.days)}</span>
                    <span className="flex-1 text-xs text-fg-muted">
                      {p.legalBasis}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <p className="text-xs text-fg-subtle">Ölçüm: {formatDateTime(d.generatedAt)}</p>
        </div>
      )}
    </QueryState>
  );
}
