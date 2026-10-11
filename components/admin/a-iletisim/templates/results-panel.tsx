'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, Eye, Inbox, Loader2, MessageSquareReply, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ds/data';
import { EmptyState, QueryState } from '@/components/states';
import type { ReminderInfo, TemplateStatView } from '@/lib/mail-center/templates-contract';
import { fetchSendHistory, templateKeys } from '../api';
import { fmtAgo, fmtLong } from '../format';
import { AdminIletisimText } from '../copy';

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Send; label: string; value: number; tone?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-control border border-border bg-surface-1 px-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${tone ?? 'text-fg-muted'}`} aria-hidden />
      <span className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums leading-tight text-fg">{value}</span>
        <span className="block truncate text-xs text-fg-muted">{label}</span>
      </span>
    </div>
  );
}

/** Gönderim sonuçları: alıcı yolculuğu (gitti → açtı → yanıtladı / hata) + sayfalı geçmiş. */
export function ResultsPanel({
  templateId,
  stat,
  testStat,
  reminder,
  isTask,
}: {
  templateId: string;
  stat: TemplateStatView | undefined;
  testStat: TemplateStatView | undefined;
  reminder: ReminderInfo | undefined;
  isTask: boolean;
}) {
  const s = stat ?? { sent: 0, opened: 0, errored: 0, replied: 0, lastSentAt: null, recipients: [] };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={Send} label="Gönderildi" value={s.sent} tone="text-success" />
        <Stat icon={Eye} label="Açtı" value={s.opened} tone="text-brand" />
        <Stat icon={MessageSquareReply} label="Yanıtladı" value={s.replied} tone="text-info" />
        <Stat icon={AlertTriangle} label="Hata" value={s.errored} tone={s.errored ? 'text-danger' : undefined} />
      </div>
      {s.lastSentAt && <p className="text-xs text-fg-muted">Son gerçek gönderim: {fmtLong(s.lastSentAt)}</p>}

      {isTask && reminder && (
        <div className="rounded-control border border-border bg-surface-2 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-fg">
            <Clock3 className="h-4 w-4" aria-hidden />
            Son teslim hatırlatması
          </p>
          <p className="mt-1 text-fg-muted">
            {reminder.completed
              ? 'Bugünkü hatırlatma tüm alıcılara gönderildi.'
              : reminder.dueToday
                ? reminder.sentTo.length
                  ? `Bugün gönderiliyor: ${reminder.sentTo.length} alıcıya ulaştı, kalanlar günlük işin sonraki denemesinde.`
                  : 'Son teslim bugün: hatırlatma günlük otomatik işle gönderilecek.'
                : 'Son teslim günü geldiğinde günlük otomatik işle hatırlatma gönderilir (kapatmak için düzenleyicide anahtarı kapatın).'}
          </p>
        </div>
      )}

      <section aria-labelledby={`rcpt-${templateId}`} className="space-y-2">
        <h3 id={`rcpt-${templateId}`} className="text-sm font-semibold text-fg"><AdminIletisimText k="recipients" /></h3>
        {s.recipients.length === 0 ? (
          <EmptyState compact variant="first-use" title="Henüz gerçek gönderim yok" description="Gönderdiğinizde her alıcının durumu burada görünür." />
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {s.recipients.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-fg">{r.email}</span>
                {r.status === 'error' ? (
                  <StatusBadge size="sm" tone="danger" label="Hata" title={r.error ?? undefined} />
                ) : r.openedAt ? (
                  <StatusBadge
                    size="sm"
                    tone={r.openedQuickly ? 'warning' : 'success'}
                    icon={r.openedQuickly ? AlertTriangle : CheckCircle2}
                    label={r.openedQuickly ? 'Açıldı (otomatik olabilir)' : `Açtı · ${fmtAgo(r.openedAt)}`}
                    title={
                      r.openedQuickly
                        ? 'Gönderimden saniyeler sonra açıldı: Apple Mail Gizlilik Koruması ya da güvenlik tarayıcısı ön yüklemesi olabilir.'
                        : `${r.openCount} kez açıldı`
                    }
                  />
                ) : (
                  <StatusBadge size="sm" tone="neutral" label={`Gitti · ${fmtAgo(r.sentAt)}`} />
                )}
                {r.replies > 0 && (
                  <Link
                    href={`/admin/inbox?view=intern&q=${encodeURIComponent(r.email)}`}
                    className="inline-flex min-h-11 items-center gap-1 rounded-chip px-2 text-xs font-medium text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Inbox className="h-3.5 w-3.5" aria-hidden />
                    {r.replies} yanıt · gelen kutusunda aç
                  </Link>
                )}
                {r.status === 'error' && r.error && <p className="w-full text-xs text-danger">{r.error}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-muted">
          Açılma pikseli bazı istemcilerde engellenir ya da otomatik yüklenir; en güvenilir sinyal gelen kutusundaki yanıttır.
        </p>
      </section>

      {testStat && testStat.recipients.length > 0 && (
        <section aria-label="Test gönderimleri" className="space-y-2">
          <h3 className="text-sm font-semibold text-fg"><AdminIletisimText k="testSends" /></h3>
          <ul className="space-y-1 text-sm">
            {testStat.recipients.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-fg-muted">{r.email}</span>
                <StatusBadge
                  size="sm"
                  tone={r.status === 'error' ? 'danger' : r.openedAt ? 'success' : 'neutral'}
                  label={r.status === 'error' ? 'Hata' : r.openedAt ? 'Açıldı' : `Gitti · ${fmtAgo(r.sentAt)}`}
                  title={r.error ?? undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <History templateId={templateId} />
    </div>
  );
}

function History({ templateId }: { templateId: string }) {
  const q = useInfiniteQuery({
    queryKey: templateKeys.history(templateId),
    queryFn: ({ pageParam, signal }) => fetchSendHistory(templateId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <section aria-labelledby={`hist-${templateId}`} className="space-y-2">
      <h3 id={`hist-${templateId}`} className="text-sm font-semibold text-fg"><AdminIletisimText k="sendHistory" /></h3>
      <QueryState query={q} skeleton="list" isEmpty={() => rows.length === 0} empty={{ compact: true, title: 'Geçmiş yok', description: 'Bu şablonla henüz mail gönderilmedi.' }}>
        {() => (
          <ol className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-control px-2 py-1.5 text-sm odd:bg-surface-2">
                <time dateTime={r.sentAt} className="shrink-0 text-xs tabular-nums text-fg-muted">{fmtLong(r.sentAt)}</time>
                <span className="min-w-0 flex-1 truncate text-fg">
                  {r.kind === 'test' ? 'Test → ' : ''}
                  {r.email}
                </span>
                <span className={r.status === 'error' ? 'text-xs text-danger' : 'text-xs text-fg-muted'}>
                  {r.status === 'error' ? `Hata: ${r.error ?? 'bilinmiyor'}` : r.openedAt ? (r.openedQuickly ? 'açıldı (otomatik olabilir)' : 'açtı') : 'gitti'}
                  {r.sentByName ? ` · ${r.sentByName}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </QueryState>
      {q.hasNextPage && (
        <Button variant="ghost" className="min-h-11 w-full" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Daha eski gönderimler
        </Button>
      )}
    </section>
  );
}
