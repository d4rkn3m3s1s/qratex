import type { Metadata } from 'next';
import { getSeoSettings } from '@/lib/seo-settings';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

/**
 * /auth/* için sekme başlığı şablonu: alt segment başlığı + "|" + uygulama adı.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [seo, locale] = await Promise.all([getSeoSettings(), getServerLocale()]);
  const appName = t(locale, 'common.appName');
  const suffix = seo.siteName?.trim() || appName;
  return {
    title: {
      default: suffix,
      template: `%s | ${suffix}`,
    },
    applicationName: seo.siteName,
  };
}

export default function AuthRoutesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
