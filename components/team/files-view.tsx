'use client';

import { useEffect, useState } from 'react';
import { FileText, Film, Paperclip, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChoiceChips } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { relativeTeamTime } from '@/lib/team/dates';
import { qs } from './lib/api';
import { API, useCursorList } from './lib/queries';
import { useWorkspace } from './workspace-context';
import { formatBytes } from './task-detail/files';
import { displayName } from './shared';

type FileRow = {
  id: string;
  filename: string;
  path: string;
  mime: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; name: string | null; image: string | null } | null;
  task: { id: string; title: string; department: string | null };
  canDelete: boolean;
};

const TYPES = [
  { value: 'all', label: 'Tümü' },
  { value: 'image', label: 'Görsel' },
  { value: 'pdf', label: 'PDF' },
  { value: 'video', label: 'Video' },
  { value: 'office', label: 'Office' },
  { value: 'text', label: 'Metin' },
  { value: 'archive', label: 'Arşiv' },
] as const;

/**
 * Dosyalar — yalnız görebildiğin görevlerin ekleri (denetim #50/Y4), imleçli "daha fazla"
 * (eski sınır 300 kayıttı). Dosya görevin içine götürür.
 */
export function FilesView() {
  const { openTask } = useWorkspace();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('all');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const list = useCursorList<FileRow>(['team', 'files', q, type], (cursor) =>
    `${API}/files${qs({ q, type: type === 'all' ? undefined : type, cursor })}`
  );
  const pages = list.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const stats = pages[0]?.stats as { count: number; totalSize: number } | null | undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Dosya ya da görev ara" aria-label="Dosya ara" className="h-11 pl-9" />
        </div>
        <ChoiceChips aria-label="Dosya türü" options={TYPES.map((t) => ({ value: t.value, label: t.label }))} value={type} onChange={(v) => setType(v ?? 'all')} size="sm" scroll />
        {stats && (
          <span className="qx-caption qx-num text-fg-muted sm:ml-auto">
            {stats.count} dosya · {formatBytes(stats.totalSize)}
          </span>
        )}
      </div>
      <QueryState
        query={{ ...list, data: list.data ? { items } : undefined }}
        skeleton="cards"
        isEmpty={(d) => d.items.length === 0}
        empty={{ variant: q || type !== 'all' ? 'no-results' : 'default', title: q || type !== 'all' ? 'Eşleşen dosya yok' : 'Henüz dosya yok', description: 'Görevlere eklenen dosyalar burada toplanır.' }}
      >
        {() => (
          <>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((f) => {
                const image = f.mime.startsWith('image/');
                return (
                  <li key={f.id} className="flex gap-3 rounded-card border border-subtle bg-surface-1 p-2">
                    <a href={f.path} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${f.filename} dosyasını aç`}>
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.path} alt="" loading="lazy" className="h-14 w-14 rounded-control object-cover" />
                      ) : (
                        <span className="grid h-14 w-14 place-items-center rounded-control bg-surface-2 text-fg-muted">
                          {f.mime.startsWith('video/') ? <Film className="h-5 w-5" aria-hidden /> : f.mime === 'application/pdf' ? <FileText className="h-5 w-5" aria-hidden /> : <Paperclip className="h-5 w-5" aria-hidden />}
                        </span>
                      )}
                    </a>
                    <div className="min-w-0 flex-1">
                      <p className="qx-small truncate font-medium text-fg">{f.filename}</p>
                      <p className="qx-caption truncate text-fg-muted">
                        {formatBytes(f.size)} · {displayName(f.uploadedBy, 'Silinmiş kullanıcı')} · {relativeTeamTime(f.createdAt)}
                      </p>
                      <button type="button" onClick={() => openTask(f.task.id)} className="qx-caption mt-0.5 block max-w-full truncate text-left text-brand underline-offset-2 hover:underline">
                        {f.task.title}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {list.hasNextPage && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
                </Button>
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}
