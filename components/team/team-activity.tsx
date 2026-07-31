'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { Loader2, Activity, CheckSquare, MessageSquare, Paperclip, UserPlus, Flag, Plus } from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';

type FeedItem = {
  id: string; action: string; detail: string | null; createdAt: string;
  actor: { id: string; name: string | null; email: string; image: string | null };
  task: { id: string; title: string; department: string | null; status: string };
};

function actionMeta(action: string): { icon: typeof Activity; tone: string } {
  switch (action) {
    case 'created': return { icon: Plus, tone: 'text-sky-500 bg-sky-500/10' };
    case 'status': return { icon: CheckSquare, tone: 'text-emerald-500 bg-emerald-500/10' };
    case 'assigned': return { icon: UserPlus, tone: 'text-violet-500 bg-violet-500/10' };
    case 'priority': return { icon: Flag, tone: 'text-amber-500 bg-amber-500/10' };
    case 'commented':
    case 'mentioned': return { icon: MessageSquare, tone: 'text-blue-500 bg-blue-500/10' };
    case 'attachment': return { icon: Paperclip, tone: 'text-fuchsia-500 bg-fuchsia-500/10' };
    default: return { icon: Activity, tone: 'text-slate-500 bg-slate-500/10' };
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

/** Ekip Aktivite Akışı — tüm görev aktivitesi tek yerde (canlı feed). */
export function TeamActivity({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/team/activity', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setItems(json.activities);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="size-6 animate-spin" /> Yükleniyor…</div>;
  }
  if (items.length === 0) {
    return <EmptyState icon={Activity} title="Henüz aktivite yok" description="Görev oluşturma, durum değişimi, yorum ve dosya işlemleri burada akar." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="relative space-y-0 py-2">
          {items.map((a, i) => {
            const { icon: Icon, tone } = actionMeta(a.action);
            return (
              <div key={a.id} className={cn('relative flex gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40', i !== items.length - 1 && 'border-b border-border/40')}>
                <span className={cn('z-10 mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', tone)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    <span className="font-semibold">{a.actor.name || a.actor.email.split('@')[0]}</span>{' '}
                    <span className="text-muted-foreground">{a.detail || a.action}</span>
                  </p>
                  <button onClick={() => onOpenTask(a.task.id)} className="mt-0.5 block max-w-full truncate text-xs text-primary hover:underline" title={a.task.title}>
                    {a.task.title}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{relTime(a.createdAt)}</span>
                  <Avatar className="h-6 w-6">
                    {a.actor.image ? <AvatarImage src={a.actor.image} /> : null}
                    <AvatarFallback className="text-[8px]">{getInitials(a.actor.name || a.actor.email)}</AvatarFallback>
                  </Avatar>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
