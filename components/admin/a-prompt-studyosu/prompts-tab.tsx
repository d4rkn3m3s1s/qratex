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
import { usePromptStudioCopy } from './copy';

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
  const query = useQuery({ queryKey: studioKeys.prompts(), queryFn: fetchPrompts, initialData: initial ?? undefined, staleTime: 15_000 });
  return (
    <QueryState query={query} skeleton="detail" error={{ title: 'Promptlar yüklenemedi' }}>
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
  const px = usePromptStudioCopy();
  return (
    <SectionCard
      title="Temel promptlar"
      description="Güvenlik ve gizlilik kurallarını taşıyan çekirdek. Kodda sabittir ve sürüm etiketiyle izlenir; veritabanındaki hiçbir metin (öğrenilen kurallar, notlar, bayi bağlamı) bunların yerine geçemez, yalnız sınırlı ek bağlam olarak sonuna eklenir."
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
                <span className="qx-small ml-auto hidden text-brand group-open:inline">Gizle</span>
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
  const px = usePromptStudioCopy();
  const meta = NOTE_META[note.key];
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
      toast.error('Notlar başka bir oturumda değişti; güncel hâli yüklendi.');
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
      toast.success('Taslak kaydedildi. Yayınlanana kadar modele etkisi yok.');
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
          <StatusBadge label={STATUS_LABEL[v.status].label} tone={STATUS_LABEL[v.status].tone} size="sm" />
          <span className="qx-small text-fg-muted">{v.body ? `${v.body.length} karakter` : 'Not kaldırıldı'}</span>
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
                setReason(`Geri yükleme: ${fmtDateTime(v.publishedAt ?? v.createdAt)} sürümü`);
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Bu metni taslağa al
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
          <StatusBadge label="Yayında" tone="success" />
        ) : note.liveIneffective ? (
          <StatusBadge label="Etkisiz eski metin" tone="warning" />
        ) : (
          <StatusBadge label="Not yok" tone="neutral" />
        )
      }
    >
      <div className="space-y-5">
        <p className="qx-small text-fg-muted">Kullanıldığı yer: {meta.usedBy.join(' · ')}. Modele en çok {note.limit} karakter ulaşır.</p>

        {note.liveIneffective ? (
          <InlineError variant="banner" tone="warning">
            Bu alanda yönetici onayı damgası olmayan eski bir metin var (eski sistem eğitiminin yazdığı). Güvenlik gereği modele gönderilmiyor. Kullanmak isterseniz taslak olarak kaydedip yayınlayın.
          </InlineError>
        ) : null}

        <div className="space-y-2">
          <h3 className="qx-small font-medium text-fg">{px.liveText}</h3>
          {note.live ? <PromptBlock text={note.live} label={px.liveTextLabel(meta.title)} maxHeight="max-h-48" /> : <p className="qx-small text-fg-muted">{px.noLiveNote}</p>}
        </div>

        {draft ? (
          <div className="space-y-3 rounded-lg border border-info-border bg-info-subtle/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="Bekleyen taslak" tone="info" />
              <span className="qx-small text-fg-muted">
                {actorName(draft.createdBy)} · {fmtDateTime(draft.createdAt)} · “{draft.note}”
              </span>
            </div>
            <TextDiff before={note.live} after={draft.body} label="Yayındaki → taslak" />
            <div className="flex flex-wrap gap-2">
              <ConfirmAction
                tone="brand"
                trigger={
                  <Button className="min-h-11 sm:min-h-10">
                    <Send className="h-4 w-4" aria-hidden />
                    Taslağı yayınla
                  </Button>
                }
                title="Taslak yayınlansın mı?"
                description={`Bu not ${meta.usedBy.join(', ')} çağrılarına sonraki istekten itibaren eklenir. Yayındaki metin geçmişe taşınır ve geri yüklenebilir.`}
                impact={[
                  { label: 'Yayındaki', value: note.live ? `${note.live.length} karakter` : 'Not yok' },
                  { label: 'Yeni', value: draft.body ? `${draft.body.length} karakter` : 'Not kaldırılacak', emphasis: true },
                ]}
                irreversibleNote={false}
                confirmLabel="Yayınla"
                onConfirm={async () => {
                  try {
                    onSettled(await noteVersionAction(draft.id, 'publish', version));
                    toast.success('Not yayınlandı.');
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
                    Taslağı sil
                  </Button>
                }
                title="Taslak silinsin mi?"
                description="Yayındaki metin değişmez; taslak geçmişte “silinen taslak” olarak kalır."
                irreversibleNote={false}
                confirmLabel="Sil"
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
              setFormError(!reasonOk(reason) ? 'Gerekçe en az 3 karakter olmalı.' : len > note.limit ? `En çok ${note.limit} karakter.` : 'Değişiklik yok.');
              return;
            }
            save.mutate();
          }}
        >
          <h3 className="qx-small font-medium text-fg">{draft ? 'Taslağı değiştir' : 'Yeni taslak'}</h3>
          <CountedTextarea
            label={`${meta.title} metni`}
            value={body}
            onChange={(v) => {
              setBody(v);
              setEditing(true);
              setPreview(null);
            }}
            max={note.limit}
            rows={note.key === 'chat' ? 8 : 6}
            hint="Talimat değil, kısa üslup/öncelik ipuçları yazın. Boş bırakıp yayınlamak notu kaldırır."
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
              {runPreview.isPending ? 'Derleniyor…' : 'Modele gideni önizle'}
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
                Değişiklikleri bırak
              </Button>
            ) : null}
          </div>
        </form>

        {preview ? (
          <div className="space-y-2" aria-live="polite">
            <h3 className="qx-small font-medium text-fg">{px.compiledContext}</h3>
            <p className="qx-small text-fg-muted">{px.dryRunNote}</p>
            <PromptBlock text={note.key === 'chat' ? preview.chatBlock : preview.insightBlock} label="Derlenmiş ek bağlam" />
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="qx-small font-medium text-fg">{px.versionHistory}</h3>
          <Timeline events={events} timeStyle="datetime" dense emptyLabel="Henüz yayınlanmış sürüm yok." ariaLabel={`${meta.title} sürüm geçmişi`} />
        </div>
      </div>
    </SectionCard>
  );
}

export type { NoteKey };
