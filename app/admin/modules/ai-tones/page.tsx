import { permanentRedirect } from 'next/navigation';
import { legacyStudioHref } from '@/lib/ai-studio/contract';

/** Emekli: /admin/modules/ai-tones → Prompt ve Model Stüdyosu (sorgu parametreleri korunur). */
export default async function LegacyRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  permanentRedirect(legacyStudioHref('usluplar', await searchParams));
}
