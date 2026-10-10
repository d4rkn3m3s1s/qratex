'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { PanelPage, PageHeader } from '@/components/ds/page';
import { announce } from '@/components/ds/a11y';
import { QueryState } from '@/components/states';
import { moments } from '@/lib/moments/client';
import {
  InviteApiError,
  applyInvite,
  claimInviteMilestones,
  ensureInviteCode,
  fetchInviteOverview,
  inviteKeys,
  type InviteOverview,
} from './invite-api';
import { errorText, formatPoints, useInviteCopy } from './copy';
import { InviteHero } from './invite-hero';
import { InviteStats } from './invite-stats';
import { InviteMilestones } from './invite-milestones';
import { InviteList } from './invite-list';
import { InviteApply, InviteReferredBy, InviteRules } from './invite-side';
import { InviteSkeleton } from './invite-skeleton';

export const INVITE_SHARE_BUTTON_ID = 'invite-share-button';

/**
 * `/customer/me/invite` istemci adası. İlk veri sunucudan gelir (`initial`); eylemlerden sonra
 * yalnız ilgili sorgular tazelenir. Sunucu ilk veriyi alamadıysa (`initial = null`) istemci
 * yeniden dener ve hata `QueryState` ile görünür (asla "boş/sıfır" gibi değil).
 */
export function InviteExperience({ initial, siteName }: { initial: InviteOverview | null; siteName: string }) {
  const { copy, locale } = useInviteCopy();
  const qc = useQueryClient();
  const [justClaimed, setJustClaimed] = useState<number[]>([]);
  const [applyError, setApplyError] = useState<string | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overview = useQuery({
    queryKey: inviteKeys.overview,
    queryFn: fetchInviteOverview,
    initialData: initial ?? undefined,
    staleTime: 30_000,
  });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: inviteKeys.overview });
    void qc.invalidateQueries({ queryKey: inviteKeys.rows });
  };

  // Kod yoksa POST ile hazırla (GET yazmaz). İdempotent; tek sefer otomatik, sonra elle "tekrar dene".
  const ensure = useMutation({
    mutationFn: ensureInviteCode,
    onSuccess: (r) =>
      qc.setQueryData<InviteOverview>(inviteKeys.overview, (old) => (old ? { ...old, code: r.code, codeActive: r.codeActive } : old)),
  });
  const needsCode = !!overview.data && !overview.data.code;
  const ensureMutate = ensure.mutate;
  const ensureIdle = ensure.isIdle;
  useEffect(() => {
    if (needsCode && ensureIdle) ensureMutate();
  }, [needsCode, ensureIdle, ensureMutate]);

  useEffect(
    () => () => {
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    },
    []
  );

  const claim = useMutation({
    mutationFn: claimInviteMilestones,
    onSuccess: (r) => {
      const pts = formatPoints(r.points, locale);
      setJustClaimed(r.milestones);
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setJustClaimed([]), 1200);
      // Puan kapsülü An Motoru'ndan (tek kutlama dili); Host yoksa toast yedeği.
      if (!(r.points > 0 && moments.points({ points: r.points }))) toast.success(copy.claimedToast(pts));
      announce(copy.claimedToast(pts));
      refreshAll();
    },
    onError: (err) => {
      const e = err instanceof InviteApiError ? err : null;
      toast.error(errorText(copy, e?.code, copy.claimError));
      if (e?.code === 'NOTHING_TO_CLAIM') refreshAll();
    },
  });

  const apply = useMutation({
    mutationFn: applyInvite,
    onMutate: () => setApplyError(null),
    onSuccess: (r) => {
      const msg = r.status === 'COMPLETED' ? copy.applyCompleted(formatPoints(r.pointsEarned, locale)) : copy.applyPending;
      if (r.status === 'COMPLETED' && r.pointsEarned > 0) {
        if (!moments.points({ points: r.pointsEarned })) toast.success(msg);
      } else toast.success(msg);
      announce(msg);
      refreshAll();
    },
    onError: (err) => {
      const e = err instanceof InviteApiError ? err : null;
      setApplyError(
        errorText(copy, e?.code, e?.message || copy.actionError, {
          applyWindowDays: overview.data?.limits.applyWindowDays ?? 7,
        })
      );
    },
  });

  const focusShare = () => {
    const btn = document.getElementById(INVITE_SHARE_BUTTON_ID);
    if (btn) {
      btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (btn as HTMLButtonElement).focus({ preventScroll: true });
    }
  };

  return (
    <PanelPage
      register="play"
      header={
        <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} icon={<UserPlus />} />
      }
    >
      <QueryState query={overview} skeleton={<InviteSkeleton />} isEmpty={() => false} loadingLabel={copy.codePreparing}>
        {(data) => {
          const referredPending = data.referredBy?.status === 'PENDING';
          return (
            <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-section">
                {referredPending && data.referredBy && <InviteReferredBy referredBy={data.referredBy} />}
                <InviteHero
                  code={data.code}
                  codeActive={data.codeActive}
                  codeState={data.code ? 'ready' : ensure.isError ? 'error' : 'preparing'}
                  onRetryCode={() => ensure.mutate()}
                  referrerPoints={data.rewards.referrerPoints}
                  referredPoints={data.rewards.referredPoints}
                  pendingTtlDays={data.limits.pendingTtlDays}
                  siteName={siteName}
                  shareButtonId={INVITE_SHARE_BUTTON_ID}
                />
                <InviteStats counts={data.counts} earnings={data.earnings} />
                <InviteMilestones
                  milestones={data.milestones}
                  onClaim={() => claim.mutate()}
                  claiming={claim.isPending}
                  justClaimed={justClaimed}
                />
                <InviteList
                  initial={data.referrals}
                  onShare={focusShare}
                  onChanged={refreshAll}
                  applyWindowDays={data.limits.applyWindowDays}
                />
              </div>
              <aside aria-label={copy.rulesTitle} className="flex min-w-0 flex-col gap-section lg:sticky lg:top-4">
                {!referredPending && data.referredBy && <InviteReferredBy referredBy={data.referredBy} />}
                {data.apply.canApply && (
                  <InviteApply
                    windowEndsAt={data.apply.windowEndsAt}
                    onApply={(code) => apply.mutate(code)}
                    pending={apply.isPending}
                    error={applyError}
                  />
                )}
                <InviteRules limits={data.limits} />
              </aside>
            </div>
          );
        }}
      </QueryState>
    </PanelPage>
  );
}
