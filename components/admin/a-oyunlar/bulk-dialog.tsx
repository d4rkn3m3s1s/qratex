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
        r.changed.length === 0
          ? 'Değişiklik gerekmedi'
          : `${r.changed.length} oyun ${disable ? 'kapatıldı — yeni ödüller derhal durdu' : 'açıldı'}`
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
          <DialogTitle>{disable ? 'Oyunları kapat' : 'Oyunları aç'}</DialogTitle>
          <DialogDescription>
            {disable
              ? 'Kapatılan oyunda yeni deneme açılmaz ve süren denemeler tamamlansa da ödül almaz. Geri açmak mümkündür.'
              : 'Açılan oyunlar hub’da görünür ve ödüllü deneme kabul eder (portföyden çıkarılmış oyunlar yine gizli kalır).'}
          </DialogDescription>
        </DialogHeader>

        {affected.length === 0 ? (
          <p className="text-sm text-fg-muted">Seçilen oyunların hepsi zaten {disable ? 'kapalı' : 'açık'}.</p>
        ) : (
          <div className="space-y-3">
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-control border border-border p-2 text-sm">
              {affected.map((g) => (
                <li key={g.gameType} className="flex items-center justify-between gap-2">
                  <span>
                    <span aria-hidden>{g.effective.emoji}</span> {g.effective.title}
                  </span>
                  <span className="text-xs tabular-nums text-fg-muted">30g {fmt(g.stats.pointsAwarded30d)} puan</span>
                </li>
              ))}
            </ul>
            {disable && (
              <p className="text-xs text-fg-muted">
                Bu oyunlar son 30 günde toplam <strong className="text-fg">{fmt(points30)}</strong> puan bastı.
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor={reasonId}>Gerekçe (denetim kaydına yazılır)</Label>
              <Textarea
                id={reasonId}
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder={disable ? 'Ör. skor istismarı şüphesi, inceleme süresince' : 'Ör. inceleme tamamlandı'}
              />
              <p className="text-[11px] text-fg-muted">{reason.length}/200</p>
            </div>
          </div>
        )}

        {mut.isError && <InlineError variant="banner">{errorText(mut.error)}</InlineError>}

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="min-h-11 sm:min-h-10" onClick={onClose} disabled={mut.isPending}>
            Vazgeç
          </Button>
          <Button
            variant={disable ? 'destructive' : 'default'}
            className="min-h-11 sm:min-h-10"
            disabled={!valid || mut.isPending}
            loading={mut.isPending}
            onClick={() => mut.mutate()}
          >
            {disable ? `${affected.length} oyunu kapat` : `${affected.length} oyunu aç`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
