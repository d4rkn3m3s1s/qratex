import { SkeletonForm } from '@/components/states';

/** Ayarlar yükleniyor: statik iskelet (shimmer yok, ops kaydı). Sunucu ve istemci ortak. */
export function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="flex items-center gap-4 rounded-card border border-subtle bg-surface-1 p-4 sm:p-5">
        <div className="h-16 w-16 shrink-0 rounded-full bg-surface-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 rounded-chip bg-surface-muted" />
          <div className="h-4 w-56 max-w-full rounded-chip bg-surface-muted" />
        </div>
      </div>
      <div className="flex gap-2 overflow-hidden border-b border-subtle pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 shrink-0 rounded-chip bg-surface-muted" />
        ))}
      </div>
      <SkeletonForm />
    </div>
  );
}
