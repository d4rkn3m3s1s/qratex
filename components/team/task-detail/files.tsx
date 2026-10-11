'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Film, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { IconButton } from '@/components/ds/a11y';
import { ConfirmAction } from '@/components/states';
import { cn } from '@/lib/utils';
import { uploadWithProgress } from '@/lib/upload-with-progress';
import { TEAM_ATTACHMENT_MAX_BYTES, TEAM_ATTACHMENT_MAX_LABEL } from '@/lib/team/constants';
import { relativeTeamTime } from '@/lib/team/dates';
import { errorMessage, teamFetch } from '../lib/api';
import { API, invalidateTasks } from '../lib/queries';
import type { TaskDetailPayload } from '../lib/types';
import { useTeamCopy } from '../copy';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Yükleme yardımcısı (dosya ve yorum eki ortak). Sınır tek sabitten; hata sunucu mesajıyla. */
export async function uploadTaskFile(taskId: string, file: File, onProgress: (p: number) => void) {
  if (file.size > TEAM_ATTACHMENT_MAX_BYTES) throw new Error(`Dosya en fazla ${TEAM_ATTACHMENT_MAX_LABEL} olabilir.`);
  const fd = new FormData();
  fd.append('file', file);
  const { ok, json } = await uploadWithProgress(`${API}/tasks/${encodeURIComponent(taskId)}/attachments`, fd, onProgress);
  const body = json as { success?: boolean; error?: string; data?: { attachment: { id: string; filename: string; path: string } } };
  if (!ok || !body.success || !body.data) throw new Error(body.error || 'Dosya yüklenemedi.');
  return body.data.attachment;
}

/** Görev dosyaları — yükleme (tıkla/sürükle, ilerleme), önizleme, silme (onaylı). */
export function TaskFiles({ data }: { data: TaskDetailPayload }) {
  const tf = useTeamCopy().fx;
  const tu = useTeamCopy().ui;
  const { task, can } = data;
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; filename: string } | null>(null);
  const editable = can.attach && !task.archivedAt;

  const upload = async (file: File) => {
    setPct(0);
    try {
      await uploadTaskFile(task.id, file, setPct);
      toast.success('Dosya eklendi', { description: file.name });
      invalidateTasks(qc, task.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPct(null);
    }
  };

  if (!editable && task.attachments.length === 0) return null;

  return (
    <section aria-labelledby={`files-${task.id}`} className="space-y-2">
      <h3 id={`files-${task.id}`} className="qx-small font-semibold text-fg">
        Dosyalar <span className="qx-num font-normal text-fg-muted">{task.attachments.length}</span>
      </h3>
      {editable && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
          className={cn('rounded-card border border-dashed p-3 text-center transition-colors duration-fast', dragOver ? 'border-brand bg-brand-subtle' : 'border-strong')}
        >
          <input
            ref={input}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={pct !== null} onClick={() => input.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden /> {tu.dosyaSec}
          </Button>
          <p className="qx-caption mt-1.5 text-fg-muted">
            {tf.dropHint(TEAM_ATTACHMENT_MAX_LABEL)}
          </p>
          {pct !== null && <Progress value={pct} className="mt-2 h-1.5" aria-label={tf.uploadingPct(pct)} />}
        </div>
      )}
      {task.attachments.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {task.attachments.map((a) => {
            const image = a.mime.startsWith('image/');
            const video = a.mime.startsWith('video/');
            return (
              <li key={a.id} className="flex items-center gap-2 rounded-control border border-subtle bg-surface-1 p-2">
                <a
                  href={a.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.path} alt="" className="h-10 w-10 shrink-0 rounded-control object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-surface-2 text-fg-muted">
                      {video ? <Film className="h-4 w-4" aria-hidden /> : a.mime === 'application/pdf' ? <FileText className="h-4 w-4" aria-hidden /> : <Paperclip className="h-4 w-4" aria-hidden />}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="qx-small block truncate font-medium text-fg">{a.filename}</span>
                    <span className="qx-caption block truncate text-fg-muted">
                      {formatBytes(a.size)} · {a.uploadedByName ?? tu.silinmisKullanici} · {relativeTeamTime(a.createdAt)}
                    </span>
                  </span>
                </a>
                {a.canDelete && !task.archivedAt && (
                  <IconButton aria-label={tf.deleteFile(a.filename)} icon={<Trash2 />} size="sm" onClick={() => setDeleting({ id: a.id, filename: a.filename })} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmAction
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={tu.dosyaSilinsinMi}
        description={deleting ? tf.fileRemovedDesc(deleting.filename) : undefined}
        confirmLabel={tu.sil}
        onConfirm={async () => {
          if (!deleting) return;
          await teamFetch(`${API}/tasks/${encodeURIComponent(task.id)}/attachments?attachmentId=${encodeURIComponent(deleting.id)}`, { method: 'DELETE' });
          toast.success('Dosya silindi');
          invalidateTasks(qc, task.id);
          setDeleting(null);
        }}
      />
    </section>
  );
}
