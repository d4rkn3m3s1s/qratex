'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Loader2, Search, FileText, Download, ImageIcon, FolderOpen, HardDrive } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

type FileItem = {
  id: string; filename: string; path: string; mime: string; size: number; createdAt: string;
  uploadedBy: { id: string; name: string | null; email: string; image: string | null };
  task: { id: string; title: string; department: string | null };
};
type Dept = { slug: string; name: string; color: string };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${TR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Ekip Dosyalar görünümü: tüm görev eklerini tek yerde (grid önizleme + filtre). */
export function TeamFiles({ departments, onOpenTask }: { departments: Dept[]; onOpenTask: (id: string) => void }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<{ count: number; totalSize: number }>({ count: 0, totalSize: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('all');
  const [dept, setDept] = useState('all');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(search.trim()), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debounced) params.set('q', debounced);
      if (type !== 'all') params.set('type', type);
      if (dept !== 'all') params.set('department', dept);
      const res = await fetch(`/api/admin/team/files?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) { setFiles(json.files); setStats(json.stats); }
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, [debounced, type, dept]);
  useEffect(() => { load(); }, [load]);

  const images = files.filter((f) => f.mime.startsWith('image/'));
  const docs = files.filter((f) => !f.mime.startsWith('image/'));

  return (
    <div className="space-y-4">
      {/* Özet + filtre çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-1.5 text-sm">
          <FolderOpen className="h-4 w-4 text-primary" /> <span className="font-semibold">{stats.count}</span> dosya
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-1.5 text-sm">
          <HardDrive className="h-4 w-4 text-muted-foreground" /> {fmtSize(stats.totalSize)}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Dosya veya görev ara…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 pl-9" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Tür" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm türler</SelectItem>
            <SelectItem value="image">Görseller</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Departman" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm departmanlar</SelectItem>
            {departments.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="size-6 animate-spin" /> Yükleniyor…</div>
      ) : files.length === 0 ? (
        <EmptyState icon={FolderOpen} title="Henüz dosya yok" description="Görevlere eklenen dosyalar burada toplanır." />
      ) : (
        <div className="space-y-6">
          {/* Görsel ekler — grid önizleme */}
          {images.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ImageIcon className="h-4 w-4" /> Görseller ({images.length})</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {images.map((f) => (
                  <div key={f.id} className="group overflow-hidden rounded-xl border border-border/60 bg-card">
                    <a href={f.path} target="_blank" rel="noopener noreferrer" className="relative block aspect-square overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.path} alt={f.filename} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                    </a>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-medium">{f.filename}</p>
                      <button onClick={() => onOpenTask(f.task.id)} className="mt-0.5 block max-w-full truncate text-[11px] text-primary hover:underline" title={f.task.title}>
                        {f.task.title}
                      </button>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Avatar className="h-4 w-4"><AvatarFallback className="text-[7px]">{getInitials(f.uploadedBy.name || f.uploadedBy.email)}</AvatarFallback></Avatar>
                          {fmtSize(f.size)}
                        </span>
                        <span>{fmtDate(f.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Belgeler — liste */}
          {docs.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><FileText className="h-4 w-4" /> Belgeler ({docs.length})</h3>
              <Card><CardContent className="divide-y divide-border/60 p-0">
                {docs.map((f) => {
                  const d = departments.find((x) => x.slug === f.task.department);
                  return (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg',
                        f.mime === 'application/pdf' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary')}>
                        <FileText className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.filename}</p>
                        <button onClick={() => onOpenTask(f.task.id)} className="truncate text-xs text-primary hover:underline">{f.task.title}</button>
                        {d && <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ background: d.color }}>{d.name}</span>}
                      </div>
                      <div className="hidden text-right text-xs text-muted-foreground sm:block">
                        <p>{fmtSize(f.size)}</p>
                        <p className="text-[11px]">{fmtDate(f.createdAt)}</p>
                      </div>
                      <a href={f.path} target="_blank" rel="noopener noreferrer" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="İndir">
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  );
                })}
              </CardContent></Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
