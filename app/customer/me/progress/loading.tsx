import { SkeletonBlock } from '@/components/states';
import { getServerLocale } from '@/lib/server-locale';

/** İlerleme iskeleti — gerçek yerleşimi taklit eder (kahraman, bugün şeridi, iki sütun, trendler). */
export default async function ProgressLoading() {
  const en = (await getServerLocale()) === 'en';
  return (
    <div role="status" aria-busy="true" className="mx-auto flex w-full max-w-7xl flex-col gap-section">
      <span className="sr-only">{en ? 'Loading…' : 'Yükleniyor…'}</span>
      <SkeletonBlock className="h-16 max-w-md" />
      <SkeletonBlock className="h-52" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="hidden h-36 lg:block" />
      </div>
      <div className="grid gap-section lg:grid-cols-2">
        <SkeletonBlock className="h-80" />
        <SkeletonBlock className="h-80" />
      </div>
      <SkeletonBlock className="h-64" />
    </div>
  );
}
