import { SkeletonBlock, SkeletonCards } from '@/components/states';

/** Katalog iskeleti — statik (ops kaydı; azaltılmış harekette de aynı). */
export function CatalogSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-[5.5rem]" />
        <SkeletonBlock className="h-[5.5rem]" />
        <SkeletonBlock className="h-[5.5rem]" />
      </div>
      <SkeletonBlock className="h-11" />
      <SkeletonCards count={6} />
    </div>
  );
}
