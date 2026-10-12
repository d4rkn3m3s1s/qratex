'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { sendJson } from './shared';
import { useTeamCopy } from './copy';
import { FormRow, INPUT_CLS, useHubMutation } from './parts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Personel daveti (A3). Bayi şifre belirlemez; davetli e-postadaki tek kullanımlık bağlantıyla
 * kendi hesabını açar ya da mevcut (müşteri) hesabıyla kendisi onaylar. Sunucu: POST /api/dealer/staff.
 */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { copy } = useTeamCopy();
  const c = copy.invite;
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invite = useHubMutation(
    (v: { email: string; jobTitle?: string }) => sendJson<{ emailSent?: boolean }>('/api/dealer/staff', 'POST', v),
    {
      onSuccess: (r) => {
        if (r && r.emailSent === false) toast.warning(c.sentNoMail);
        else toast.success(c.sent);
        setEmail('');
        setJobTitle('');
        onOpenChange(false);
      },
    }
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setError(c.invalidEmail);
      return;
    }
    setError(null);
    invite.mutate({ email: v, jobTitle: jobTitle.trim() || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !invite.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{c.title}</DialogTitle>
            <DialogDescription>{c.description}</DialogDescription>
          </DialogHeader>
          <FormRow label={c.email} hint={c.emailHint} error={error}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="email"
                inputMode="email"
                autoComplete="off"
                required
                maxLength={191}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className={INPUT_CLS}
                placeholder="ad@ornek.com"
              />
            )}
          </FormRow>
          <FormRow label={c.role} hint={c.roleHint} optional>
            {({ id, describedBy }) => (
              <div className="space-y-2">
                <input
                  id={id}
                  value={jobTitle}
                  maxLength={50}
                  onChange={(e) => setJobTitle(e.target.value)}
                  aria-describedby={describedBy}
                  className={INPUT_CLS}
                />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={c.role}>
                  {c.presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={jobTitle === p}
                      onClick={() => setJobTitle(p)}
                      className={cn(
                        'qx-caption min-h-11 rounded-chip border px-2.5 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        jobTitle === p ? 'border-brand bg-brand-subtle text-brand' : 'border-subtle text-fg-muted hover:text-fg'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </FormRow>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" className="min-h-11" disabled={invite.isPending} aria-busy={invite.isPending}>
              {invite.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
              {invite.isPending ? c.sending : c.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
