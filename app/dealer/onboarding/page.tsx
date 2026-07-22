'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Rocket,
  CheckCircle2,
  Circle,
  Building2,
  MapPin,
  QrCode,
  Package,
  MessageSquare,
  CreditCard,
  ArrowRight,
  PartyPopper,
} from 'lucide-react';
import { toast } from '@/lib/admin-toast';

type Step = { key: string; done: boolean; href: string; required: boolean };
type OnboardingData = { steps: Step[]; completedCount: number; total: number; complete: boolean };

const META: Record<string, { icon: typeof QrCode; title: string; desc: string; cta: string }> = {
  profile: {
    icon: Building2,
    title: 'İşletme profilini tamamla',
    desc: 'İşletme adı ve açıklaması — müşterilerin seni tanıması için.',
    cta: 'Profili düzenle',
  },
  location: {
    icon: MapPin,
    title: 'Konum ekle',
    desc: 'Adres/konum — keşfet ve harita özelliklerinde görünmek için.',
    cta: 'Konum ekle',
  },
  qr: {
    icon: QrCode,
    title: 'İlk QR kodunu oluştur',
    desc: 'Müşterilerin tarayıp geri bildirim bırakacağı QR kodu.',
    cta: 'QR oluştur',
  },
  product: {
    icon: Package,
    title: 'İlk ürününü ekle',
    desc: 'Tüketim kaydı ve ürün-bazlı analitik için ürün kataloğu.',
    cta: 'Ürün ekle',
  },
  feedback: {
    icon: MessageSquare,
    title: 'İlk geri bildirimini topla',
    desc: 'QR kodunu masaya/kasaya koy; ilk müşteri yorumun gelsin.',
    cta: 'QR’ı paylaş',
  },
  plan: {
    icon: CreditCard,
    title: 'Planını seç',
    desc: 'QR kotanı yükselt, daha fazla özelliğin kilidini aç.',
    cta: 'Planları gör',
  },
};

export default function DealerOnboardingPage() {
  const router = useRouter();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dealer/onboarding')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => toast.error('Kurulum durumu yüklenemedi'))
      .finally(() => setLoading(false));
  }, []);

  const pct = data ? Math.round((data.completedCount / data.total) * 100) : 0;
  const nextStep = data?.steps.find((s) => !s.done);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <DashboardPageHero
        title="Kurulum Sihirbazı"
        description="Birkaç adımda QRateX’i işletmen için hazır hale getir"
        icon={<Rocket className="text-white" />}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Veri yüklenemedi.</p>
      ) : (
        <>
          {/* İlerleme */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {data.completedCount}/{data.total} adım tamamlandı
                </p>
                <span className="text-sm text-muted-foreground">%{pct}</span>
              </div>
              <Progress value={pct} className="h-2.5" />
              {data.complete ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
                  <PartyPopper className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Harika! Temel kurulum tamamlandı. Panele geçebilirsin.
                  <Button size="sm" className="ml-auto" onClick={() => router.push('/dealer')}>
                    Panele git
                  </Button>
                </div>
              ) : (
                nextStep && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
                    Sıradaki adım: <strong>{META[nextStep.key]?.title}</strong>
                    <Button asChild size="sm" className="ml-auto">
                      <Link href={nextStep.href}>
                        {META[nextStep.key]?.cta}
                        <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Adımlar */}
          <div className="space-y-3">
            {data.steps.map((step, i) => {
              const meta = META[step.key];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <Card
                  key={step.key}
                  className={step.done ? 'border-emerald-500/30 bg-emerald-500/5' : ''}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">
                      {step.done ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <span className="text-muted-foreground">{i + 1}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <p className={`font-medium ${step.done ? 'text-muted-foreground line-through' : ''}`}>
                          {meta.title}
                        </p>
                        {!step.required && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            opsiyonel
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{meta.desc}</p>
                    </div>
                    {!step.done && (
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={step.href}>
                          {meta.cta}
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
