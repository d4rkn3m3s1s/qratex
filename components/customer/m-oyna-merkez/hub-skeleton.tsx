import { SkeletonBlock, SkeletonCards } from '@/components/states';

/**
 * Sabit yükseklikli iskelet: veri gelince yerleşim kaymaz (eski hub'da şerit ve başarım
 * paneli sonradan belirip kartları itiyordu). Statik (shimmer yok).
 */
export function HubSkeleton({ tab, label = 'Yükleniyor…' }: { tab: 'games' | 'tournament'; label?: string }) {
  if (tab === 'tournament') {
    return (
      <div className="space-y-section" aria-busy="true" aria-live="polite">
        <span className="sr-only">{label}</span>
        <SkeletonBlock className="h-56" />
        <SkeletonBlock className="h-80" />
      </div>
    );
  }
  return (
    <div className="space-y-section" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid gap-3 sm:grid-cols-3">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SkeletonBlock className="h-56" />
        <SkeletonBlock className="h-56" />
      </div>
      <SkeletonBlock className="h-64" />
      <SkeletonCards count={6} />
    </div>
  );
}
