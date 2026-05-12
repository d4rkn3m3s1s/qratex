import { Suspense } from 'react';
import { TableSignalClient } from './table-signal-client';

export const metadata = {
  title: 'Masa sinyali',
  description: 'Şikâyet öncesi sessiz haber ver',
};

export default function TableSignalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground text-sm">
          Yükleniyor…
        </div>
      }
    >
      <TableSignalClient />
    </Suspense>
  );
}
