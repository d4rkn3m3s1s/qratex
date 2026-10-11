import { SkeletonDetail } from '@/components/states';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl" role="status" aria-busy="true" aria-label="Kullanıcı yükleniyor">
      <SkeletonDetail />
    </div>
  );
}
