'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import type { GameRow } from '@/lib/admin-games/contract';
import { bulkGames, errorText, fmt, gamesKeys } from './api';
import { useGamesCopy } from './copy';
import { useGamesCopy } from './copy';

/**
 * Toplu aç/kapat (acil durdurma dahil) — gerekçe zorunlu, her oyun ayrı audit satırı.
 * Etki önizlemesi: değişecek oyunlar ve son 30 günde bu oyunların bastığı puan.
 */
export function BulkDialog({
  action,
  games,
  onClose,
  onDone,
}: {
  action: 'disable' | 'enable';
  games: GameRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const c = useGamesCopy().bulk;
  const c = useGamesCopy().bulk;
  const qc = useQueryClient();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const disable = action === 'disable';
  const affected = games.filter((g) => g.effective.enabled === disable);
  const points30 = affected.reduce((a, g) => a + g.stats.pointsAwarded30d, 0);

  const mut = useMutation({
    mutationFn: () => bulkGames({ action, gameTypes: affected.map((g) => g.gameType), reason: reason.trim() }),
    onSuccess: (r) => {
      toast.success(
        r.changed.length === 0 ? c.noChange : c.changed(r.changed.length, disable)
      );
      void qc.invalidateQueries({ queryKey: gamesKeys.all });
      onDone();
    },
  });

  const valid = reason.trim().length >= 3 && affected.length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && !mut.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{c.title(disable)}</DialogTitle>
          <DialogDescription>
            {disable ? c.descDisable : c.descEnable}
          </DialogDescription>
        </DialogHeader>

        {affected.length === 0 ? (
          <p className="text-sm text-fg-muted">{c.allAlready(disable)}</p>
        ) : (
          <div className="space-y-3">
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-control border border-border p-2 text-sm">
              {affected.map((g) => (
                <li key={g.gameType} className="flex items-center justify-between gap-2">
                  <span>
                    <span aria-hidden>{g.effective.emoji}</span> {g.effective.title}
                  </span>
                  <span className="text-xs tabular-nums text-fg-muted">{c.row30(fmt(g.stats.pointsAwarded30d))}</span>
                </li>
              ))}
            </ul>
            {disable && (
              <p className="text-xs text-fg-muted">
                {c.pointsBefore} <strong className="text-fg">{fmt(points30)}</strong> {c.pointsAfter}
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor={reasonId}>{c.reason}</Label>
              <Textarea
                id={reasonId}
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder={disable ? c.phDisable : c.phEnable}
              />
              <p className="text-[11px] text-fg-muted">{reason.length}/200</p>
            </div>
          </div>
        )}

        {mut.isError && <InlineError variant="banner">{errorText(mut.error)}</InlineError>}

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="min-h-11 sm:min-h-10" onClick={onClose} disabled={mut.isPending}>
            {c.cancel}
          </Button>
          <Button
            variant={disable ? 'destructive' : 'default'}
            className="min-h-11 sm:min-h-10"
            disabled={!valid || mut.isPending}
            loading={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {c.confirm(affected.length, disable)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
