import { ArrowRight } from 'lucide-react';
import type { BlogAudience, BlogCategorySlug } from '@/lib/blog-posts';
import { cn } from '@/lib/utils';
import { TrackedLink } from './tracked-link';

const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand px-5 text-sm font-semibold text-brand-fg transition-colors duration-fast ease-standard hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';
const secondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-border bg-surface-1 px-5 text-sm font-medium text-fg transition-colors duration-fast ease-standard hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background';

interface CtaCopy {
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}

function copyFor(audience: BlogAudience, category: BlogCategorySlug | null): CtaCopy {
  if (category === 'gizlilik') {
    return {
      title: 'Verileriniz üzerinde söz sizde',
      body: 'Verilerinizi indirmek, başvuru yapmak ya da çerez tercihinizi değiştirmek için hesabınızın gizlilik bölümüne gidin.',
      primary: { label: 'Ayarlar › Gizlilik', href: '/customer/settings?tab=privacy' },
      secondary: { label: 'KVKK Aydınlatma Metni', href: '/kvkk-aydinlatma-metni' },
    };
  }
  if (audience === 'consumer') {
    return {
      title: 'QR okut, geri bildirim ver, puan kazan',
      body: 'Ücretsiz hesabınla geri bildirimlerin işletmeye ulaşır; puan, rozet ve ödül kazanırsın.',
      primary: { label: 'Ücretsiz hesap aç', href: '/auth/register' },
      secondary: { label: 'Giriş yap', href: '/auth/login' },
    };
  }
  return {
    title: 'İşletmeniz için QR geri bildirimi bugün başlatın',
    body: 'Ücretsiz planla başlayın: kayıt ekranında “İşletme” hesap türünü seçin, ilk QR kodunuzu dakikalar içinde oluşturun.',
    primary: { label: 'İşletmeni ücretsiz ekle', href: '/auth/register' },
    secondary: { label: 'Neden QRateX?', href: '/neden-qratex' },
  };
}

/** Kitleye ve kategoriye göre dönüşüm bandı; tıklamalar rızaya bağlı `blog_cta_click` olayı. */
export function BlogCta({
  audience,
  category,
  source,
  className,
}: {
  audience: BlogAudience;
  category: BlogCategorySlug | null;
  /** Ölçüm için: 'index' ya da yazı slug'ı. */
  source: string;
  className?: string;
}) {
  const c = copyFor(audience, category);
  return (
    <section
      aria-labelledby={`cta-${source}`}
      className={cn('rounded-card border border-brand-border bg-brand-subtle p-6 sm:p-8 print:hidden', className)}
    >
      <h2 id={`cta-${source}`} className="qx-h3 text-xl text-fg">
        {c.title}
      </h2>
      <p className="mt-2 max-w-prose text-base leading-7 text-fg-muted">{c.body}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <TrackedLink href={c.primary.href} event="blog_cta_click" props={{ source, target: c.primary.href, kind: 'primary' }} className={primary}>
          {c.primary.label}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </TrackedLink>
        <TrackedLink href={c.secondary.href} event="blog_cta_click" props={{ source, target: c.secondary.href, kind: 'secondary' }} className={secondary}>
          {c.secondary.label}
        </TrackedLink>
      </div>
    </section>
  );
}
