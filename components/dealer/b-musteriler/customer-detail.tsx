'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellOff, BellRing, Clock, Gift, Lightbulb, MessageSquareReply, MessageSquareText, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { KeyValueList, StatusBadge, Timeline } from '@/components/ds/data';
import { announce } from '@/components/ds/a11y';
import { InlineError, QueryState } from '@/components/states';
import type { CustomerDetail, CustomerSignal } from '@/lib/dealer-customers/types';
import { customerKeys, fetchDetail, replyToSignal } from './api';
import { useCustomersCopy } from './copy';
import { useCustomersActions } from './context';
import { CustomerAvatar, RiskPill, TagChips, useDisplayName, useFormat } from './parts';

/** 360 çekmecesi gövdesi — kendi sorgusu + QueryState (hata ≠ boş). */
export function CustomerDetailBody({ refId }: { refId: string }) {
  const copy = useCustomersCopy();
  const q = useQuery({ queryKey: customerKeys.detail(refId), queryFn: () => fetchDetail(refId), staleTime: 30_000 });
  return (
    <QueryState query={q} skeleton="detail" error={{ title: copy.detailLoadError }} isEmpty={() => false}>
      {(d) => <DetailView d={d} />}
    </QueryState>
  );
}

export function useDetailTitle(refId: string): string {
  const copy = useCustomersCopy();
  const display = useDisplayName();
  const q = useQuery({ queryKey: customerKeys.detail(refId), queryFn: () => fetchDetail(refId), staleTime: 30_000 });
  return q.data ? display(q.data) : copy.detailTitle;
}

function DetailView({ d }: { d: CustomerDetail }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const display = useDisplayName();
  const { compose, canSend } = useCustomersActions();
  const name = display(d);
  const audience = { kind: 'customers' as const, refs: [d.ref] };
  const sendBlocked = !canSend || !d.reachable || d.contactedRecently;
  const unanswered = d.signals.find((s) => !s.replied && (s.rating <= 2 || s.sentiment === 'negative' || (s.churnRisk ?? 0) >= 0.3));

  const nextText =
    d.suggestion === 'reply'
      ? copy.nextReply
      : d.suggestion === 'personal_offer'
        ? copy.nextOffer
        : d.suggestion === 'winback'
          ? copy.nextWinback
          : d.suggestion === 'thanks'
            ? copy.nextThanks
            : d.suggestion === 'welcome'
              ? copy.nextWelcome
              : copy.nextNone;

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <CustomerAvatar name={d.name} image={d.image} anonymized={d.anonymized} className="h-12 w-12" />
        <div className="min-w-0 flex-1 space-y-1.5">
          {d.email && <p className="qx-small truncate text-fg-muted">{d.email}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <RiskPill level={d.risk} value={d.predictedChurn} />
            <TagChips tags={d.tags} max={5} />
            {d.trustTier === 'trusted' && <StatusBadge label={copy.trusted} tone="success" size="sm" />}
          </div>
        </div>
      </header>

      <KeyValueList
        layout="grid"
        columns={2}
        items={[
          { label: copy.kvSpend, value: fmt.money2(d.totalSpent) },
          { label: copy.kvVisits, value: fmt.number(d.totalVisits) },
          { label: copy.kvAvg, value: fmt.money2(d.avgOrderValue) },
          { label: copy.kvRhythm, value: d.rhythmDays ? copy.kvRhythmValue(d.rhythmDays) : null },
          { label: copy.kvFirst, value: fmt.date(d.firstVisitAt) },
          { label: copy.kvLast, value: d.lastPurchaseAt ? `${fmt.date(d.lastPurchaseAt)} · ${fmt.days(d.daysSinceLast)}` : null },
          { label: copy.kvRating, value: d.avgRating != null ? copy.kvRatingValue(d.avgRating, d.reviewCount) : null, span: 2 },
        ]}
      />

      {d.reasons.length > 0 && (
        <section aria-labelledby="why-title" className="space-y-2">
          <h3 id="why-title" className="qx-small font-semibold text-fg">
            {copy.whyTitle}
          </h3>
          <ul className="space-y-1.5">
            {d.reasons.map((r) => (
              <li key={r} className="qx-small flex gap-2 text-fg">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="next-title" className="space-y-3 rounded-card border border-subtle bg-surface-muted p-4">
        <h3 id="next-title" className="qx-small flex items-center gap-2 font-semibold text-fg">
          <Lightbulb className="h-4 w-4 text-brand" aria-hidden />
          {copy.nextTitle}
        </h3>
        <p className="qx-small text-fg">{nextText}</p>
        <p className="qx-caption flex items-center gap-1.5 text-fg-muted">
          {d.reachable ? <BellRing className="h-3.5 w-3.5" aria-hidden /> : <BellOff className="h-3.5 w-3.5" aria-hidden />}
          {d.reachable ? copy.reachableYes : copy.reachableNo}
        </p>
        {d.lastContactAt && (
          <p className="qx-caption flex items-center gap-1.5 text-fg-muted">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {d.contactedRecently ? copy.contactedRecently(fmt.relative(d.lastContactAt)) : copy.lastContact(fmt.relative(d.lastContactAt))}
          </p>
        )}
        {d.openOffer && <StatusBadge label={copy.openOffer} tone="warning" size="sm" />}
        {unanswered && d.suggestion === 'reply' && <ReplyBox signal={unanswered} refId={d.ref} />}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={d.suggestion === 'personal_offer' ? 'default' : 'outline'}
            className="min-h-11"
            disabled={sendBlocked || !!d.openOffer}
            onClick={() => compose({ audience, audienceLabel: name, type: 'personal_offer' })}
          >
            <Gift className="h-4 w-4" aria-hidden />
            {copy.bulkOffer}
          </Button>
          <Button
            size="sm"
            variant={d.suggestion === 'winback' || d.suggestion === 'thanks' || d.suggestion === 'welcome' ? 'default' : 'outline'}
            className="min-h-11"
            disabled={sendBlocked}
            onClick={() =>
              compose({
                audience,
                audienceLabel: name,
                type: 'message',
                template: d.suggestion === 'thanks' ? 'thanks' : d.suggestion === 'welcome' ? 'welcome' : d.band ? 'winback' : 'checkin',
              })
            }
          >
            <MessageSquareText className="h-4 w-4" aria-hidden />
            {copy.bulkMessage}
          </Button>
        </div>
        {!canSend && <p className="qx-caption text-fg-muted">{copy.ownerOnly}</p>}
      </section>

      <section aria-labelledby="signals-title" className="space-y-3">
        <h3 id="signals-title" className="qx-small font-semibold text-fg">
          {copy.signalsTitle}
        </h3>
        {d.signals.length === 0 ? (
          <p className="qx-small text-fg-muted">{copy.signalsEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {d.signals.map((s) => (
              <SignalItem key={`${s.type}-${s.id}`} s={s} refId={d.ref} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="timeline-title" className="space-y-3">
        <h3 id="timeline-title" className="qx-small font-semibold text-fg">
          {copy.timelineTitle}
        </h3>
        <Timeline
          dense
          groupByDay
          ariaLabel={copy.timelineTitle}
          emptyLabel={copy.timelineEmpty}
          events={d.timeline.map((t) => ({ id: t.id, at: t.at, title: t.title, description: t.detail ?? undefined, tone: t.tone }))}
        />
      </section>
    </div>
  );
}

function SignalItem({ s, refId }: { s: CustomerSignal; refId: string }) {
  const copy = useCustomersCopy();
  const fmt = useFormat();
  const [replying, setReplying] = useState(false);
  return (
    <li className="space-y-2 rounded-control border border-subtle bg-surface-1 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="qx-caption text-fg-muted">{s.type === 'feedback' ? copy.feedbackType : copy.reviewType}</span>
        <span className="qx-small inline-flex items-center gap-1 font-medium text-fg">
          <Star className="h-3.5 w-3.5 text-warning" aria-hidden />
          {s.rating}/5
        </span>
        {s.churnRisk != null && <RiskPill level={s.churnRisk >= 0.5 ? 'high' : s.churnRisk >= 0.3 ? 'medium' : 'low'} value={s.churnRisk} />}
        {s.intent && copy.intent[s.intent] && <StatusBadge label={copy.intent[s.intent]!} tone={s.intent === 'complaint' ? 'danger' : s.intent === 'praise' ? 'success' : 'neutral'} icon={null} size="sm" />}
        {s.urgent && <StatusBadge label={copy.urgent} tone="danger" size="sm" />}
        <StatusBadge label={s.replied ? copy.signalReplied : copy.signalOpen} tone={s.replied ? 'success' : 'warning'} size="sm" />
        <time className="qx-caption ml-auto text-fg-muted" dateTime={s.at}>
          {fmt.relative(s.at)}
        </time>
      </div>
      {s.text && <p className="qx-small whitespace-pre-line text-fg">{s.text}</p>}
      {s.reply && (
        <p className="qx-caption border-l-2 border-subtle pl-2 text-fg-muted">
          <MessageSquareReply className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {s.reply}
        </p>
      )}
      {!s.replied &&
        (replying ? (
          <ReplyBox signal={s} refId={refId} onDone={() => setReplying(false)} />
        ) : (
          <Button size="sm" variant="ghost" className="min-h-11 px-2" onClick={() => setReplying(true)}>
            <MessageSquareReply className="h-4 w-4" aria-hidden />
            {copy.reply}
          </Button>
        ))}
    </li>
  );
}

/** Kapalı döngü: yanıt mevcut Gelen Kutusu ucuna gider (QR ve tüketim yorumu ortak). */
function ReplyBox({ signal, refId, onDone }: { signal: CustomerSignal; refId: string; onDone?: () => void }) {
  const copy = useCustomersCopy();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const id = `reply-${signal.type}-${signal.id}`;
  const m = useMutation({
    mutationFn: () => replyToSignal(signal.id, signal.type, text.trim()),
    onSuccess: () => {
      toast.success(copy.replySent);
      announce(copy.replySent);
      setText('');
      void qc.invalidateQueries({ queryKey: customerKeys.detail(refId) });
      void qc.invalidateQueries({ queryKey: customerKeys.risk() });
      onDone?.();
    },
  });
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="sr-only">
        {copy.reply}
      </Label>
      <Textarea id={id} rows={3} value={text} maxLength={2000} placeholder={copy.replyPlaceholder} onChange={(e) => setText(e.target.value)} />
      {m.isError && <InlineError>{(m.error as Error).message}</InlineError>}
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button size="sm" variant="ghost" className="min-h-11" onClick={onDone} disabled={m.isPending}>
            {copy.cancel}
          </Button>
        )}
        <Button size="sm" className="min-h-11" onClick={() => m.mutate()} disabled={!text.trim()} loading={m.isPending}>
          {copy.replySend}
        </Button>
      </div>
    </div>
  );
}


