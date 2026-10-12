'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { QrCode, MessageSquare, CheckCircle, ArrowRight } from 'lucide-react';
import { useAppT } from '@/lib/app-locale';
import { useFirstRunTurn } from '@/lib/first-run-queue';
import { fetchUiSeen, markUiSeen } from '@/lib/ui-seen';

const STORAGE_KEY = 'qratex-onboarding-done';

type StepDef = { id: string; link?: string };

type RoleSteps = { ns: 'dealer' | 'customer' | 'admin'; steps: StepDef[] };

const STEPS_BY_ROLE: Record<string, RoleSteps> = {
  DEALER: {
    ns: 'dealer',
    steps: [
      { id: 'welcome' },
      { id: 'qr', link: '/dealer/qr-codes' },
      { id: 'feedback', link: '/dealer/inbox' },
    ],
  },
  CUSTOMER: {
    ns: 'customer',
    steps: [
      { id: 'welcome' },
      { id: 'card', link: '/customer/wallet/card' },
      { id: 'scan', link: '/customer/scan' },
    ],
  },
  ADMIN: {
    ns: 'admin',
    steps: [
      { id: 'welcome' },
      { id: 'dashboard', link: '/admin' },
      { id: 'seo', link: '/admin/seo' },
    ],
  },
};

export function OnboardingSheet() {
  const t = useAppT();
  const { data: session, status } = useSession();
  const router = useRouter();
  // İlk açılış sırası (B6): karşılama videosu varsa önce o; doğum günü diyaloğu bundan sonra.
  const [wants, setWants] = useState<boolean | null>(null);
  const [closed, setClosed] = useState(false);
  const [step, setStep] = useState(0);
  const { granted, finish } = useFirstRunTurn('onboarding', wants);
  const open = granted && !closed;

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || !session?.user?.role) {
      setWants(false);
      return;
    }
    let localDone: boolean;
    try {
      localDone = localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      setWants(false);
      return;
    }
    if (localDone) {
      setWants(false);
      return;
    }
    // Sunucu kopyası: başka cihazda / native uygulamada tamamlandıysa tekrar gösterme.
    let cancelled = false;
    void fetchUiSeen().then((seen) => {
      if (cancelled) return;
      if (seen?.onboarding) {
        try {
          localStorage.setItem(STORAGE_KEY, 'true');
        } catch {}
        setWants(false);
      } else {
        setWants(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.role]);

  const persistDone = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
    markUiSeen('onboarding');
  };

  const dismiss = () => {
    setClosed(true);
    finish();
  };

  const role = session?.user?.role ?? 'CUSTOMER';
  const cfg = STEPS_BY_ROLE[role] ?? STEPS_BY_ROLE.CUSTOMER;
  const steps = cfg.steps;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = () => {
    if (current?.link) {
      router.push(current.link);
    }
    if (isLast) {
      persistDone();
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    persistDone();
    dismiss();
  };

  if (!current) return null;

  const title = t(`onboarding.${cfg.ns}.${current.id}.title`);
  const desc = t(`onboarding.${cfg.ns}.${current.id}.desc`);
  const progress = t('onboarding.stepProgress')
    .replace('{{current}}', String(step + 1))
    .replace('{{total}}', String(steps.length));

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>{t('onboarding.sheetTitle')}</SheetTitle>
          <SheetDescription aria-live="polite" aria-atomic="true">
            {progress}
          </SheetDescription>
        </SheetHeader>
        <div className="py-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/10 p-3">
              {current.id === 'welcome' ? (
                <CheckCircle className="h-8 w-8 text-primary" aria-hidden />
              ) : current.link?.includes('qr') || current.link?.includes('scan') ? (
                <QrCode className="h-8 w-8 text-primary" aria-hidden />
              ) : (
                <MessageSquare className="h-8 w-8 text-primary" aria-hidden />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-muted-foreground mt-1">{desc}</p>
            </div>
          </div>
          <div className="flex justify-between mt-8">
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              className="touch-manipulation transition-colors duration-base min-h-11"
            >
              {t('onboarding.skip')}
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              className="touch-manipulation gap-2 transition-colors duration-base min-h-11 min-w-[6.5rem]"
            >
              {isLast ? t('onboarding.finish') : t('onboarding.next')}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
