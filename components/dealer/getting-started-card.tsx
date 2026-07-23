'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, QrCode, MapPin, MessageSquare, Sparkles, ArrowRight } from 'lucide-react';

export interface GettingStartedStep {
  done: boolean;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: 'qr' | 'location' | 'feedback';
}

const ICONS = {
  qr: QrCode,
  location: MapPin,
  feedback: MessageSquare,
} as const;

/**
 * Yeni bayinin ilk değeri görmesi için rehberli kontrol listesi. Dashboard sıfır
 * veriyle açıldığında (boş grafikler yerine) ne yapacağını net gösterir. Adımlar
 * tamamlandıkça işaretlenir; hepsi tamamsa bileşen render edilmez (çağıran karar verir).
 */
export function GettingStartedCard({
  steps,
  title = 'Hadi başlayalım',
  subtitle = 'QRateX’ten ilk değeri almak için şu adımları tamamla',
}: {
  steps: GettingStartedStep[];
  title?: string;
  subtitle?: string;
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  if (allDone) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>
          {subtitle} · {doneCount}/{steps.length}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step) => {
          const Icon = ICONS[step.icon];
          return (
            <div
              key={step.title}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                step.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className={`font-medium ${step.done ? 'text-muted-foreground line-through' : ''}`}>
                    {step.title}
                  </p>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              </div>
              {!step.done && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link prefetch={false} href={step.href}>
                    {step.cta}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
