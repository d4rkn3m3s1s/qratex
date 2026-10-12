import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CtaLink } from './cta-link';
import { PublicSection } from './section';

/** Kapanış çağrısı: iki kitle, iki net eylem (rol ve kaynak kayda taşınır). */
export function FinalCta({
  title,
  sub,
  primary,
  secondary,
  page,
}: {
  title: string;
  sub: string;
  primary: { label: string; href: string; cta: string };
  secondary?: { label: string; href: string; cta: string };
  page: string;
}) {
  return (
    <PublicSection labelledBy="final-cta-title" className="pb-24">
      <div className="flex flex-col gap-8 rounded-sheet border border-brand-border bg-surface-1 px-6 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-end lg:justify-between">
        <div>
        <h2 id="final-cta-title" className="max-w-2xl text-balance text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
          {title}
        </h2>
        <p className="mt-4 max-w-xl text-base text-fg-muted sm:text-lg">{sub}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" variant="gradient" className="px-8">
            <CtaLink href={primary.href} cta={primary.cta} page={page}>
              {primary.label}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </CtaLink>
          </Button>
          {secondary ? (
            <Button asChild size="lg" variant="outline" className="px-8">
              <CtaLink href={secondary.href} cta={secondary.cta} page={page}>
                {secondary.label}
              </CtaLink>
            </Button>
          ) : null}
        </div>
      </div>
    </PublicSection>
  );
}
