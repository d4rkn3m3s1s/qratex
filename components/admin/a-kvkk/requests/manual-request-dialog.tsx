'use client';

/**
 * E-posta, telefon, posta ya da elden gelen KVKK başvurusunu kuyruğa alma diyaloğu.
 * Yasal 30 günlük süre başvurunun ALINDIĞI günden başlar; tarih en fazla 60 gün geriye girilebilir
 * (sunucu da denetler). Başvurana makbuz gider, "alındı" kanıt olayı yöneticiyle yazılır.
 */
import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineError } from '@/components/states';
import { DSR_TYPE_LABELS, type DsrType } from '@/lib/dsr-workflow';
import { DSR_CHANNEL_LABELS, type ManualDsrInput } from '@/lib/admin-privacy/contract';
import { createManualDsr } from './api';

function todayIstanbul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ManualRequestDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const uid = useId();
  const qc = useQueryClient();
  const [type, setType] = useState<DsrType>('access');
  const [channel, setChannel] = useState<ManualDsrInput['channel']>('email');
  const [email, setEmail] = useState('');
  const [receivedOn, setReceivedOn] = useState(todayIstanbul());
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType('access');
      setChannel('email');
      setEmail('');
      setReceivedOn(todayIstanbul());
      setMessage('');
      setError(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      createManualDsr({ type, channel, email: email.trim(), receivedOn: receivedOn || undefined, message: message.trim() || undefined }),
    onSuccess: (res) => {
      (res.linkedAccount ? toast.success : toast.warning)(res.message);
      void qc.invalidateQueries({ queryKey: ['admin-dsr'] });
      void qc.invalidateQueries({ queryKey: ['admin-privacy', 'overview'] });
      onClose();
      onCreated(res.id);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Talep eklenemedi.'),
  });

  const emailValid = EMAIL_RE.test(email.trim());
  const pending = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !pending ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Başvuruyu kuyruğa al</DialogTitle>
          <DialogDescription>
            Müşteri ekranı dışından gelen başvuruyu kaydedin. Yasal süre başvurunun alındığı günden başlar; başvurana makbuz gönderilir.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (emailValid) mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-type`}>Talep türü</Label>
              <select
                id={`${uid}-type`}
                value={type}
                onChange={(e) => setType(e.target.value as DsrType)}
                className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm text-fg"
              >
                {(Object.keys(DSR_TYPE_LABELS) as DsrType[]).map((t) => (
                  <option key={t} value={t}>
                    {DSR_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-channel`}>Geldiği kanal</Label>
              <select
                id={`${uid}-channel`}
                value={channel}
                onChange={(e) => setChannel(e.target.value as ManualDsrInput['channel'])}
                className="h-11 w-full rounded-md border border-border bg-background px-2 text-sm text-fg"
              >
                {(Object.keys(DSR_CHANNEL_LABELS) as Array<ManualDsrInput['channel']>).map((c) => (
                  <option key={c} value={c}>
                    {DSR_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-email`}>Başvuranın e-postası</Label>
            <Input
              id={`${uid}-email`}
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={email.length > 0 && !emailValid}
              aria-describedby={`${uid}-email-hint`}
              className="h-11"
              required
            />
            <p id={`${uid}-email-hint`} className="text-xs text-fg-muted">
              Bu e-postaya kayıtlı hesap varsa talep hesaba bağlanır; yoksa yürütmeden önce kimliği doğrulamanız gerekir.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-date`}>Başvurunun alındığı gün</Label>
            <Input
              id={`${uid}-date`}
              type="date"
              value={receivedOn}
              max={todayIstanbul()}
              onChange={(e) => setReceivedOn(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-msg`}>Başvuru metni (isteğe bağlı)</Label>
            <Textarea id={`${uid}-msg`} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={4000} />
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending} className="min-h-11">
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending || !emailValid} className="min-h-11">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Kuyruğa al
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
