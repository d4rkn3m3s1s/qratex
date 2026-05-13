'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Cake, Gift, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

function todayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CustomerBirthdayBonusHost() {
  const { data: session, status } = useSession();
  const t = useAppT();
  const [open, setOpen] = useState(false);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [claiming, setClaiming] = useState(false);

  const check = useCallback(async () => {
    if (status !== 'authenticated' || session?.user?.role !== 'CUSTOMER' || !session.user.id) return;
    const day = todayKey(new Date());
    const dismissKey = `qratex_birthday_popup_dismiss_${session.user.id}_${day}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey) === '1') return;

    try {
      const res = await fetch('/api/birthday', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) return;
      if (data.isBirthdayToday && data.canClaimBonus) {
        setBonusAmount(typeof data.bonusAmount === 'number' ? data.bonusAmount : 0);
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [status, session?.user?.role, session?.user?.id]);

  useEffect(() => {
    void check();
  }, [check]);

  const dismiss = () => {
    if (session?.user?.id) {
      const day = todayKey(new Date());
      sessionStorage.setItem(`qratex_birthday_popup_dismiss_${session.user.id}_${day}`, '1');
    }
    setOpen(false);
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : t('common.error'));
      toast.success(data.message || t('customerBirthdayPopup.claimSuccess'));
      dismiss();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setClaiming(false);
    }
  };

  if (status !== 'authenticated' || session?.user?.role !== 'CUSTOMER') return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="sm:max-w-md border-primary/20 bg-gradient-to-b from-primary/10 to-background">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Cake className="h-8 w-8" aria-hidden />
          </div>
          <DialogTitle className="text-center text-xl">{t('customerBirthdayPopup.title')}</DialogTitle>
          <DialogDescription className="text-center text-base text-foreground/90">
            {t('customerBirthdayPopup.description').replace('{n}', String(bonusAmount))}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
          <span className="text-pretty text-center">{t('customerBirthdayPopup.hint')}</span>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full gap-2 touch-manipulation"
            disabled={claiming}
            onClick={() => void claim()}
          >
            <Gift className="h-4 w-4 shrink-0" aria-hidden />
            {claiming ? t('customerBirthdayPopup.claiming') : t('customerBirthdayPopup.claimCta')}
          </Button>
          <Button type="button" variant="ghost" className="w-full touch-manipulation" onClick={dismiss}>
            {t('customerBirthdayPopup.later')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
