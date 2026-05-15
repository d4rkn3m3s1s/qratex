'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Loader2, ArrowUpRight } from 'lucide-react';
import { toast } from '@/lib/admin-toast';
import { useAppLocale, useAppT } from '@/lib/app-locale';
import { cn } from '@/lib/utils';
import type { ProductRoadmapPayload, RoadmapItemStatus } from '@/lib/product-roadmap-types';

function statusBadgeVariant(status: RoadmapItemStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'shipped') return 'default';
  if (status === 'in_progress') return 'secondary';
  return 'outline';
}

export default function AdminRoadmapPage() {
  const t = useAppT();
  const { locale } = useAppLocale();
  const lang = locale === 'en' ? 'en' : 'tr';
  const [payload, setPayload] = useState<ProductRoadmapPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const df = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'tr-TR', {
        dateStyle: 'medium',
      }),
    [locale]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/product-roadmap', { cache: 'no-store' });
        const json = (await res.json()) as { success?: boolean } & Partial<ProductRoadmapPayload>;
        if (cancelled) return;
        if (!res.ok || !json.success || !json.pillars) {
          toast.error(t('adminRoadmap.loadError'));
          setPayload(null);
          return;
        }
        setPayload({
          version: json.version ?? 1,
          updated: json.updated ?? '',
          pillars: json.pillars,
        });
      } catch {
        if (!cancelled) {
          toast.error(t('adminRoadmap.loadError'));
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const label = (o: { tr: string; en: string }) => (lang === 'en' ? o.en : o.tr);

  return (
    <div className="space-y-8 pb-12">
      <AdminPremiumHero
        eyebrow={t('adminRoadmap.eyebrow')}
        title={t('adminRoadmap.title')}
        description={t('adminRoadmap.description')}
        icon={<GitBranch className="size-7" aria-hidden />}
        tone="auto"
        chips={
          payload?.updated ? (
            <Badge variant="outline" className="font-normal">
              {t('adminRoadmap.updated')}: {df.format(new Date(payload.updated))}
            </Badge>
          ) : null
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" aria-hidden />
          {t('adminRoadmap.loading')}
        </div>
      ) : !payload?.pillars?.length ? (
        <p className="py-16 text-center text-muted-foreground">{t('adminRoadmap.empty')}</p>
      ) : (
        <>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('adminRoadmap.hint')}</p>
          <div className="grid gap-6 lg:grid-cols-3">
            {payload.pillars.map((pillar) => (
              <Card key={pillar.id} className="border-border/80">
                <CardHeader>
                  <CardTitle className="text-lg leading-snug">{label(pillar.title)}</CardTitle>
                  <CardDescription className="font-mono text-[11px]">{pillar.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pillar.items.map((item, idx) => (
                    <div
                      key={`${pillar.id}-${idx}`}
                      className={cn(
                        'rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5',
                        item.href && 'transition-colors hover:bg-muted/25'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusBadgeVariant(item.status)} className="text-[10px] uppercase">
                          {t(`adminRoadmap.status.${item.status}`)}
                        </Badge>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="inline-flex min-w-0 flex-1 items-center gap-1 text-sm font-medium text-primary hover:underline"
                          >
                            <span className="min-w-0 flex-1 text-pretty">{label(item.title)}</span>
                            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                          </Link>
                        ) : (
                          <span className="text-sm font-medium leading-snug text-foreground">{label(item.title)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/platform-pulse"
              className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
            >
              {t('adminRoadmap.linkPulse')}
            </Link>
            <Link
              href="/admin/features"
              className="rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm font-medium hover:border-primary/30"
            >
              {t('adminRoadmap.linkFeatures')}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
