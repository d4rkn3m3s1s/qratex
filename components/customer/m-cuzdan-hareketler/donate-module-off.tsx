'use client';

import { ErrorState } from '@/components/states';
import { useMovesCopy } from './copy';
import { HistoryTab } from './history-tab';
import { useSearchParamState } from './use-param';

/** Bağış modülü kapalı: dürüst kilit ekranı + kişinin kendi bağış geçmişi (makbuzları korunur). */
export function DonateModuleOff() {
  const { copy } = useMovesCopy();
  const url = useSearchParamState();
  return (
    <div className="space-y-4">
      <ErrorState kind="moduleDisabled" title={copy.moduleOffTitle} description={copy.moduleOffDesc} headingLevel="h2" />
      <section aria-labelledby="donate-off-history" className="space-y-2">
        <h2 id="donate-off-history" className="qx-h3 text-fg">
          {copy.donateTabs.history}
        </h2>
        <HistoryTab
          onBrowse={null}
          receiptId={url.get('receipt')}
          onOpenReceipt={(id) => url.patch({ receipt: id })}
          onCloseReceipt={() => url.patch({ receipt: null })}
        />
      </section>
    </div>
  );
}
