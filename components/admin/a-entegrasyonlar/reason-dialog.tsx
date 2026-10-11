'use client';

import { useId, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import { errorText } from './api';
import { AdminEntegrasyonlarText } from './copy';

/** Gerekçe zorunlu yıkıcı aksiyon (anahtar iptali). Hata olursa açık kalır ve görünür. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = reason.trim().length >= 3;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        if (!v) {
          setReason('');
          setErr(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid) return;
            setBusy(true);
            setErr(null);
            try {
              await onConfirm(reason.trim());
              setReason('');
              onOpenChange(false);
            } catch (x) {
              setErr(errorText(x));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-r`}><AdminEntegrasyonlarText k="reasonAudited" /></Label>
            <Textarea id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} placeholder="ör. Anahtar ekran paylaşımında göründü" autoFocus />
          </div>
          {err ? <InlineError>{err}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" variant="destructive" className="min-h-11" disabled={!valid || busy} aria-busy={busy}>
              {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
