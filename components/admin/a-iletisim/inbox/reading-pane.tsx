'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  CornerUpLeft,
  ExternalLink,
  FileText,
  MailOpen,
  Mail as MailIcon,
  Paperclip,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconButton } from '@/components/ds/a11y';
import { StatusBadge } from '@/components/ds/data';
import { ConfirmAction, QueryState } from '@/components/states';
import { cn } from '@/lib/utils';
import { MAILBOX_ARCHIVED, formatBytes, replySubject, type InboxDetail, type InboxThreadMessage } from '@/lib/mail-center/inbox-contract';
import { attachmentUrl, fetchInboxDetail, inboxKeys } from '../api';
import { fmtLong } from '../format';
import { MailFrame } from './mail-frame';
import { AdminIletisimText } from '../copy';

export type ReadingPaneHandle = { openReply: () => void };

type Props = {
  id: string;
  onBack: () => void;
  onToggleSeen: (id: string, seen: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => Promise<unknown>;
  onReply: (id: string, message: string, quote: boolean) => Promise<unknown>;
  replyPending: boolean;
  mailConfigured: boolean;
};

export const ReadingPane = forwardRef<ReadingPaneHandle, Props>(function ReadingPane(props, ref) {
  const q = useQuery({
    queryKey: inboxKeys.detail(props.id),
    queryFn: ({ signal }) => fetchInboxDetail(props.id, signal),
    staleTime: 30_000,
  });
  const [replyOpen, setReplyOpen] = useState(false);
  useImperativeHandle(ref, () => ({ openReply: () => setReplyOpen(true) }), []);
  useEffect(() => setReplyOpen(false), [props.id]);

  return (
    <QueryState
      query={q}
      skeleton="detail"
      isEmpty={() => false}
      error={{ title: 'Mail açılamadı', description: 'Mail silinmiş ya da şu anda yüklenemiyor olabilir.' }}
    >
      {(data) => <Detail {...props} data={data} replyOpen={replyOpen} setReplyOpen={setReplyOpen} />}
    </QueryState>
  );
});

function Detail({
  data,
  onBack,
  onToggleSeen,
  onArchive,
  onDelete,
  onReply,
  replyPending,
  mailConfigured,
  replyOpen,
  setReplyOpen,
}: Props & { data: InboxDetail; replyOpen: boolean; setReplyOpen: (v: boolean) => void }) {
  const msg = data.message;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const archived = msg.mailbox === MAILBOX_ARCHIVED;
  const outgoing = msg.direction === 'out';
  const earlier = data.thread.filter((t) => t.id !== msg.id);

  // Mail açılınca odak başlığa (ekran okuyucu + klavye).
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false });
  }, [msg.id]);

  const mailto = `mailto:${encodeURIComponent(msg.fromEmail)}?subject=${encodeURIComponent(replySubject(msg.subject))}`;

  return (
    <article aria-labelledby={`mail-h-${msg.id}`} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" className="min-h-11 md:hidden" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
          Listeye dön
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!outgoing && (
            <>
              <IconButton
                aria-label="Yanıtla (r)"
                tooltip
                icon={<CornerUpLeft />}
                onClick={() => setReplyOpen(true)}
                disabled={msg.isBounce || !mailConfigured}
              />
              <IconButton
                aria-label={msg.seen ? 'Okunmadı olarak işaretle (u)' : 'Okundu olarak işaretle (u)'}
                tooltip
                icon={msg.seen ? <MailIcon /> : <MailOpen />}
                onClick={() => onToggleSeen(msg.id, !msg.seen)}
              />
              <IconButton
                aria-label={archived ? 'Arşivden çıkar (e)' : 'Arşivle (e)'}
                tooltip
                icon={archived ? <ArchiveRestore /> : <Archive />}
                onClick={() => onArchive(msg.id, !archived)}
              />
            </>
          )}
          <ConfirmAction
            trigger={<IconButton aria-label="Kalıcı olarak sil" variant="danger" icon={<Trash2 />} />}
            title="Bu mail kalıcı olarak silinsin mi?"
            description="Mail ve ekleri panelden ve ek deposundan silinir. Gmail'deki kopyası etkilenmez."
            impact={[
              { label: 'Gönderen', value: msg.fromEmail },
              { label: 'Konu', value: msg.subject || '(konu yok)' },
              { label: 'Ek', value: `${msg.attachments.length} dosya`, emphasis: msg.attachments.length > 0 },
            ]}
            confirmLabel="Kalıcı olarak sil"
            onConfirm={() => onDelete(msg.id)}
          />
        </div>
      </div>

      <header className="space-y-2">
        <h2 id={`mail-h-${msg.id}`} ref={headingRef} tabIndex={-1} className="text-lg font-semibold leading-snug text-fg outline-none">
          {msg.subject || '(konu yok)'}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {msg.isBounce && <StatusBadge label="İletilemedi" tone="danger" icon={AlertTriangle} size="sm" />}
          {msg.isFromIntern && (
            <StatusBadge
              label={`Stajyer: ${msg.matchedRecipientName || msg.fromEmail}${msg.matchedDepartment ? ` · ${msg.matchedDepartment}` : ''}`}
              tone="brand"
              icon={UserCheck}
              size="sm"
            />
          )}
          {msg.replied && <StatusBadge label="Yanıtlandı" tone="success" size="sm" />}
          {archived && <StatusBadge label="Arşivde" tone="neutral" icon={Archive} size="sm" />}
          {outgoing && <StatusBadge label="Panelden gönderildi" tone="info" icon={Send} size="sm" />}
        </div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-fg-muted">Kimden</dt>
          <dd className="min-w-0 break-words text-fg">
            {msg.fromName ? `${msg.fromName} ` : ''}
            <span className="text-fg-muted">&lt;{msg.fromEmail}&gt;</span>
          </dd>
          {msg.toEmail && (
            <>
              <dt className="text-fg-muted">Kime</dt>
              <dd className="min-w-0 break-words text-fg">{msg.toEmail}</dd>
            </>
          )}
          <dt className="text-fg-muted">Tarih</dt>
          <dd className="text-fg">{fmtLong(msg.sentAt)}</dd>
        </dl>
        {msg.matchedTemplateId && (
          <Link
            href={`/admin/intern-emails?t=${encodeURIComponent(msg.matchedTemplateId)}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Bu stajyere giden görev şablonunu aç
          </Link>
        )}
      </header>

      {earlier.length > 0 && (
        <section aria-label="Konuşmadaki diğer mesajlar" className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Konuşma · {data.thread.length} mesaj</p>
          {earlier.map((t) => (
            <ThreadItem key={t.id} item={t} />
          ))}
        </section>
      )}

      {msg.attachments.length > 0 && (
        <section aria-label="Ekler" className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            {msg.attachments.length} ek
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {msg.attachments.map((a) => (
              <li key={a.index}>
                {a.available ? (
                  <a
                    href={attachmentUrl(msg.id, a.index)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center gap-3 rounded-control border border-border bg-surface-1 px-3 py-2 text-sm transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-brand" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{a.filename}</span>
                      <span className="block text-xs text-fg-muted">{formatBytes(a.size)} · {a.contentType}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="sr-only"><AdminIletisimText k="newTab" /></span>
                  </a>
                ) : (
                  <div className="flex min-h-11 items-center gap-3 rounded-control border border-dashed border-border px-3 py-2 text-sm text-fg-muted">
                    <FileText className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.filename}</span>
                      <span className="block text-xs">{formatBytes(a.size)} · depolanmadı (15 MB üstü ya da depo kapalıydı)</span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Mail içeriği">
        {msg.hasHtml && !outgoing ? (
          <MailFrame id={msg.id} subject={msg.subject} hasRemoteImages={msg.hasRemoteImages} />
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-control border border-border bg-surface-1 p-4 font-sans text-sm leading-relaxed text-fg">
            {msg.bodyText || '(gövde boş)'}
          </pre>
        )}
      </section>

      {!outgoing && (
        <Composer
          key={msg.id}
          open={replyOpen}
          setOpen={setReplyOpen}
          to={msg.fromEmail}
          subject={replySubject(msg.subject)}
          disabledReason={msg.isBounce ? 'İletilemedi bildirimleri yanıtlanamaz.' : !mailConfigured ? 'Mail gönderimi yapılandırılmamış (SMTP/Resend).' : null}
          pending={replyPending}
          mailto={mailto}
          onSend={(text, quote) => onReply(msg.id, text, quote)}
        />
      )}
    </article>
  );
}

function ThreadItem({ item }: { item: InboxThreadMessage }) {
  const [open, setOpen] = useState(false);
  const out = item.direction === 'out';
  return (
    <div className={cn('rounded-control border border-border', out ? 'bg-brand-subtle/40' : 'bg-surface-1')}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {out ? <Send className="h-4 w-4 shrink-0 text-brand" aria-hidden /> : <MailIcon className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-fg">{out ? `Siz (${item.fromName ?? 'panel'})` : item.fromName || item.fromEmail}</span>
          <span className="text-fg-muted"> · {fmtLong(item.sentAt)}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-fg-muted transition-transform duration-fast motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-3">
          {item.hasHtml && !out ? (
            <MailFrame id={item.id} subject={item.subject} hasRemoteImages={item.hasRemoteImages} />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-fg">{item.bodyText || '(gövde boş)'}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function Composer({
  open,
  setOpen,
  to,
  subject,
  disabledReason,
  pending,
  mailto,
  onSend,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  to: string;
  subject: string;
  disabledReason: string | null;
  pending: boolean;
  mailto: string;
  onSend: (text: string, quote: boolean) => Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const [quote, setQuote] = useState(true);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) areaRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button className="min-h-11" onClick={() => setOpen(true)} disabled={!!disabledReason}>
          <CornerUpLeft className="mr-2 h-4 w-4" aria-hidden />
          Yanıtla
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <a href={mailto}>
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            E-posta istemcisinde aç
          </a>
        </Button>
        {disabledReason && <p className="w-full text-sm text-fg-muted">{disabledReason}</p>}
      </div>
    );
  }

  const send = async () => {
    try {
      await onSend(text.trim(), quote);
      setText('');
      setOpen(false);
    } catch {
      /* hata bildirimi üst katmanda; taslak korunur */
    }
  };

  return (
    <section aria-label="Yanıt yaz" className="sticky bottom-0 z-raised space-y-3 rounded-card border border-border bg-surface-elevated p-4 qx-elevation-2">
      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg">Kime:</span> {to} · <span className="font-medium text-fg">Konu:</span> {subject}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="reply-text"><AdminIletisimText k="yourReply" /></Label>
        <Textarea
          id="reply-text"
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={12_000}
          placeholder="Merhaba, …"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && text.trim() && !pending) void send();
          }}
        />
        <p className="text-xs text-fg-muted"><AdminIletisimText k="replyHint" /></p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-h-11 items-center gap-2">
          <Checkbox id="reply-quote" checked={quote} onCheckedChange={(v) => setQuote(v === true)} />
          <Label htmlFor="reply-quote" className="font-normal"><AdminIletisimText k="quoteOriginal" /></Label>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => (text.trim() ? setConfirmDiscard(true) : setOpen(false))}
            disabled={pending}
          >
            Vazgeç
          </Button>
          <Button className="min-h-11" onClick={() => void send()} disabled={!text.trim() || pending} aria-busy={pending}>
            <Send className="mr-2 h-4 w-4" aria-hidden />
            {pending ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
      </div>
      <ConfirmAction
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        tone="warning"
        title="Yanıt taslağı silinsin mi?"
        description="Yazdığınız metin kaybolacak."
        irreversibleNote={false}
        confirmLabel="Taslağı sil"
        onConfirm={() => {
          setText('');
          setOpen(false);
        }}
      />
    </section>
  );
}
