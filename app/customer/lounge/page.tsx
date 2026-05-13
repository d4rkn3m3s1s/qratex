'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, Cake, Sparkles, Gift, ArrowLeft, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { toast } from '@/lib/admin-toast';

type LoungePayload = {
  perks?: string[];
  vip: {
    tierName: string;
    minPoints: number;
    order: number;
    totalSpent: number;
    lifetimePoints: number;
    tierExpiry: string | null;
  } | null;
  birthday: {
    birthDate: string;
    bonusGiven: boolean;
    daysUntilBirthday: number | null;
    isBirthdayToday: boolean;
    canClaimBirthdayBonus: boolean;
    bonusAmount: number;
  } | null;
  birthdayBonusAmount: number;
  points: number;
  level: number;
};

export default function CustomerLoungePage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const [data, setData] = useState<LoungePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/customer/lounge');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t('customerLounge.loadError'));
        if (!cancelled) setData(json.lounge);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : t('common.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadLounge = async () => {
    const res = await fetch('/api/customer/lounge');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || t('customerLounge.loadError'));
    setData(json.lounge);
  };

  const handleClaimBirthday = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('common.error'));
      await reloadLounge();
      toast.success(json.message || t('customerLounge.claimBirthdaySuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="space-y-6 pb-6 max-w-lg mx-auto">
      <Button variant="ghost" size="sm" asChild className="-mb-2 w-full sm:w-fit min-h-10 touch-manipulation justify-center sm:justify-start">
        <Link href="/customer">
          <ArrowLeft className="h-4 w-4 shrink-0 mr-2" />
          {t('customerLounge.backToDashboard')}
        </Link>
      </Button>

      <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 sm:p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-balance">
          <Sparkles className="h-7 w-7 shrink-0 text-amber-400" />
          {t('customerLounge.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 text-pretty leading-relaxed">{t('customerLounge.description')}</p>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        </div>
      )}
      {err && !loading && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">{err}</CardContent>
        </Card>
      )}

      {!loading && !err && data && (
        <div className="space-y-4">
          <Card className="border-amber-500/25 bg-gradient-to-br from-amber-500/5 to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Crown className="h-5 w-5 text-amber-500" />
                {t('customerLounge.vipTitle')}
              </CardTitle>
              <CardDescription>{t('customerLounge.vipDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.vip ? (
                <>
                  <p className="text-2xl font-semibold">{data.vip.tierName}</p>
                  <p className="text-muted-foreground">
                    {t('customerLounge.lifetimePoints')}: {data.vip.lifetimePoints.toLocaleString(dateLocale)} · {t('customerLounge.totalSpent')}:{' '}
                    {data.vip.totalSpent.toLocaleString(dateLocale, { maximumFractionDigits: 0 })} ₺
                  </p>
                  {data.vip.tierExpiry && (
                    <Badge variant="outline" className="text-xs">
                      {t('customerLounge.tierRenewal')}: {new Date(data.vip.tierExpiry).toLocaleDateString(dateLocale)}
                    </Badge>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {t('customerLounge.noVip')}
                </p>
              )}
              <p className="text-xs text-muted-foreground pt-2">
                {t('customerLounge.totalPoints')}: {data.points.toLocaleString(dateLocale)} · {t('customerLounge.level')} {data.level}
              </p>
            </CardContent>
          </Card>

          {data.perks && data.perks.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                  {t('customerLounge.perksTitle')}
                </CardTitle>
                <CardDescription>{t('customerLounge.perksDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                  {data.perks.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cake className="h-5 w-5 text-primary" />
                {t('customerLounge.birthdayTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              {data.birthday ? (
                <>
                  <p>
                    {t('customerLounge.date')}:{' '}
                    <span className="font-medium">
                      {new Date(data.birthday.birthDate).toLocaleDateString(dateLocale, {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </span>
                  </p>
                  {data.birthday.daysUntilBirthday != null && !data.birthday.isBirthdayToday && (
                    <p className="text-muted-foreground">
                      {t('customerLounge.nextCelebrationIn')} {data.birthday.daysUntilBirthday} {t('customerLounge.dayLater')}
                    </p>
                  )}
                  {data.birthday.isBirthdayToday && (
                    <p className="text-primary font-medium">{t('customerLounge.birthdayToday')}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('customerLounge.birthdayBonusHint').replace('{n}', String(data.birthday.bonusAmount))}
                  </p>
                  {data.birthday.canClaimBirthdayBonus && (
                    <Button
                      type="button"
                      disabled={claiming}
                      className="w-full touch-manipulation min-h-10"
                      onClick={() => void handleClaimBirthday()}
                    >
                      {claiming ? t('customerLounge.claimingBirthday') : t('customerLounge.claimBirthdayBonus')}
                    </Button>
                  )}
                  {data.birthday.isBirthdayToday && !data.birthday.canClaimBirthdayBonus && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {t('customerLounge.birthdayBonusClaimedThisYear')}
                    </Badge>
                  )}
                  <Button asChild variant="outline" size="sm" className="w-full touch-manipulation min-h-10">
                    <Link href="/customer/settings">{t('customerLounge.birthdayEditInSettings')}</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{t('customerLounge.noBirthday')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('customerLounge.birthdayBonusHintUnset').replace('{n}', String(data.birthdayBonusAmount))}
                  </p>
                  <Button asChild variant="default" className="w-full touch-manipulation min-h-10">
                    <Link href="/customer/settings">{t('customerLounge.birthdayAddInSettings')}</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="w-full touch-manipulation min-h-10 gap-2 justify-center">
            <Link href="/customer/surprise-boxes">
              <Gift className="h-4 w-4 mr-2" />
              {t('customerLounge.surpriseBoxes')}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
