'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineError } from '@/components/states';
import { cn } from '@/lib/utils';
import { errorText, UsersApiError } from './api';
import { initials } from './format';

export function UserAvatar({ name, email, image, size = 'md' }: { name: string | null; email: string; image: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <Avatar className={cn(cls, 'shrink-0 border border-subtle')}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="bg-brand-subtle font-semibold text-brand-text">{initials(name, email)}</AvatarFallback>
    </Avatar>
  );
}

/** Sunucu doğrulama hatasından alan mesajı (`details: [{ path, message }]`). */
export function fieldError(err: unknown, path: string): string | undefined {
  if (!(err instanceof UsersApiError) || !Array.isArray(err.details)) return undefined;
  const hit = (err.details as Array<{ path?: unknown; message?: unknown }>).find(
    (d) => typeof d.path === 'string' && (d.path === path || d.path.endsWith(`.${path}`))
  );
  return typeof hit?.message === 'string' ? hit.message : undefined;
}

export function FormField({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Gerekçe isteyen onay diyaloğu (askıya alma, rozet geri alma…). Hata olursa açık kalır ve
 * sunucu mesajını gösterir; başarıda kapanır.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = 'Gerekçe',
  minLength = 3,
  maxLength = 500,
  confirmLabel,
  tone = 'warning',
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  label?: string;
  minLength?: number;
  maxLength?: number;
  confirmLabel: ReactNode;
  tone?: 'warning' | 'danger' | 'brand';
  onConfirm: (reason: string) => Promise<unknown>;
  children?: ReactNode;
}) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);
  const valid = reason.trim().length >= minLength;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || busy) return;
            setBusy(true);
            setError(null);
            try {
              await onConfirm(reason.trim());
              onOpenChange(false);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <FormField htmlFor={`${id}-reason`} label={label} hint={`En az ${minLength} karakter. Denetim kaydına yazılır.`}>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, maxLength))}
              rows={3}
              required
              aria-describedby={`${id}-reason-hint`}
            />
          </FormField>
          {error ? <InlineError>{error}</InlineError> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" variant={tone === 'danger' ? 'destructive' : 'default'} disabled={!valid || busy} aria-busy={busy}>
              {busy ? 'İşleniyor…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Basit sayfalayıcı (sekme içi listeler). */
export function Pager({ page, pageCount, total, onPage, label }: { page: number; pageCount: number; total: number; onPage: (p: number) => void; label: string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={`${label} sayfaları`} className="flex items-center justify-between gap-2 pt-3 text-sm text-fg-muted">
      <span>
        Sayfa {page} / {pageCount} · {total.toLocaleString('tr-TR')} kayıt
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Önceki
        </Button>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Sonraki
        </Button>
      </div>
    </nav>
  );
}
