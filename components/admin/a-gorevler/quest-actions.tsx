'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Copy, Loader2, MoreHorizontal, Pause, Pencil, Play, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { QuestActionInput, QuestListItem } from '@/lib/admin-quests/contract';
import { QuestsApiError, errorText, questAction, questsKeys } from './api';
import { AdminGorevlerText } from './copy';

type Dlg = null | 'archive' | 'manual';

/**
 * Görev eylemleri — her zaman görünür "⋯" menüsü (hover'a bağlı görünmez buton yok, Bulgu 12).
 * Arşiv gerekçe ister; "Kullanıcıyı tamamla" yalnız Yönetici onaylı görevlerde çıkar.
 */
export function QuestActions({
  quest,
  onEdit,
  onOpenCreated,
  variant = 'menu',
}: {
  quest: QuestListItem;
  onEdit: (id: string) => void;
  onOpenCreated?: (id: string) => void;
  variant?: 'menu' | 'buttons';
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);

  const run = async (body: QuestActionInput): Promise<boolean> => {
    setBusy(body.action);
    try {
      const r = await questAction(quest.id, body);
      toast.success(r.message);
      await qc.invalidateQueries({ queryKey: questsKeys.all });
      if (r.createdId && onOpenCreated) onOpenCreated(r.createdId);
      return true;
    } catch (e) {
      if (e instanceof QuestsApiError && e.code === 'VALIDATION' && body.action === 'manual_complete') throw e;
      toast.error(errorText(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const archived = quest.status === 'archived';
  const canPause = quest.isActive && !archived;
  const canResume = !quest.isActive && !archived && quest.status !== 'expired';
  const canManual = quest.mechanic === 'custom' && !quest.isAchievement && quest.status === 'active' && quest.rawMechanic === 'custom';

  const items = (
    <>
      {!archived ? (
        <DropdownMenuItem onSelect={() => onEdit(quest.id)}>
          <Pencil className="h-4 w-4" aria-hidden />
          Düzenle
        </DropdownMenuItem>
      ) : null}
      {canPause ? (
        <DropdownMenuItem onSelect={() => void run({ action: 'pause' })}>
          <Pause className="h-4 w-4" aria-hidden />
          Duraklat
        </DropdownMenuItem>
      ) : null}
      {canResume ? (
        <DropdownMenuItem onSelect={() => void run({ action: 'resume' })}>
          <Play className="h-4 w-4" aria-hidden />
          Yayına al
        </DropdownMenuItem>
      ) : null}
      {canManual ? (
        <DropdownMenuItem onSelect={() => setDlg('manual')}>
          <UserCheck className="h-4 w-4" aria-hidden />
          Kullanıcıyı tamamla…
        </DropdownMenuItem>
      ) : null}
      {!quest.isAchievement ? (
        <DropdownMenuItem onSelect={() => void run({ action: 'duplicate' })}>
          <Copy className="h-4 w-4" aria-hidden />
          Kopyala
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      {archived ? (
        <DropdownMenuItem onSelect={() => void run({ action: 'restore' })}>
          <ArchiveRestore className="h-4 w-4" aria-hidden />
          Arşivden çıkar
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDlg('archive')}>
          <Archive className="h-4 w-4" aria-hidden />
          Arşivle…
        </DropdownMenuItem>
      )}
    </>
  );

  return (
    <>
      {variant === 'buttons' ? (
        <div className="flex flex-wrap gap-2">
          {!archived ? (
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => onEdit(quest.id)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Düzenle
            </Button>
          ) : null}
          {canPause ? (
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={!!busy} onClick={() => void run({ action: 'pause' })}>
              {busy === 'pause' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              Duraklat
            </Button>
          ) : null}
          {canResume ? (
            <Button size="sm" className="min-h-11 sm:min-h-9" disabled={!!busy} onClick={() => void run({ action: 'resume' })}>
              {busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              Yayına al
            </Button>
          ) : null}
          {canManual ? (
            <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setDlg('manual')}>
              <UserCheck className="h-4 w-4" aria-hidden />
              Kullanıcıyı tamamla
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9" aria-label={`${quest.name}: diğer işlemler`} disabled={!!busy}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{items}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
              aria-label={`${quest.name}: işlemler`}
              aria-busy={busy ? true : undefined}
              disabled={!!busy}
              onClick={(e) => e.stopPropagation()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <MoreHorizontal className="h-4 w-4" aria-hidden />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ArchiveDialog
        open={dlg === 'archive'}
        onOpenChange={(o) => setDlg(o ? 'archive' : null)}
        quest={quest}
        onConfirm={async (reason) => {
          if (await run({ action: 'archive', reason })) setDlg(null);
        }}
        busy={busy === 'archive'}
      />
      <ManualCompleteDialog
        open={dlg === 'manual'}
        onOpenChange={(o) => setDlg(o ? 'manual' : null)}
        quest={quest}
        onConfirm={async (user, reason) => {
          if (await run({ action: 'manual_complete', user, reason })) setDlg(null);
        }}
        busy={busy === 'manual_complete'}
      />
    </>
  );
}

function ArchiveDialog({
  open,
  onOpenChange,
  quest,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quest: QuestListItem;
  onConfirm: (reason: string) => Promise<void>;
  busy: boolean;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><AdminGorevlerText k="archiveQ" /></DialogTitle>
          <DialogDescription>
            “{quest.name}” müşterilerden kalkar ve yeni ilerleme/ödeme almaz. Silme yapılmaz: {quest.metrics.participants.toLocaleString('tr-TR')} kullanıcının ilerlemesi ve ödeme kayıtları korunur; görevi arşivden geri çıkarabilirsiniz.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) void onConfirm(reason.trim());
          }}
        >
          <Label htmlFor={`${id}-reason`}><AdminGorevlerText k="reason" /></Label>
          <Textarea id={`${id}-reason`} value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} placeholder="Örn: Kampanya dönemi bitti" aria-describedby={`${id}-hint`} />
          <p id={`${id}-hint`} className="qx-caption text-fg-muted">
            Denetim geçmişine yazılır (en az 3 karakter).
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" variant="destructive" className="min-h-11 sm:min-h-10" disabled={!valid || busy} aria-busy={busy || undefined}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
              Arşivle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManualCompleteDialog({
  open,
  onOpenChange,
  quest,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quest: QuestListItem;
  onConfirm: (user: string, reason: string) => Promise<void>;
  busy: boolean;
}) {
  const id = useId();
  const [user, setUser] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const valid = user.trim().length >= 3 && reason.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle><AdminGorevlerText k="markComplete" /></DialogTitle>
          <DialogDescription>
            “{quest.name}” bu kullanıcı için bu dönemde tamamlanmış sayılır. Puan burada verilmez: müşteri bildirimi alır ve ödülü Görevler sayfasından kendisi alır (tek seferlik defter kaydı).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || busy) return;
            setErr(null);
            try {
              await onConfirm(user.trim(), reason.trim());
              setUser('');
              setReason('');
            } catch (ex) {
              setErr(errorText(ex));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-user`}><AdminGorevlerText k="userLookup" /></Label>
            <Input
              id={`${id}-user`}
              value={user}
              autoComplete="off"
              className="min-h-11 sm:min-h-10"
              onChange={(e) => setUser(e.target.value)}
              aria-invalid={err ? true : undefined}
              aria-describedby={err ? `${id}-err` : undefined}
            />
            {err ? (
              <p id={`${id}-err`} role="alert" className="qx-caption text-danger">
                {err}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`}><AdminGorevlerText k="reason" /></Label>
            <Textarea id={`${id}-reason`} value={reason} maxLength={300} rows={2} onChange={(e) => setReason(e.target.value)} placeholder="Örn: 12 Ekim tadım etkinliğine katıldı" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11 sm:min-h-10" disabled={!valid || busy} aria-busy={busy || undefined}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
              Tamamlandı işaretle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
