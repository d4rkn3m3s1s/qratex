/** Klavye / ekran okuyucu: üst kromu veya yan menüyü tab ile geçmeden ana içeriğe atlama (WCAG). */

type SkipToMainContentProps = {
  /** Hedef `<main id="...">` — dashboard için `dashboard-main`, auth için `auth-main` vb. */
  targetId?: string;
  /** Görünen metin — genel sitede "İçeriğe atla" da kullanılabilir */
  label?: string;
};

export function SkipToMainContent({
  targetId = 'dashboard-main',
  label = 'Ana içeriğe atla',
}: SkipToMainContentProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
    >
      {label}
    </a>
  );
}
