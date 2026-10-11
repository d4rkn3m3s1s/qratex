'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { CornerDownRight, Paperclip, Pencil, Reply, Send, SmilePlus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconButton } from '@/components/ds/a11y';
import { ConfirmAction } from '@/components/states';
import { cn } from '@/lib/utils';
import { formatTeamDateTime, relativeTeamTime } from '@/lib/team/dates';
import { errorMessage } from '../lib/api';
import { useTaskActions } from '../lib/use-task-actions';
import { useWorkspace } from '../workspace-context';
import { MemberAvatar, displayName } from '../shared';
import { uploadTaskFile } from './files';
import type { TaskDetailPayload } from '../lib/types';
import { useTeamCopy } from '../copy';

const REACTIONS = ['👍', '❤️', '🎉', '🚀', '👀'] as const;
type Comment = TaskDetailPayload['task']['comments'][number];

const handleOf = (name: string | null) => (name || '').replace(/\s+/g, '');

function renderText(text: string, handles: Set<string>) {
  const parts: React.ReactNode[] = [];
  const re = /@([\p{L}0-9_.]+)/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>);
    const known = handles.has(m[1].toLocaleLowerCase('tr'));
    parts.push(
      <span key={k++} className={cn('rounded px-0.5 font-medium', known ? 'bg-brand-subtle text-brand' : 'text-fg')}>
        @{m[1]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={k++}>{text.slice(last)}</Fragment>);
  return parts;
}

/**
 * Yorumlar — gönderim BEKLENİR: istek başarısızsa metin kutuda kalır (denetim O1/#69: girdi
 * istekten önce temizleniyor, uzun yorum kayboluyordu). Düzenle/sil yalnız yetkili kişiye
 * görünür (#70), tepki/yanıt düğmeleri her zaman görünür (dokunmatik; #71). Yoruma dosya,
 * yalnız bu göreve yüklenmiş ekin kimliğiyle bağlanır (serbest URL enjeksiyonu kapandı).
 */
export function TaskComments({ data }: { data: TaskDetailPayload }) {
  const tu = useTeamCopy().ui;
  const tx = useTeamCopy();
  const { task } = data;
  const { members, viewer, weekKey } = useWorkspace();
  const actions = useTaskActions({ weekKey });
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [file, setFile] = useState<{ id: string; filename: string } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Comment | null>(null);

  const team = members.filter((m) => m.inTeam || m.isAdmin);
  const handles = useMemo(() => new Map(team.map((m) => [handleOf(m.name).toLocaleLowerCase('tr'), m.id])), [team]);
  const handleSet = useMemo(() => new Set(handles.keys()), [handles]);
  const mentionList = mentionQ === null ? [] : team.filter((m) => (m.name || '').toLocaleLowerCase('tr').includes(mentionQ.toLocaleLowerCase('tr'))).slice(0, 6);

  const top = task.comments.filter((c) => !c.parentId);
  const replies = (id: string) => task.comments.filter((c) => c.parentId === id);

  const onChange = (val: string) => {
    setText(val);
    const caret = ref.current?.selectionStart ?? val.length;
    const m = /(?:^|\s)@([\p{L}0-9_.]*)$/u.exec(val.slice(0, caret));
    if (m) {
      setMentionQ(m[1]);
      setMentionIdx(0);
    } else setMentionQ(null);
  };
  const insertMention = (name: string | null) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}0-9_.]*)$/u, `@${handleOf(name)} `);
    const next = before + text.slice(caret);
    setText(next);
    setMentionQ(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };
  const mentionIds = (val: string) => {
    const ids = new Set<string>();
    for (const m of val.matchAll(/@([\p{L}0-9_.]+)/gu)) {
      const id = handles.get(m[1].toLocaleLowerCase('tr'));
      if (id) ids.add(id);
    }
    return [...ids];
  };

  const submit = async () => {
    const body = text.trim() || (file ? `Dosya: ${file.filename}` : '');
    if (!body || sending) return;
    setSending(true);
    try {
      await actions.act(task.id, {
        op: 'add_comment',
        text: body,
        mentions: mentionIds(text),
        parentId: replyTo?.id ?? null,
        attachmentId: file?.id ?? null,
      });
      setText('');
      setReplyTo(null);
      setFile(null);
    } catch (err) {
      toast.error(errorMessage(err), { description: tu.yorumunSilinmediTekrarGonderebilirsin });
    } finally {
      setSending(false);
    }
  };

  const react = (c: Comment, emoji: string) =>
    actions.act(task.id, { op: 'toggle_reaction', commentId: c.id, emoji }).catch((err) => toast.error(errorMessage(err)));

  const renderComment = (c: Comment, nested = false) => {
    const counts = REACTIONS.map((e) => ({ e, n: c.reactions.filter((r) => r.emoji === e).length, mine: c.reactions.some((r) => r.emoji === e && r.userId === viewer.userId) })).filter((x) => x.n > 0);
    return (
      <li key={c.id} className={cn('flex gap-2', nested && 'ml-8')}>
        <MemberAvatar user={c.author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="qx-small font-semibold text-fg">{displayName(c.author, tu.silinmisKullanici)}</span>
            <time className="qx-caption text-fg-muted" dateTime={c.createdAt} title={formatTeamDateTime(c.createdAt)}>
              {relativeTeamTime(c.createdAt)}
            </time>
            {c.editedAt && <span className="qx-caption text-fg-subtle">{tx.edited}</span>}
          </div>
          {editing?.id === c.id ? (
            <form
              className="mt-1 space-y-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editing.text.trim()) return;
                try {
                  await actions.act(task.id, { op: 'edit_comment', commentId: c.id, text: editing.text.trim() });
                  setEditing(null);
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            >
              <Textarea value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} rows={3} aria-label={tu.yorumuDuzenle} autoFocus />
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-9">
                  Kaydet
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setEditing(null)}>
                  {tu.vazgec}
                </Button>
              </div>
            </form>
          ) : (
            <p className="qx-small mt-0.5 whitespace-pre-wrap break-words text-fg">{renderText(c.text, handleSet)}</p>
          )}
          {c.attachmentPath && (
            <a href={c.attachmentPath} target="_blank" rel="noopener noreferrer" className="qx-caption mt-1 inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline">
              <Paperclip className="h-3 w-3" aria-hidden /> {c.attachmentName ?? 'Ek'}
            </a>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {counts.map((x) => (
              <button
                key={x.e}
                type="button"
                onClick={() => void react(c, x.e)}
                aria-pressed={x.mine}
                aria-label={`${x.e} tepkisi, ${x.n} kişi${x.mine ? ', sen dahil' : ''}`}
                className={cn('qx-caption inline-flex h-7 items-center gap-1 rounded-chip border px-1.5', x.mine ? 'border-brand bg-brand-subtle' : 'border-subtle bg-surface-1')}
              >
                {x.e} <span className="qx-num">{x.n}</span>
              </button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <IconButton aria-label={tu.tepkiEkle} icon={<SmilePlus />} size="sm" />
              </PopoverTrigger>
              <PopoverContent className="flex w-auto gap-1 p-1.5" align="start">
                {REACTIONS.map((e) => (
                  <button key={e} type="button" className="grid h-10 w-10 place-items-center rounded-control text-lg hover:bg-surface-2" onClick={() => void react(c, e)} aria-label={`${e} tepkisi`}>
                    {e}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            {!nested && (
              <IconButton
                aria-label={tu.yanitla}
                icon={<Reply />}
                size="sm"
                onClick={() => {
                  setReplyTo(c);
                  ref.current?.focus();
                }}
              />
            )}
            {c.canEdit && <IconButton aria-label={tu.duzenle} icon={<Pencil />} size="sm" onClick={() => setEditing({ id: c.id, text: c.text })} />}
            {c.canDelete && <IconButton aria-label={tu.sil} icon={<Trash2 />} size="sm" onClick={() => setDeleting(c)} />}
          </div>
          {!nested && replies(c.id).length > 0 && <ul className="mt-2 space-y-3">{replies(c.id).map((r) => renderComment(r, true))}</ul>}
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby={`cm-${task.id}`} className="space-y-3">
      <h3 id={`cm-${task.id}`} className="qx-small font-semibold text-fg">
        Notlar ve yorumlar <span className="qx-num font-normal text-fg-muted">{task.comments.length}</span>
      </h3>
      {top.length === 0 ? (
        <p className="qx-small text-fg-muted">{tx.noNotes}</p>
      ) : (
        <ul className="space-y-4">{top.map((c) => renderComment(c))}</ul>
      )}

      <form
        className="sticky bottom-0 -mx-card space-y-2 border-t border-subtle bg-surface-1 px-card pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {replyTo && (
          <p className="qx-caption flex items-center gap-1 text-fg-muted">
            <CornerDownRight className="h-3 w-3" aria-hidden /> {displayName(replyTo.author, 'yorum')} kişisine yanıt
            <IconButton aria-label={tu.yanitiIptalEt} icon={<X />} size="sm" onClick={() => setReplyTo(null)} />
          </p>
        )}
        <div className="relative">
          <Textarea
            ref={ref}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (mentionList.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIdx((i) => (i + 1) % mentionList.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIdx((i) => (i - 1 + mentionList.length) % mentionList.length);
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  insertMention(mentionList[mentionIdx]?.name ?? null);
                } else if (e.key === 'Escape') setMentionQ(null);
                return;
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder={tu.notYazIleBirini}
            aria-label={tu.yorumYaz}
            aria-autocomplete="list"
            aria-expanded={mentionList.length > 0}
          />
          {mentionList.length > 0 && (
            <ul role="listbox" aria-label={tu.etiketlenecekKisi} className="absolute bottom-full left-0 z-popover mb-1 w-64 rounded-control border border-subtle bg-surface-1 p-1 qx-elevation-2">
              {mentionList.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === mentionIdx}>
                  <button
                    type="button"
                    className={cn('flex w-full items-center gap-2 rounded-control px-2 py-2 text-left', i === mentionIdx ? 'bg-brand-subtle' : 'hover:bg-surface-2')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(m.name);
                    }}
                  >
                    <MemberAvatar user={m} size="xs" />
                    <span className="qx-small truncate">{displayName(m)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {data.can.attach && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    setUploadPct(0);
                    try {
                      const att = await uploadTaskFile(task.id, f, setUploadPct);
                      setFile({ id: att.id, filename: att.filename });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    } finally {
                      setUploadPct(null);
                    }
                  }}
                />
                <IconButton aria-label={tu.yorumaDosyaEkle} icon={<Paperclip />} size="sm" loading={uploadPct !== null} onClick={() => fileRef.current?.click()} />
              </>
            )}
            {uploadPct !== null && <span className="qx-caption qx-num text-fg-muted">%{uploadPct}</span>}
            {file && (
              <span className="qx-caption inline-flex min-w-0 items-center gap-1 rounded-chip bg-surface-2 px-1.5 py-0.5 text-fg">
                <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{file.filename}</span>
                <button type="button" aria-label={tu.ekiKaldir} onClick={() => setFile(null)} className="grid h-5 w-5 place-items-center">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            )}
          </div>
          <Button type="submit" size="sm" className="h-10 gap-1.5" disabled={sending || (!text.trim() && !file)}>
            <Send className="h-4 w-4" aria-hidden /> {sending ? tu.gonderiliyor : tu.gonder}
          </Button>
        </div>
      </form>

      <ConfirmAction
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tu.yorumSilinsinMi}
        tone="warning"
        confirmLabel={tu.sil}
        onConfirm={async () => {
          if (!deleting) return;
          await actions.act(task.id, { op: 'delete_comment', commentId: deleting.id });
          setDeleting(null);
        }}
      />
    </section>
  );
}
