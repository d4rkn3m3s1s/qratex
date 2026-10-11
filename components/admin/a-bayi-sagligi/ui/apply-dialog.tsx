'use client';

/**
 * Playbook uygulama diyaloğu — önce sunucu önizlemesi (dryRun: müşteri metni, hedef kitle sayımı,
 * mevcut açık taslak, modül durumu), sonra açık onay. Her açılışta durum sıfırdır (envanter #30).
 */
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError, QueryState } from '@/components/states';
import { announce } from '@/components/ds/a11y';
import { applyPlaybook, previewPlaybook, type ApplyPreview } from '../client/api';
import type { HealthCopy } from '../copy';

export interface ApplyTarget {
  playbookId: string;
  playbookTitle: string;
  dealerId: string;
}

export function ApplyPlaybookDialog({ target, onClose, c }: { target: ApplyTarget | null; onClose: () => void; c: HealthCopy }) {
  const qc = useQueryClient();
  const open = target != null;
  // Tek onay = tek idempotency anahtarı (çift tıklama/yeniden deneme yinelenmez).
  const keyRef = useRef<string>('');
  useEffect(() => {
    if (open) keyRef.current = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
  }, [open, target?.playbookId, target?.dealerId]);

  const preview = useQuery({
    queryKey: ['dealer-health', 'apply-preview', target?.playbookId, target?.dealerId],
    queryFn: () => previewPlaybook(target!.playbookId, target!.dealerId).then((r) => r.preview),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const apply = useMutation({
    mutationFn: () => applyPlaybook(target!.playbookId, target!.dealerId, keyRef.current),
    onSuccess: (res) => {
      toast.success(c.apply.success(res.title));
      announce(c.apply.success(res.title));
      void qc.invalidateQueries({ queryKey: ['dealer-health'] });
      onClose();
    },
  });

  const p = preview.data;
  const blocked = !p || !p.campaignsEnabled || !!p.existingDraft;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          apply.reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target ? c.apply.title(target.playbookTitle) : ''}</DialogTitle>
          <DialogDescription>{c.apply.desc}</DialogDescription>
        </DialogHeader>

        <QueryState query={preview} skeleton="detail" loadingLabel={c.apply.loading} isEmpty={() => false}>
          {(data: ApplyPreview) => (
            <div className="space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-fg-muted">{c.apply.dealer}</dt>
                <dd className="font-medium text-fg">{data.dealer.label}</dd>
                <dt className="text-fg-muted">{c.apply.audience}</dt>
                <dd className="text-fg">{c.apply.segments[data.campaign.segment] ?? data.campaign.segment}</dd>
              </dl>

              <figure className="rounded-xl border border-border bg-surface-2 p-3">
                <figcaption className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <Bell aria-hidden className="h-3.5 w-3.5" />
                  {c.apply.preview}
                </figcaption>
                <p className="text-sm font-semibold text-fg">{data.campaign.title}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{data.campaign.message}</p>
              </figure>

              {data.audience && (
                <p className="flex items-start gap-2 text-sm text-fg">
                  <Users aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
                  <span>{c.apply.audienceCount(data.audience.total, data.audience.reachable)}</span>
                </p>
              )}
              {data.audience && data.audience.total === 0 && (
                <InlineError variant="banner" tone="warning">
                  {c.apply.audienceEmpty}
                </InlineError>
              )}
              {!data.campaignsEnabled && (
                <InlineError variant="banner" tone="danger">
                  {c.apply.disabled}
                </InlineError>
              )}
              {data.existingDraft && (
                <InlineError variant="banner" tone="info">
                  {c.apply.existing}
                </InlineError>
              )}
              {data.campaignsEnabled && !data.existingDraft && <p className="text-xs text-fg-subtle">{c.apply.notify}</p>}
              {apply.isError && (
                <InlineError variant="banner" tone="danger">
                  {(apply.error as Error).message}
                </InlineError>
              )}
            </div>
          )}
        </QueryState>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="min-h-11">
            {c.apply.cancel}
          </Button>
          <Button onClick={() => apply.mutate()} disabled={blocked || apply.isPending} className="min-h-11">
            {apply.isPending && <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />}
            {apply.isPending ? c.apply.applying : c.apply.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
