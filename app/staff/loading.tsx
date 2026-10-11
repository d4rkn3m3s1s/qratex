import { SkeletonDetail } from '@/components/states';
import { getServerLocale } from '@/lib/server-locale';
import { t } from '@/i18n/request';

/** Yalnız içerik bölgesi (başlık layout'ta zaten var → çift header yok). */
export default async function StaffLoading() {
  const locale = await getServerLocale();
  return (
    <div className="mx-auto w-full max-w-5xl" role="status" aria-busy="true" aria-label={t(locale, 'appShell.pageLoading')}>
      <SkeletonDetail />
    </div>
  );
}
