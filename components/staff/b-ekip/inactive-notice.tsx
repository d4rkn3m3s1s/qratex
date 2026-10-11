'use client';

import { ErrorState } from '@/components/states';
import { useStaffCopy } from './copy';

/** Pasif (işletmece devre dışı bırakılmış) personel ekranı. */
export function StaffInactiveNotice() {
  const { s } = useStaffCopy();
  return (
    <div className="mx-auto w-full max-w-xl">
      <ErrorState kind="forbidden" variant="page" title={s.inactive.title} description={s.inactive.desc} />
    </div>
  );
}
