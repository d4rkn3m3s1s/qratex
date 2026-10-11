import { SkeletonDetail } from '@/components/states';

/** Yalnız içerik bölgesi (başlık layout'ta zaten var → çift header yok). */
export default function StaffLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl" role="status" aria-label="Yükleniyor">
      <SkeletonDetail />
    </div>
  );
}
