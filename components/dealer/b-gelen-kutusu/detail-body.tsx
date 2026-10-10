'use client';

/**
 * Gelen Kutusu detay çekmecesinin gövdesi (yalnız açılınca yüklenir). Üstte yorum ve bağlam,
 * altında yanıt editörü (orijinal yorum görünür hâlde), telafi ve takip (atama / kapatma).
 * Açılınca "görüldü" bir kez işaretlenir (QR; müşteri şeffaf yolculuğu).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Gift,
  History,
  Loader2,
  Lock,
  MessageSquareReply,
  Pencil,
  RotateCcw,
  Sparkles,
  UserCheck,
  UserMinus,
} from 'lucide-react';
import { KeyValueList } from '@/components/ds/data';
import { InlineError, QueryState, SkeletonDetail } from '@/components/states';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fillReplyTemplate, REPLY_MAX } from '@/lib/dealer-inbox/core';
import type { InboxDetail, InboxMeta, InboxSuggestResult } from '@/lib/dealer-inbox/types';
import {
  fetchDetail,
  formatCurrencyTRY,
  formatDateTime,
  formatDay,
  formatPercent,
  InboxFetchError,
  inboxKeys,
  postAction,
  postRemedy,
  postReply,
  postSuggest,
  shouldRetry,
} from './api';
import { useInboxCopy, useInboxLocale } from './copy';
import { Chip, NativeSelect, RatingStars, SentimentChip, SignalChip, SlaChip, SourceIcon } from './parts';

const REMEDY_MAX = 500;

function Section({ title, icon, children, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2 border-t border-subtle pt-4 first:border-t-0 first:pt-0', className)}>
      <h3 className="qx-small flex items-center gap-2 font-semibold text-fg">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return (key?: string) => {
    void qc.invalidateQueries({ queryKey: ['dealer-inbox', 'list'] });
    void qc.invalidateQueries({ queryKey: ['dealer-inbox', 'summary'] });
    if (key) void qc.invalidateQueries({ queryKey: inboxKeys.detail(key) });
  };
}

/* ───────────────────────── Yanıt editörü ───────────────────────── */

function ReplyComposer({ detail, meta, readOnly }: { detail: InboxDetail; meta: InboxMeta | null; readOnly: boolean }) {
  const copy = useInboxCopy();
  const locale = useInboxLocale();
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState(!detail.reply);
  const [text, setText] = useState(detail.reply ?? '');
  const [conflict, setConflict] = useState<{ reply: string | null } | null>(null);
  const [drafts, setDrafts] = useState<InboxSuggestResult | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Kayıt değişince (gezinme ya da yenileme) editör kaydın güncel yanıtıyla eşitlenir.
  useEffect(() => {
    setEditing(!detail.reply);
    setText(detail.reply ?? '');
    setDrafts(null);
  }, [detail.key, detail.reply]);

  const vars = { customerName: detail.anonymous ? null : detail.customerName, product: detail.contextLabel, business: meta?.business.name ?? null };

  const send = useMutation({
    mutationFn: () => postReply(detail.key, text.trim(), detail.reply ?? null),
    onSuccess: (res) => {
      setConflict(null);
      toast.success(res.edited ? copy.editedToast : res.notified ? copy.sentToast : copy.sentNoNotifyToast);
      setEditing(false);
      invalidate(detail.key);
    },
    onError: (err) => {
      if (err instanceof InboxFetchError && err.code === 'REPLY_CONFLICT') {
        const d = (err.details ?? {}) as { currentReply?: string | null };
        setConflict({ reply: d.currentReply ?? null });
        invalidate(detail.key);
        return;
      }
      toast.error(err instanceof Error ? err.message : copy.actionFailed);
    },
  });

  const suggest = useMutation({
    mutationFn: () => postSuggest(detail.key),
    onSuccess: (res) => setDrafts(res),
    onError: (err) => toast.error(err instanceof Error ? err.message : copy.actionFailed),
  });

  const put = (value: string) => {
    setText(value.slice(0, REPLY_MAX));
    setEditing(true);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  if (readOnly) {
    return detail.reply ? (
      <div className="rounded-control border border-subtle bg-surface-muted p-3">
        <p className="qx-small whitespace-pre-wrap break-words text-fg">{detail.reply}</p>
      </div>
    ) : (
      <p className="qx-small text-fg-muted">{copy.readOnlyAdmin}</p>
    );
  }

  return (
    <div className="space-y-3">
      {conflict ? (
        <div role="alert" className="space-y-2 rounded-control border border-warning-border bg-warning-subtle p-3">
          <p className="qx-small flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle aria-hidden className="h-4 w-4" />
            {copy.conflictTitle}
          </p>
          <p className="qx-caption text-fg">{copy.conflictBody}</p>
          {conflict.reply ? <p className="qx-small whitespace-pre-wrap break-words rounded-chip bg-surface-1 p-2 text-fg">{conflict.reply}</p> : null}
        </div>
      ) : null}

      {detail.reply && !editing ? (
        <div className="space-y-2">
          <div className="rounded-control border border-subtle bg-surface-muted p-3">
            <p className="qx-caption mb-1 font-medium text-fg-muted">
              {copy.yourReply}
              {detail.repliedAt ? ` · ${copy.repliedAt(formatDateTime(detail.repliedAt, locale))}` : ''}
            </p>
            <p className="qx-small whitespace-pre-wrap break-words text-fg">{detail.reply}</p>
          </div>
          <Button type="button" variant="outline" className="min-h-11 gap-2 sm:h-9 sm:min-h-9" onClick={() => put(detail.reply ?? '')}>
            <Pencil aria-hidden className="h-4 w-4" />
            {copy.editReply}
          </Button>
        </div>
      ) : (
        <>
          {detail.autoReply && !detail.reply ? (
            <InlineError variant="banner" tone="info">
              {copy.autoReplyHint(detail.autoReply.ruleName)}
            </InlineError>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <NativeSelect
              label={copy.templates}
              className="min-w-[12rem] flex-1"
              value=""
              disabled={!meta || meta.templates.length === 0}
              onChange={(e) => {
                const t = meta?.templates.find((x) => x.id === e.target.value);
                if (t) put(fillReplyTemplate(t.body, vars, locale));
              }}
            >
              <option value="">{copy.templatePick}</option>
              {(meta?.templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2 sm:h-10 sm:min-h-10"
              disabled={suggest.isPending || meta?.aiEnabled === false}
              onClick={() => suggest.mutate()}
              aria-describedby={`ai-hint-${detail.key}`}
            >
              {suggest.isPending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden className="h-4 w-4" />}
              {suggest.isPending ? copy.aiDrafting : copy.aiDrafts}
            </Button>
          </div>
          <p id={`ai-hint-${detail.key}`} className="qx-caption text-fg-muted">
            {meta?.aiEnabled === false ? copy.aiUnavailable.ai_disabled : copy.aiDraftHint}
          </p>
          {meta && meta.templates.length === 0 ? <p className="qx-caption text-fg-muted">{copy.noTemplates}</p> : null}

          {drafts ? (
            drafts.source === 'ai' ? (
              <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label={copy.aiDrafts}>
                {drafts.drafts.map((d, i) => {
                  const tone = copy.aiTones[i] ?? `#${i + 1}`;
                  return (
                    <li key={i} className="w-64 shrink-0 snap-start">
                      <button
                        type="button"
                        onClick={() => put(d)}
                        aria-label={copy.aiDraftUse(tone)}
                        className="flex h-full min-h-11 w-full flex-col gap-1 rounded-control border border-subtle bg-surface-1 p-2.5 text-left transition-colors duration-fast hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="qx-caption inline-flex items-center gap-1 font-semibold text-brand">
                          <Bot aria-hidden className="h-3 w-3" />
                          {tone}
                        </span>
                        <span className="qx-caption line-clamp-4 text-fg">{d}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <InlineError variant="banner" tone="warning">
                {copy.aiUnavailable[drafts.reason ?? 'no_result'] ?? copy.aiUnavailable.no_result}
              </InlineError>
            )
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && !send.isPending) send.mutate();
            }}
            className="space-y-2"
          >
            <label htmlFor={`reply-${detail.key}`} className="qx-small font-medium text-fg">
              {copy.replyLabel}
            </label>
            <textarea
              id={`reply-${detail.key}`}
              ref={areaRef}
              value={text}
              maxLength={REPLY_MAX}
              rows={5}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) {
                  e.preventDefault();
                  send.mutate();
                }
              }}
              placeholder={copy.replyPlaceholder}
              aria-describedby={`reply-count-${detail.key}`}
              className="qx-small w-full resize-y rounded-control border border-strong bg-surface-1 p-3 text-fg placeholder:text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id={`reply-count-${detail.key}`} className={cn('qx-caption qx-num', text.length >= REPLY_MAX ? 'text-danger' : 'text-fg-muted')}>
                {copy.replyCounter(text.length, REPLY_MAX)}
              </span>
              <div className="flex gap-2">
                {detail.reply ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 sm:h-10 sm:min-h-10"
                    onClick={() => {
                      setEditing(false);
                      setText(detail.reply ?? '');
                      setConflict(null);
                    }}
                  >
                    {copy.cancel}
                  </Button>
                ) : null}
                <Button type="submit" className="min-h-11 gap-2 sm:h-10 sm:min-h-10" disabled={!text.trim() || send.isPending}>
                  {send.isPending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <MessageSquareReply aria-hidden className="h-4 w-4" />}
                  {send.isPending ? copy.sending : detail.reply ? copy.saveEdit : copy.send}
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Telafi ───────────────────────── */

function RemedyPanel({ detail, readOnly }: { detail: InboxDetail; readOnly: boolean }) {
  const copy = useInboxCopy();
  const locale = useInboxLocale();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => postRemedy(detail.key, message, queue),
    onSuccess: (res) => {
      setError(null);
      setOpen(false);
      setMessage('');
      toast.success(res.queuedForApproval ? copy.remedyQueued : copy.remedySent);
      invalidate(detail.key);
    },
    onError: (err) => setError(err instanceof Error ? err.message : copy.actionFailed),
  });

  const reason = detail.remedy.reason;
  return (
    <div className="space-y-3">
      {detail.remedies.length > 0 ? (
        <ul className="space-y-1.5" aria-label={copy.remedyHistory}>
          {detail.remedies.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <Chip tone={r.status === 'accepted' ? 'success' : r.status === 'awaiting_dealer_approval' ? 'warning' : 'neutral'}>
                {copy.remedyStatus[r.status]}
              </Chip>
              <span className="qx-caption text-fg-muted">
                {formatDay(r.createdAt, locale)}
                {r.selectionLabel ? ` · ${r.selectionLabel}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {!detail.remedy.allowed ? (
        <p className="qx-caption flex items-center gap-1.5 text-fg-muted">
          <Lock aria-hidden className="h-3.5 w-3.5" />
          {reason ? copy.remedyBlocked[reason] : null}
        </p>
      ) : readOnly ? null : open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!create.isPending) create.mutate();
          }}
          className="space-y-2 rounded-control border border-subtle p-3"
        >
          <label htmlFor={`remedy-${detail.key}`} className="qx-small font-medium text-fg">
            {copy.remedyMessage}
          </label>
          <textarea
            id={`remedy-${detail.key}`}
            value={message}
            maxLength={REMEDY_MAX}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            aria-describedby={`remedy-hint-${detail.key}`}
            className="qx-small w-full resize-y rounded-control border border-strong bg-surface-1 p-2.5 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p id={`remedy-hint-${detail.key}`} className="qx-caption flex justify-between gap-2 text-fg-muted">
            <span>{copy.remedyMessageHint}</span>
            <span className="qx-num">{copy.replyCounter(message.length, REMEDY_MAX)}</span>
          </p>
          <label className="qx-small flex min-h-11 cursor-pointer items-center gap-2.5 text-fg">
            <input
              type="checkbox"
              checked={queue}
              onChange={(e) => setQueue(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
            />
            {copy.remedyQueue}
          </label>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="min-h-11 sm:h-10 sm:min-h-10" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit" className="min-h-11 gap-2 sm:h-10 sm:min-h-10" disabled={create.isPending}>
              {create.isPending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Gift aria-hidden className="h-4 w-4" />}
              {copy.remedySubmit}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" className="min-h-11 gap-2 sm:h-10 sm:min-h-10" onClick={() => setOpen(true)}>
          <Gift aria-hidden className="h-4 w-4" />
          {copy.remedyStart}
        </Button>
      )}
      {detail.remedies.some((r) => r.status === 'awaiting_dealer_approval') ? (
        <Link href="/dealer/inbox/remedy" className="qx-small inline-flex min-h-11 items-center font-medium text-brand underline-offset-2 hover:underline">
          {copy.remedyGoQueue}
        </Link>
      ) : null}
    </div>
  );
}

/* ───────────────────────── Takip (atama / kapatma) ───────────────────────── */

function CasePanel({ detail, meta, readOnly }: { detail: InboxDetail; meta: InboxMeta | null; readOnly: boolean }) {
  const copy = useInboxCopy();
  const invalidate = useInvalidate();
  const current = detail.case && detail.case.status !== 'resolved' ? detail.case.assignee?.id ?? '' : '';
  const [assignee, setAssignee] = useState(current);
  useEffect(() => setAssignee(current), [current]);

  const act = useMutation({
    mutationFn: (v: { action: 'resolve' | 'reopen' | 'assign' | 'unassign'; assigneeId?: string }) =>
      postAction([detail.key], v.action, v.assigneeId),
    onSuccess: (res, v) => {
      const r = res.results[0];
      if (!r?.ok) {
        toast.error(r?.error ?? copy.actionFailed);
        return;
      }
      if (v.action === 'resolve') toast.success(copy.resolvedToast);
      else if (v.action === 'reopen') toast.success(copy.reopenedToast);
      else if (v.action === 'assign') toast.success(copy.assignedToast(meta?.assignees.find((a) => a.id === v.assigneeId)?.name ?? ''));
      else toast.success(copy.unassignedToast);
      invalidate(detail.key);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : copy.actionFailed),
  });

  const resolved = detail.status === 'resolved';
  return (
    <div className="space-y-3">
      {detail.case ? (
        <p className="qx-small flex flex-wrap items-center gap-2 text-fg">
          <Chip tone={detail.case.status === 'resolved' ? 'success' : 'brand'}>{copy.caseStatus[detail.case.status]}</Chip>
          {detail.case.assignee && !resolved ? <span>{copy.assignedTo(detail.case.assignee.name)}</span> : null}
        </p>
      ) : null}
      {readOnly ? null : (
        <>
          {!resolved ? (
            <div className="flex flex-wrap items-end gap-2">
              <NativeSelect label={copy.assignee} className="min-w-[12rem] flex-1" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">{copy.unassigned}</option>
                {(meta?.assignees ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2 sm:h-10 sm:min-h-10"
                disabled={act.isPending || assignee === current}
                onClick={() => act.mutate(assignee ? { action: 'assign', assigneeId: assignee } : { action: 'unassign' })}
              >
                {assignee ? <UserCheck aria-hidden className="h-4 w-4" /> : <UserMinus aria-hidden className="h-4 w-4" />}
                {assignee ? copy.assign : copy.unassign}
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant={resolved ? 'outline' : 'secondary'}
            className="min-h-11 gap-2 sm:h-10 sm:min-h-10"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: resolved ? 'reopen' : 'resolve' })}
          >
            {resolved ? <RotateCcw aria-hidden className="h-4 w-4" /> : <CheckCircle2 aria-hidden className="h-4 w-4" />}
            {resolved ? copy.reopen : copy.resolve}
          </Button>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Gövde ───────────────────────── */

function DetailContent({
  detail,
  meta,
  readOnly,
  onOpenKey,
}: {
  detail: InboxDetail;
  meta: InboxMeta | null;
  readOnly: boolean;
  onOpenKey: (key: string) => void;
}) {
  const copy = useInboxCopy();
  const locale = useInboxLocale();
  const ai = useMemo(() => {
    const rows = [];
    if (detail.intent) rows.push({ id: 'intent', label: copy.intent, value: copy.intents[detail.intent] ?? detail.intent });
    if (detail.urgency != null) rows.push({ id: 'urgency', label: copy.urgency, value: formatPercent(detail.urgency, locale) });
    if (detail.churnRisk != null) rows.push({ id: 'churn', label: copy.churnRisk, value: formatPercent(detail.churnRisk, locale) });
    return rows;
  }, [detail, copy, locale]);

  return (
    <div className="space-y-4 pb-4">
      <Section title={copy.comment}>
        <div className="flex flex-wrap items-center gap-2">
          <RatingStars rating={detail.rating} size="md" />
          {detail.npsScore != null ? <span className="qx-caption qx-num text-fg-muted">{copy.nps(detail.npsScore)}</span> : null}
          <SentimentChip sentiment={detail.sentiment} />
          <Chip tone={detail.status === 'resolved' ? 'success' : detail.status === 'replied' ? 'info' : 'warning'}>{copy.status[detail.status]}</Chip>
          <SlaChip sla={detail.sla} title={copy.slaDue(formatDateTime(detail.sla.dueAt, locale))} />
        </div>
        <p className={cn('qx-body whitespace-pre-wrap break-words', detail.text ? 'text-fg' : 'italic text-fg-muted')}>{detail.text ?? copy.noText}</p>
        {detail.media.length > 0 ? (
          <ul aria-label={copy.media} className="flex flex-wrap gap-2">
            {detail.media.map((url, i) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={copy.mediaOpen(i + 1)}
                  className="block overflow-hidden rounded-control border border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- müşteri yüklemesi, alan adı izin listesinde olmayabilir */}
                  <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-20 object-cover" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {detail.dimensions.length > 0 ? (
          <div>
            <h4 className="qx-caption font-medium text-fg-muted">{copy.dimensions}</h4>
            <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              {detail.dimensions.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-2">
                  <span className="qx-small text-fg">{d.label}</span>
                  <RatingStars rating={d.value} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {detail.source === 'consumption' && (detail.amount != null || detail.cardLast4 || detail.categoryName) ? (
          <KeyValueList
            dense
            items={[
              { id: 'p', label: copy.purchase, value: detail.contextLabel },
              { id: 'c', label: copy.category, value: detail.categoryName, hidden: !detail.categoryName },
              { id: 'a', label: copy.amount, value: detail.amount != null ? formatCurrencyTRY(detail.amount, locale) : null, hidden: detail.amount == null },
              { id: 'k', label: copy.card, value: detail.cardLast4 ? `•••• ${detail.cardLast4}` : null, hidden: !detail.cardLast4, mono: true },
            ]}
          />
        ) : null}
      </Section>

      <Section title={copy.replyTitle} icon={<MessageSquareReply aria-hidden className="h-4 w-4 text-fg-muted" />}>
        <ReplyComposer detail={detail} meta={meta} readOnly={readOnly} />
      </Section>

      <Section title={copy.aiSignals} icon={<Bot aria-hidden className="h-4 w-4 text-fg-muted" />}>
        {detail.sentimentBasis === 'pending' ? <p className="qx-caption text-fg-muted">{copy.aiPending}</p> : null}
        {detail.sentimentBasis === 'rating' ? <p className="qx-caption text-fg-muted">{copy.aiBasisRating}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          {detail.urgent ? <SignalChip>{copy.badge.urgent}</SignalChip> : null}
          {detail.churnHigh ? <SignalChip>{copy.badge.churn}</SignalChip> : null}
          {detail.trustFlagged ? <SignalChip>{copy.trustFlag}</SignalChip> : null}
          {detail.toxic ? <SignalChip>{copy.toxicFlag}</SignalChip> : null}
        </div>
        {detail.trustReason ? <p className="qx-caption text-fg-muted">{detail.trustReason}</p> : null}
        {ai.length > 0 ? <KeyValueList dense items={ai} /> : null}
        {detail.topics.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="qx-caption font-medium text-fg-muted">{copy.topics}:</span>
            {detail.topics.map((t) => (
              <Chip key={t}>#{t}</Chip>
            ))}
          </div>
        ) : null}
        {detail.actionSuggestions.length > 0 ? (
          <div>
            <h4 className="qx-caption font-medium text-fg-muted">{copy.actionSuggestions}</h4>
            <ul className="qx-small mt-1 list-disc space-y-0.5 pl-5 text-fg">
              {detail.actionSuggestions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title={copy.caseTitle} icon={<UserCheck aria-hidden className="h-4 w-4 text-fg-muted" />}>
        <CasePanel detail={detail} meta={meta} readOnly={readOnly} />
      </Section>

      <Section title={copy.remedyTitle} icon={<Gift aria-hidden className="h-4 w-4 text-fg-muted" />}>
        <RemedyPanel detail={detail} readOnly={readOnly} />
      </Section>

      <Section title={copy.customer} icon={<History aria-hidden className="h-4 w-4 text-fg-muted" />}>
        {detail.customer ? (
          <>
            <KeyValueList
              layout="grid"
              columns={2}
              dense
              items={[
                { id: 'v', label: copy.visits, value: detail.customer.visits },
                { id: 'r', label: copy.voices, value: detail.customer.voices },
                { id: 'a', label: copy.avgRating, value: detail.customer.avgRating != null ? detail.customer.avgRating.toLocaleString(locale === 'en' ? 'en-GB' : 'tr-TR') : null },
                { id: 'f', label: copy.firstSeen, value: detail.customer.firstSeenAt ? formatDay(detail.customer.firstSeenAt, locale) : null },
              ]}
            />
            <h4 className="qx-caption font-medium text-fg-muted">{copy.recent}</h4>
            {detail.customer.recent.length === 0 ? (
              <p className="qx-caption text-fg-muted">{copy.noRecent}</p>
            ) : (
              <ul className="space-y-1">
                {detail.customer.recent.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => onOpenKey(r.key)}
                      className="flex min-h-11 w-full items-start gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-fast hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <SourceIcon source={r.source} className="mt-1 text-fg-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <RatingStars rating={r.rating} />
                          <span className="qx-caption text-fg-muted">{formatDay(r.createdAt, locale)}</span>
                        </span>
                        <span className="qx-caption line-clamp-2 text-fg">{r.textPreview ?? copy.noText}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="qx-caption text-fg-muted">{copy.anonymousContext}</p>
        )}
      </Section>
    </div>
  );
}

export function InboxDetailBody({
  itemKey,
  meta,
  readOnly,
  onOpenKey,
}: {
  itemKey: string;
  meta: InboxMeta | null;
  readOnly: boolean;
  onOpenKey: (key: string) => void;
}) {
  const copy = useInboxCopy();
  const q = useQuery({
    queryKey: inboxKeys.detail(itemKey),
    queryFn: ({ signal }) => fetchDetail(itemKey, signal),
    retry: shouldRetry,
    staleTime: 15_000,
  });
  const qc = useQueryClient();
  const marked = useRef<Set<string>>(new Set());

  // "Görüldü": QR kaydı ilk açılışta bir kez (sunucu koşullu yazar; tekrar zararsız).
  useEffect(() => {
    const d = q.data;
    if (readOnly || !d || d.source !== 'qr' || d.viewedAt || marked.current.has(d.key)) return;
    marked.current.add(d.key);
    postAction([d.key], 'viewed')
      .then(() => void qc.invalidateQueries({ queryKey: ['dealer-inbox', 'list'] }))
      .catch(() => marked.current.delete(d.key));
  }, [q.data, readOnly, qc]);

  return (
    <QueryState query={q} skeleton={<SkeletonDetail />} isEmpty={() => false} loadingLabel={copy.detailLoading}>
      {(d) => <DetailContent detail={d} meta={meta} readOnly={readOnly} onOpenKey={onOpenKey} />}
    </QueryState>
  );
}
