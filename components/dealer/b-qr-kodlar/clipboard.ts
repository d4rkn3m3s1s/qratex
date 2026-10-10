'use client';

import { toast } from 'sonner';

/** Panoya kopyala; reddedilirse görünür hata (rapor #34: sessiz unhandled rejection). */
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Panoya kopyalanamadı; bağlantıyı elle seçip kopyalayın.');
  }
}
