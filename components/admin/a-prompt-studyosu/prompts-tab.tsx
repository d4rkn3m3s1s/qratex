'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, FileClock, FileEdit, Lock, RotateCcw, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/ds/page';
import { StatusBadge, Timeline, type TimelineEvent } from '@/components/ds/data';
import { ConfirmAction, QueryState, InlineError } from '@/components/states';
import { NOTE_META, type NoteKey, type NoteState, type NoteVersion, type PromptsState } from '@/lib/ai-studio/contract';
import { createNoteDraft, errorText, fetchPrompts, isConflict, noteVersionAction, previewNotes, studioKeys } from './api';
import { TextDiff } from './diff-view';
import { actorName, fmtDateTime } from './format';
import { CountedTextarea, PromptBlock, ReasonInput, reasonOk } from './parts';
import { useSourceT } from '@/components/ds/page/source-dict';
import { PROMPT_STUDIO_DICT, usePromptStudioCopy } from './copy';

const STATUS_LABEL: Record<NoteVersion['status'], { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' }> = {
  published: { label: 'Yayında', tone: 'success' },
  draft: { label: 'Taslak', tone: 'info' },
  superseded: { label: 'Önceki yayın', tone: 'neutral' },
  discarded: { label: 'Silinen taslak', tone: 'neutral' },
};

/**
 * Promptlar: temel promptlar kodda sabit (salt okunur, sürüm etiketli); yönetilebilen yalnız sınırlı
 * EK notlardır. Akış: taslak (gerekçeli) → fark + derlenmiş önizleme → yayınla (onay) → geçmiş/geri yükle.
 */
export default function PromptsTab({ initial }: { initial?: PromptsState | null }) {
  const ux = usePromptStudioCopy().ui;
  const query = useQuery({ queryKey: studioKeys.prompts(), queryFn: fetchPrompts, initialData: initial ?? undefined, staleTime: 15_000 });
  return (
    <QueryState query={query} skeleton="detail" error={{ title: ux.promptlarYuklenemedi }}>
      {(state) => (
        <div className="space-y-6">
          <BasePrompts state={state} />
          {state.notes.map((n) => (
            <NoteCard key={n.key} note={n} version={state.version} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function BasePrompts({ state }: { state: PromptsState }) {
  const uy = usePromptStudioCopy().ui2;
  const ux = usePromptStudioCopy().ui;
  const px = usePromptStudioCopy();
  return (
    <SectionCard
      title={ux.temelPromptlar}
      description={ux.guvenlikVeGizlilikKurallarini}
      icon={<Lock />}
    >
      <ul className="divide-y divide-border">
        {state.base.map((b) => (
          <li key={b.key} className="py-3 first:pt-0 last:pb-0">
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                <span className="font-medium text-fg">{b.title}</span>
                <StatusBadge label={b.version} tone="brand" size="sm" icon={null} />
                <span className="qx-small text-fg-muted">{b.usedBy.join(' · ')}</span>
                <span className="qx-small ml-auto text-brand group-open:hidden">{px.showText}</span>
                <span className="qx-small ml-auto hidden text-brand group-open:inline">{uy.gizle}</span>
              </summary>
              <div className="mt-2">
                <PromptBlock text={b.text} label={`${b.title} temel promptu`} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function NoteCard({ note, version }: { note: NoteState; version: string }) {
  const fz = usePromptStudioCopy().fx;
  const L = useSourceT(PROMPT_STUDIO_DICT);
  const ux = usePromptStudioCopy().ui;
  const px = usePromptStudioCopy();
  const meta0 = NOTE_META[note.key];
  const meta = { ...meta0, title: L(meta0.title), description: L(meta0.description), usedBy: meta0.usedBy.map((u) => L(u)) };
  const qc = useQueryClient();
  const draft = note.versions.find((v) => v.status === 'draft') ?? null;
  const [body, setBody] = useState(draft?.body ?? note.live ?? '');
  const [reason, setReason] = useState('');
  const [basedOn, setBasedOn] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ insightBlock: string; chatBlock: string } | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setBody(draft?.body ?? note.live ?? '');
  }, [draft?.id, draft?.body, note.live, editing]);

  const onSettled = (next: PromptsState) => {
    qc.setQueryData(studioKeys.prompts(), next);
    qc.invalidateQueries({ queryKey: studioKeys.overview() });
  };
  const onConflict = (e: unknown) => {
    if (isConflict(e)) {
      toast.error(ux.notlarBaskaBirOturumda);
      qc.invalidateQueries({ queryKey: studioKeys.prompts() });
      return true;
    }
    return false;
  };

  const save = useMutation({
    mutationFn: () => createNoteDraft({ key: note.key, body: body.trim() ? body : null, note: reason, basedOn, baseVersion: version }),
    onSuccess: (next) => {
      onSettled(next);
      setEditing(false);
      setReason('');
      setBasedOn(null);
      setFormError(null);
      toast.success(ux.taslakKaydedildiYayinlananaKadar);
    },
    onError: (e) => {
      if (!onConflict(e)) setFormError(errorText(e));
    },
  });

  const runPreview = useMutation({
    mutationFn: () =>
      previewNotes({
        system: note.key === 'system' ? body : null,
        chat: note.key === 'chat' ? body : null,
      }),
    onSuccess: setPreview,
    onError: (e) => toast.error(errorText(e)),
  });

  const len = body.trim().length;
  const canSave = reasonOk(reason) && len <= note.limit && (body.trim() || null) !== (draft?.body ?? note.live ?? null);

  const events: TimelineEvent[] = note.versions
    .filter((v) => v.status !== 'draft')
    .slice(0, 12)
    .map((v) => ({
      id: v.id,
      title: (
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge label={L(STATUS_LABEL[v.status].label)} tone={STATUS_LABEL[v.status].tone} size="sm" />
          <span className="qx-small text-fg-muted">{v.body ? `${v.body.length} karakter` : ux.notKaldirildi}</span>
        </span>
      ),
      description: (
        <span className="space-y-1">
          <span className="block">{v.note}</span>
          {v.status !== 'discarded' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 px-2 sm:min-h-9"
              onClick={() => {
                setBody(v.body ?? '');
                setBasedOn(v.id.startsWith('legacy-') ? null : v.id);
                setEditing(true);
                setReason(fz.restoreReason(fmtDateTime(v.publishedAt ?? v.createdAt)));
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {ux.buMetniTaslagaAl}
            </Button>
          ) : null}
        </span>
      ),
      at: v.publishedAt ?? v.createdAt,
      actor: actorName(v.publishedBy ?? v.createdBy),
      icon: FileClock,
    }));

  return (
    <SectionCard
      title={meta.title}
      description={meta.description}
      icon={<FileEdit />}
      actions={
        note.live ? (
          <StatusBadge label={ux.yayinda} tone="success" />
        ) : note.liveIneffective ? (
          <StatusBadge label={ux.etkisizEskiMetin} tone="warning" />
        ) : (
          <StatusBadge label={ux.notYok} tone="neutral" />
        )
      }
    >
      <div className="space-y-5">
        <p className="qx-small text-fg-muted">{fz.usedWhere(meta.usedBy.join(' · '), note.limit)}</p>

        {note.liveIneffective ? (
          <InlineError variant="banner" tone="warning">
            {ux.buAlandaYoneticiOnayi}
          </InlineError>
        ) : null}

        <div className="space-y-2">
          <h3 className="qx-small font-medium text-fg">{px.liveText}</h3>
          {note.live ? <PromptBlock text={note.live} label={px.liveTextLabel(meta.title)} maxHeight="max-h-48" /> : <p className="qx-small text-fg-muted">{px.noLiveNote}</p>}
        </div>

        {draft ? (
          <div className="space-y-3 rounded-lg border border-info-border bg-info-subtle/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={ux.bekleyenTaslak} tone="info" />
              <span className="qx-small text-fg-muted">
                {actorName(draft.createdBy)} · {fmtDateTime(draft.createdAt)} · “{draft.note}”
              </span>
            </div>
            <TextDiff before={note.live} after={draft.body} label={ux.yayindakiTaslak} />
            <div className="flex flex-wrap gap-2">
              <ConfirmAction
                tone="brand"
                trigger={
                  <Button className="min-h-11 sm:min-h-10">
                    <Send className="h-4 w-4" aria-hidden />
                    {ux.taslagiYayinla}
                  </Button>
                }
                title={ux.taslakYayinlansinMi}
                description={fz.publishDesc(meta.usedBy.join(', '))}
                impact={[
                  { label: ux.yayindaki, value: note.live ? `${note.live.length} karakter` : 'Not yok' },
                  { label: ux.yeni, value: draft.body ? `${draft.body.length} karakter` : ux.notKaldirilacak, emphasis: true },
                ]}
                irreversibleNote={false}
                confirmLabel={ux.yayinla}
                onConfirm={async () => {
                  try {
                    onSettled(await noteVersionAction(draft.id, 'publish', version));
                    toast.success(ux.notYayinlandi);
                  } catch (e) {
                    if (!onConflict(e)) throw e;
                  }
                }}
              />
              <ConfirmAction
                tone="warning"
                trigger={
                  <Button variant="outline" className="min-h-11 sm:min-h-10">
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {ux.taslagiSil}
                  </Button>
                }
                title={ux.taslakSilinsinMi}
                description={ux.yayindakiMetinDegismezTaslak}
                irreversibleNote={false}
                confirmLabel={ux.sil}
                onConfirm={async () => {
                  try {
                    onSettled(await noteVersionAction(draft.id, 'discard', version));
                    toast.success('Taslak silindi.');
                  } catch (e) {
                    if (!onConflict(e)) throw e;
                  }
                }}
              />
            </div>
          </div>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSave) {
              setFormError(!reasonOk(reason) ? ux.gerekceEnAz3 : len > note.limit ? fz.maxChars(note.limit) : ux.degisiklikYok);
              return;
            }
            save.mutate();
          }}
        >
          <h3 className="qx-small font-medium text-fg">{draft ? ux.taslagiDegistir : 'Yeni taslak'}</h3>
          <CountedTextarea
            label={fz.textOf(meta.title)}
            value={body}
            onChange={(v) => {
              setBody(v);
              setEditing(true);
              setPreview(null);
            }}
            max={note.limit}
            rows={note.key === 'chat' ? 8 : 6}
            hint={ux.talimatDegilKisaUslup}
          />
          <ReasonInput value={reason} onChange={setReason} />
          {formError ? (
            <p className="qx-small text-danger" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11 sm:min-h-10" disabled={save.isPending}>
              <FileEdit className="h-4 w-4" aria-hidden />
              {save.isPending ? 'Kaydediliyor…' : 'Taslak olarak kaydet'}
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => runPreview.mutate()} disabled={runPreview.isPending || len > note.limit}>
              <Eye className="h-4 w-4" aria-hidden />
              {runPreview.isPending ? 'Derleniyor…' : ux.modeleGideniOnizle}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 sm:min-h-10"
                onClick={() => {
                  setEditing(false);
                  setBasedOn(null);
                  setReason('');
                  setPreview(null);
                  setFormError(null);
                }}
              >
                {ux.degisiklikleriBirak}
              </Button>
            ) : null}
          </div>
        </form>

        {preview ? (
          <div className="space-y-2" aria-live="polite">
            <h3 className="qx-small font-medium text-fg">{px.compiledContext}</h3>
            <p className="qx-small text-fg-muted">{px.dryRunNote}</p>
            <PromptBlock text={note.key === 'chat' ? preview.chatBlock : preview.insightBlock} label={ux.derlenmisEkBaglam} />
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="qx-small font-medium text-fg">{px.versionHistory}</h3>
          <Timeline events={events} timeStyle="datetime" dense emptyLabel={ux.henuzYayinlanmisSurumYok} ariaLabel={fz.historyOf(meta.title)} />
        </div>
      </div>
    </SectionCard>
  );
}

export type { NoteKey };
